import type * as ts from "typescript";

import type { TypeFunctionSignature, TypeInfo, TypeProperty, TypeTree } from "./types";
import { getDescendantAtRange } from "./get-ast-node";
import type { PrettifyOptions } from "../request";
import { getPositionForVue, isVueProgram } from "./vue";
import { displayParts, isKeyword } from "./display-parts-builder";
import { LRUCache } from "./lru-cache";

let typescript: typeof ts;
let checker: ts.TypeChecker;

const MAX_CACHE_SIZE = 256;
const typeTreeCache = new LRUCache<ts.Type, TypeTree>(MAX_CACHE_SIZE);

let options: PrettifyOptions = {
  hidePrivateProperties: true,
  maxDepth: 2,
  maxProperties: 100,
  maxSubProperties: 5,
  maxUnionMembers: 15,
  maxFunctionSignatures: 5,
  skippedTypeNames: [],
  unwrapArrays: true,
  unwrapFunctions: true,
  unwrapGenericArgumentsTypeNames: [],
};

/**
 * Get TypeInfo at a position in a source file
 */
export function getTypeInfoAtPosition(
  typescriptContext: typeof ts,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  position: number,
  prettifyOptions: PrettifyOptions,
  program: ts.Program,
  logger?: ts.server.Logger,
): TypeInfo | undefined {
  try {
    typescript = typescriptContext;
    checker = typeChecker;
    options = prettifyOptions;

    if (isVueProgram(program)) {
      position = getPositionForVue(program, sourceFile.fileName.replace(/\\/g, "/"), position);
    }

    const node = getDescendantAtRange(typescript, sourceFile, [position, position]);
    if (!node || node === sourceFile || !node.parent) return undefined;

    let symbol = typeChecker.getSymbolAtLocation(node);
    if (!symbol) return undefined;

    // Handle ImportSpecifier
    if (symbol.flags & typescript.SymbolFlags.Alias) {
      symbol = typeChecker.getAliasedSymbol(symbol);
    }

    let type = typeChecker.getTypeOfSymbolAtLocation(symbol, node);

    let syntaxKind = symbol?.declarations?.[0]?.kind ?? typescript.SyntaxKind.ConstKeyword;
    if (typescript.isVariableDeclaration(node.parent)) {
      syntaxKind = getVariableDeclarationKind(node.parent);
    }

    const name = symbol?.getName() ?? typeChecker.typeToString(type);

    // Display constructor information for classes being instantiated
    // Don't display constructor information for classes being extended, imported, or part of an import statement
    if (
      syntaxKind === typescript.SyntaxKind.ClassDeclaration && // Confirm the node is a class
      !typescript.isClassDeclaration(node.parent) && // Confirm the node is not part of a class definition
      !isPartOfImportStatement(node) && // Confirm the node is not part of an import statement
      type.getConstructSignatures().length > 0 // Confirm the class has a constructor
    ) {
      const declaration = getSyntaxKindDeclaration(typescript.SyntaxKind.Constructor, name);

      return {
        typeTree: getConstructorTypeInfo(type, typeChecker, name, logger),
        declaration,
        name,
      };
    }

    // If the symbol has a declared type, use that when available
    // Don't use declared type for variable declarations
    // TODO: Determine best method, check all or just the first
    // const shouldUseDeclaredType = symbol.declarations?.every(d => d.kind !== typescript.SyntaxKind.VariableDeclaration)
    const shouldUseDeclaredType = symbol.declarations?.[0]?.kind !== typescript.SyntaxKind.VariableDeclaration;
    const declaredType = typeChecker.getDeclaredTypeOfSymbol(symbol);

    if (declaredType.flags !== typescript.TypeFlags.Any && shouldUseDeclaredType) {
      type = declaredType;
    }

    const typeTree = getTypeTree(type, 0, new Set(), options.generateDisplayParts ?? false, logger);
    const declaration = getSyntaxKindDeclaration(syntaxKind, name);

    return {
      typeTree,
      declaration,
      name,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {
    return undefined;
  }
}

/**
 * Check if a node is part of an import statement
 * This function traverses the parent nodes of the given node
 * to determine if it is part of an import declaration, import specifier,
 * or import clause. It returns true if it finds any of these,
 * otherwise it returns false.
 */
function isPartOfImportStatement(node: ts.Node): boolean {
  while (node) {
    if (typescript.isImportDeclaration(node) || typescript.isImportSpecifier(node) || typescript.isImportClause(node)) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

/**
 * Get the variable declaration kind based on the parent node
 * This function checks the parent node of a VariableDeclaration to determine
 * whether it is declared with `let`, `const`, or `var`.
 * If the parent is not a VariableDeclarationList, it defaults to `const`.
 */
function getVariableDeclarationKind(node: ts.VariableDeclaration): number {
  const parent = node.parent;
  if (!typescript.isVariableDeclarationList(parent)) return typescript.SyntaxKind.ConstKeyword;

  if (parent.flags & typescript.NodeFlags.Let) {
    return typescript.SyntaxKind.LetKeyword;
  }

  if (parent.flags & typescript.NodeFlags.Const) {
    return typescript.SyntaxKind.ConstKeyword;
  }

  return typescript.SyntaxKind.VarKeyword;
}

/**
 * Get type information for a constructor type
 * This function extracts the constructor signature and its parameters,
 * then builds a TypeTree object representing the constructor type.
 */
function getConstructorTypeInfo(
  type: ts.Type,
  typeChecker: ts.TypeChecker,
  name: string,
  logger?: ts.server.Logger,
): TypeTree {
  const params = type.getConstructSignatures()[0]!.parameters;
  const paramTypes = params.map((p) => typeChecker.getTypeOfSymbol(p));
  const parameters = paramTypes.map((t, index) => {
    const declaration = params[index]?.declarations?.[0];
    const isRestParameter = Boolean(
      declaration && typescript.isParameter(declaration) && Boolean(declaration.dotDotDotToken),
    );
    const optional = Boolean(declaration && typescript.isParameter(declaration) && Boolean(declaration.questionToken));

    return {
      name: params[index]?.getName() ?? `param${index}`,
      isRestParameter,
      optional,
      type: getTypeTree(t, 0, new Set(), options.generateDisplayParts ?? false, logger),
    };
  });

  return {
    kind: "function",
    typeName: name,
    excessSignatures: 0,
    signatures: [
      {
        returnType: { kind: "reference", typeName: name },
        parameters,
      },
    ],
  };
}

/**
 * Safely checks if a type alias contains typeof expressions by examining the TypeScript AST.
 * Includes error boundaries to handle malformed or unexpected AST structures.
 */
function hasTypeofExpression(aliasSymbol: ts.Symbol, typeString: string): boolean {
  try {
    // Fast path: check if type string contains typeof.
    if (typeString.includes("typeof ")) {
      return true;
    }

    // Safe AST traversal with null checks.
    if (!aliasSymbol?.declarations?.length) {
      return false;
    }

    const declaration = aliasSymbol.declarations[0];
    if (!declaration || !typescript.isTypeAliasDeclaration(declaration) || !declaration.type) {
      return false;
    }

    // Direct typeof expression (e.g., type T = typeof someVariable).
    if (typescript.isTypeQueryNode(declaration.type)) {
      return true;
    }

    // Typeof in object properties (e.g., type T = { prop: typeof someFunction }).
    if (typescript.isTypeLiteralNode(declaration.type) && declaration.type.members) {
      try {
        return declaration.type.members.some((member) => {
          if (!member || !typescript.isPropertySignature(member) || !member.type) {
            return false;
          }
          return typescript.isTypeQueryNode(member.type);
        });
      } catch {
        return false;
      }
    }

    return false;
  } catch {
    // If AST traversal fails completely, fall back to string-based detection.
    // This ensures we don't break type expansion due to unexpected TypeScript structures.
    return typeString.includes("typeof ");
  }
}

/**
 * Determines if a type alias should be expanded or referenced by its name.
 * The goal is to expand simple, primitive-like aliases while keeping complex
 * object-like aliases as a reference to improve readability.
 */
function shouldExpandTypeAlias(type: ts.Type, checker: ts.TypeChecker, options: PrettifyOptions): boolean {
  const aliasSymbol = type.aliasSymbol;
  if (!aliasSymbol) return true;

  const aliasName = aliasSymbol.getName();

  // Get a preview of what the expansion would look like
  const typeString = checker.typeToString(
    type,
    undefined,
    typescript.TypeFormatFlags.NoTruncation | typescript.TypeFormatFlags.InTypeAlias,
  );

  // Special handling for typeof expressions - always expand them to show actual types.
  if (hasTypeofExpression(aliasSymbol, typeString)) {
    return true;
  }

  // Always expand simple primitive wrappers, function types, and arrays.
  // These provide no additional value as aliases and should be expanded for clarity.
  const isSimpleAlias =
    // Primitive types: string, number, boolean, etc.
    /^(string|number|boolean|bigint|symbol|void|null|undefined|any|unknown|never)$/.test(typeString) ||
    // Simple arrays: string[], number[], etc.
    /^\w+\[\]$/.test(typeString) ||
    // Simple function types with basic parameters.
    (typeString.includes("=>") && typeString.length < 100 && !typeString.includes("{")) ||
    // Template literals.
    typeString.startsWith("`") ||
    // Simple unions without objects.
    (typeString.includes(" | ") && !typeString.includes("{") && typeString.length < 150);

  if (isSimpleAlias) {
    return true;
  }

  // Skip expansion for certain built-in or library types.
  if (aliasName && aliasSymbol.declarations) {
    const isFromLibrary = aliasSymbol.declarations.some((d) => {
      const fileName = d.getSourceFile().fileName;
      return fileName.includes("node_modules") || fileName.endsWith(".d.ts") || fileName.includes("typescript/lib");
    });

    if (isFromLibrary) {
      return false;
    }
  }

  // Check if this is a complex nested type that would hit depth limits.
  if (options.maxDepth <= 1) {
    const complexityIndicators = (typeString.match(/[{}]/g) || []).length;
    const hasNestedObjects = typeString.includes("{ ") && typeString.includes(": {");
    const hasLargeObject = typeString.includes("{") && typeString.length > 200;

    if (complexityIndicators > 4 || hasNestedObjects || hasLargeObject) {
      return false;
    }
  }

  // If the alias name is very descriptive and the expansion would be very complex, preserve it.
  if (aliasName.length > 10 && typeString.length > 300) {
    return false;
  }

  // Default to expanding for backward compatibility and test expectations.
  return true;
}

/**
 * Recursively get type information by building a TypeTree object from the given type
 */
function getTypeTree(
  type: ts.Type,
  depth: number,
  visited: Set<ts.Type>,
  generateDisplayParts = false,
  logger?: ts.server.Logger,
): TypeTree {
  // Check cache first for performance
  const cached = typeTreeCache.get(type);
  if (cached !== undefined) {
    return cached;
  }

  // Helper to cache result
  const cacheAndReturn = (result: TypeTree): TypeTree => {
    // Cache the result for future lookups (LRU eviction handled automatically)
    typeTreeCache.set(type, result);
    return result;
  };

  // Check if this is a type alias and handle expansion/preservation
  if (type.aliasSymbol) {
    const shouldExpand = shouldExpandTypeAlias(type, checker, options);

    if (!shouldExpand) {
      // Preserve the alias
      const aliasNameStr = checker.typeToString(type, undefined, typescript.TypeFormatFlags.NoTruncation);
      const result: TypeTree = {
        kind: "reference",
        typeName: aliasNameStr,
      };

      if (generateDisplayParts) {
        try {
          result.displayParts = generateReferenceDisplayParts(type, aliasNameStr);
        } catch (error) {
          if (logger) {
            logger.info(`[prettify-ts] Failed to generate display parts for alias ${aliasNameStr}: ${String(error)}`);
          }
          result.displayParts = [displayParts.text(aliasNameStr)];
        }
      }

      return cacheAndReturn(result);
    }
  }

  const typeName = checker.typeToString(type, undefined, typescript.TypeFormatFlags.NoTruncation);
  const apparentType = checker.getApparentType(type);

  if (depth >= options.maxDepth) {
    generateDisplayParts = false;
  }

  // Primitive types
  const baseConstraintType = checker.getBaseConstraintOfType(type);
  if (
    isPrimitiveType(type) ||
    isPrimitiveType(apparentType) ||
    (baseConstraintType && isPrimitiveType(baseConstraintType))
  ) {
    const result: TypeTree = { kind: "primitive", typeName };

    if (generateDisplayParts) {
      try {
        // Check for literal types
        const typeFlags = type.getFlags();

        if (typeFlags & typescript.TypeFlags.StringLiteral) {
          result.displayParts = [displayParts.stringLiteral(typeName)];
        } else if (typeFlags & typescript.TypeFlags.NumberLiteral) {
          result.displayParts = [displayParts.numericLiteral(typeName)];
        } else if (isKeyword(typeName)) {
          result.displayParts = [displayParts.keyword(typeName)];
        } else {
          result.displayParts = [displayParts.text(typeName)];
        }
      } catch (error) {
        if (logger) {
          logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
        }
        result.displayParts = [displayParts.text(typeName)];
      }
    }

    return cacheAndReturn(result);
  }

  // Skipped type names
  if (options.skippedTypeNames.includes(typeName)) {
    const result: TypeTree = { kind: "reference", typeName };

    if (generateDisplayParts) {
      try {
        result.displayParts = generateReferenceDisplayParts(type, typeName);
      } catch (error) {
        if (logger) {
          logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
        }
        result.displayParts = [displayParts.text(typeName)];
      }
    }

    return cacheAndReturn(result);
  }

  // Prevent infinite recursion when encountering circular references
  if (visited.has(type)) {
    if (typeName.includes("{") || typeName.includes("[") || typeName.includes("(")) {
      const result: TypeTree = { kind: "reference", typeName: "..." };

      if (generateDisplayParts) {
        result.displayParts = [displayParts.punctuation("...")];
      }

      return cacheAndReturn(result);
    }

    const refTypeName = checker.typeToString(apparentType, undefined, typescript.TypeFormatFlags.NoTruncation);
    const result: TypeTree = { kind: "reference", typeName: refTypeName };

    if (generateDisplayParts) {
      try {
        result.displayParts = generateReferenceDisplayParts(apparentType, refTypeName);
      } catch (error) {
        if (logger) {
          logger.info(`[prettify-ts] Failed to generate display parts for ${refTypeName}: ${String(error)}`);
        }
        result.displayParts = [displayParts.text(refTypeName)];
      }
    }
    return cacheAndReturn(result);
  }

  visited.add(type);

  // Unions
  if (apparentType.isUnion()) {
    const excessMembers = Math.max(0, apparentType.types.length - options.maxUnionMembers);
    const types = apparentType.types
      .slice(0, options.maxUnionMembers)
      .sort(sortUnionTypes)
      .map((t) => getTypeTree(t, depth, new Set(visited), generateDisplayParts, logger));

    const result: TypeTree = { kind: "union", typeName, excessMembers, types };

    if (generateDisplayParts) {
      try {
        const parts: ts.SymbolDisplayPart[] = [];

        for (let i = 0; i < types.length; i++) {
          if (i > 0) {
            parts.push(displayParts.space());
            parts.push(displayParts.operator("|"));
            parts.push(displayParts.space());
          }

          const currentType = types[i];
          if (currentType?.displayParts) {
            parts.push(...currentType.displayParts);
          } else if (currentType) {
            parts.push(displayParts.text(currentType.typeName));
          }
        }

        if (excessMembers > 0) {
          parts.push(displayParts.space());
          parts.push(displayParts.operator("|"));
          parts.push(displayParts.space());
          parts.push(displayParts.punctuation("..."));
        }
        result.displayParts = parts;
      } catch (error) {
        if (logger) {
          logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
        }
        result.displayParts = [displayParts.text(typeName)];
      }
    }

    return cacheAndReturn(result);
  }

  // Enums
  if (type?.symbol?.flags & typescript.SymbolFlags.EnumMember && (type.symbol as any).parent) {
    const parentSymbol = (type.symbol as any).parent;
    const memberName = `${parentSymbol.name}.${type.symbol.name}`;
    const result: TypeTree = { kind: "enum", typeName, member: memberName };

    if (generateDisplayParts) {
      try {
        result.displayParts = [displayParts.enumMember(memberName)];
      } catch (error) {
        if (logger) {
          logger.info(`[prettify-ts] Failed to generate display parts for ${memberName}: ${String(error)}`);
        }
        result.displayParts = [displayParts.text(memberName)];
      }
    }

    return cacheAndReturn(result);
  }

  // Functions (including typeof function expressions)
  const callSignatures = apparentType.getCallSignatures();
  if (callSignatures.length > 0) {
    if (!options.unwrapFunctions) {
      depth = options.maxDepth;
    }

    const functionSignatures: TypeFunctionSignature[] = callSignatures
      .slice(0, options.maxFunctionSignatures)
      .map((signature) => {
        const returnType = getTypeTree(
          checker.getReturnTypeOfSignature(signature),
          depth,
          new Set(visited),
          generateDisplayParts,
          logger,
        );

        const parameters = signature.parameters.map((symbol) => {
          const declaration = symbol.declarations?.[0];
          const isRestParameter = Boolean(
            declaration && typescript.isParameter(declaration) && Boolean(declaration.dotDotDotToken),
          );
          const optional = Boolean(
            declaration && typescript.isParameter(declaration) && Boolean(declaration.questionToken),
          );

          return {
            name: symbol.getName(),
            isRestParameter,
            optional,
            type: getTypeTree(checker.getTypeOfSymbol(symbol), depth, new Set(visited), generateDisplayParts, logger),
          };
        });

        return { returnType, parameters };
      });

    // If there are more signatures than the max allowed, count them as excess
    const excessSignatures = Math.max(0, callSignatures.length - options.maxFunctionSignatures);

    const result: TypeTree = { kind: "function", excessSignatures, typeName, signatures: functionSignatures };

    if (generateDisplayParts) {
      try {
        const parts: ts.SymbolDisplayPart[] = [];

        // For multiple signatures, just show the first one
        const sig = functionSignatures[0];
        if (sig) {
          // Parameters
          parts.push(displayParts.punctuation("("));
          for (let i = 0; i < sig.parameters.length; i++) {
            if (i > 0) {
              parts.push(displayParts.punctuation(","));
              parts.push(displayParts.space());
            }

            const param = sig.parameters[i];
            if (param) {
              if (param.isRestParameter) {
                parts.push(displayParts.punctuation("..."));
              }
              parts.push(displayParts.parameterName(String(param.name ?? "")));
              if (param.optional) {
                parts.push(displayParts.punctuation("?"));
              }
              parts.push(displayParts.punctuation(":"));
              parts.push(displayParts.space());

              if (param.type.displayParts && isSymbolDisplayPartArray(param.type.displayParts)) {
                parts.push(...param.type.displayParts);
              } else if (param.type.typeName) {
                parts.push(displayParts.text(String(param.type.typeName ?? "")));
              }
            }
          }
          parts.push(displayParts.punctuation(")"));

          // Arrow
          parts.push(displayParts.space());
          parts.push(displayParts.operator("=>"));
          parts.push(displayParts.space());

          // Return type
          if (sig.returnType.displayParts && isSymbolDisplayPartArray(sig.returnType.displayParts)) {
            parts.push(...sig.returnType.displayParts);
          } else if (sig.returnType.typeName) {
            parts.push(displayParts.text(String(sig.returnType.typeName ?? "")));
          }
        }

        result.displayParts = parts;
      } catch (error) {
        if (logger) {
          logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
        }
        result.displayParts = [displayParts.text(typeName)];
      }
    }

    return cacheAndReturn(result);
  }

  // Tuples
  if (isTupleTypeReference(apparentType)) {
    const readonly = apparentType.target?.readonly ?? false;
    const elementTypes = checker
      .getTypeArguments(apparentType)
      .map((t) => getTypeTree(t, depth, new Set(visited), generateDisplayParts, logger));

    const result: TypeTree = { kind: "tuple", typeName, readonly, elementTypes };

    if (generateDisplayParts) {
      try {
        const parts: ts.SymbolDisplayPart[] = [];
        if (readonly) {
          parts.push(displayParts.keyword("readonly"));
          parts.push(displayParts.space());
        }
        parts.push(displayParts.punctuation("["));

        for (let i = 0; i < elementTypes.length; i++) {
          if (i > 0) {
            parts.push(displayParts.punctuation(","));
            parts.push(displayParts.space());
          }

          const elementType = elementTypes[i];
          if (elementType?.displayParts) {
            parts.push(...elementType.displayParts);
          } else if (elementType) {
            parts.push(displayParts.text(elementType.typeName));
          }
        }

        parts.push(displayParts.punctuation("]"));
        result.displayParts = parts;
      } catch (error) {
        if (logger) {
          logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
        }
        result.displayParts = [displayParts.text(typeName)];
      }
    }

    return cacheAndReturn(result);
  }

  // Arrays
  if (checker.isArrayType(apparentType)) {
    if (!options.unwrapArrays) {
      depth = options.maxDepth;
    }

    const arrayType = isTypeReference(apparentType) ? checker.getTypeArguments(apparentType)[0] : undefined;
    const elementType: TypeTree = arrayType
      ? getTypeTree(arrayType, depth, new Set(visited), generateDisplayParts, logger)
      : { kind: "primitive", typeName: "any" };

    const readonly = apparentType.getSymbol()?.getName() === "ReadonlyArray";
    const result: TypeTree = { kind: "array", typeName, readonly, elementType };

    if (generateDisplayParts) {
      try {
        const parts: ts.SymbolDisplayPart[] = [];

        if (readonly) {
          parts.push(displayParts.keyword("readonly"));
          parts.push(displayParts.space());
        }

        if (elementType.displayParts) {
          parts.push(...elementType.displayParts);
        } else {
          parts.push(displayParts.text(elementType.typeName));
        }

        parts.push(displayParts.punctuation("["));
        parts.push(displayParts.punctuation("]"));

        result.displayParts = parts;
      } catch (error) {
        if (logger) {
          logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
        }
        result.displayParts = [displayParts.text(typeName)];
      }
    }

    return cacheAndReturn(result);
  }

  // Generics
  const typeIsReference = isTypeReference(type);
  const typeArguments = typeIsReference ? checker.getTypeArguments(type) : [];

  if (typeIsReference && typeArguments.length > 0) {
    // Get the target type name without generic parameters
    // Ex: Promise<T> => Promise
    const fullTargetTypeName = checker.typeToString(type.target, undefined, typescript.TypeFormatFlags.NoTruncation);
    const targetTypeName = fullTargetTypeName.split("<")[0]?.trim() ?? fullTargetTypeName; // Remove generic parameters from the type name

    // Skip generic types that are in the skippedTypeNames list, using ellipsis to indicate generic parameters
    if (options.skippedTypeNames.includes(targetTypeName)) {
      const result: TypeTree = { kind: "reference", typeName: `${targetTypeName}<...>` };

      if (generateDisplayParts) {
        try {
          const parts: ts.SymbolDisplayPart[] = [];
          parts.push(displayParts.text(targetTypeName));
          parts.push(displayParts.punctuation("<"));
          parts.push(displayParts.punctuation("..."));
          parts.push(displayParts.punctuation(">"));
          result.displayParts = parts;
        } catch (error) {
          if (logger) {
            logger.info(`[prettify-ts] Failed to generate display parts for ${result.typeName}: ${String(error)}`);
          }
          result.displayParts = [displayParts.text(result.typeName)];
        }
      }

      return cacheAndReturn(result);
    }

    if (options.unwrapGenericArgumentsTypeNames.includes(targetTypeName)) {
      const typeArgs = typeArguments.map((argument) =>
        getTypeTree(argument, depth, new Set(visited), generateDisplayParts, logger),
      );

      const result: TypeTree = { kind: "generic", typeName: targetTypeName, arguments: typeArgs };

      if (generateDisplayParts) {
        try {
          const parts: ts.SymbolDisplayPart[] = [];

          // Add the generic type name
          if (isKeyword(targetTypeName)) {
            parts.push(displayParts.keyword(targetTypeName));
          } else {
            // Try to get proper semantic classification for the type name
            const symbol = type.target?.getSymbol();
            if (symbol) {
              if (symbol.flags & typescript.SymbolFlags.Class) {
                parts.push(displayParts.className(targetTypeName));
              } else if (symbol.flags & typescript.SymbolFlags.Interface) {
                parts.push(displayParts.interfaceName(targetTypeName));
              } else if (symbol.flags & typescript.SymbolFlags.TypeAlias) {
                parts.push(displayParts.aliasName(targetTypeName));
              } else {
                parts.push(displayParts.text(targetTypeName));
              }
            } else {
              parts.push(displayParts.text(targetTypeName));
            }
          }

          // Add generic arguments
          parts.push(displayParts.punctuation("<"));

          for (let i = 0; i < typeArgs.length; i++) {
            if (i > 0) {
              parts.push(displayParts.punctuation(","));
              parts.push(displayParts.space());
            }

            const arg = typeArgs[i];
            if (arg?.displayParts) {
              parts.push(...arg.displayParts);
            } else if (arg) {
              parts.push(displayParts.text(arg.typeName));
            }
          }

          parts.push(displayParts.punctuation(">"));
          result.displayParts = parts;
        } catch (error) {
          if (logger) {
            logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
          }
          result.displayParts = [displayParts.text(typeName)];
        }
      }

      return cacheAndReturn(result);
    }
  }

  // Object
  if (
    apparentType.isClassOrInterface() ||
    apparentType.flags & typescript.TypeFlags.Object ||
    apparentType.getProperties().length > 0
  ) {
    // Resolve how many properties to show based on the maxProperties option
    const depthMaxProps = depth >= 1 ? options.maxSubProperties : options.maxProperties;

    let typeProperties = apparentType.getProperties();
    if (options.hidePrivateProperties) {
      typeProperties = typeProperties.filter((symbol) => isPublicProperty(symbol));
    }

    let indexSignatures = checker.getIndexInfosOfType(apparentType);

    if (depth >= options.maxDepth) {
      // If we've reached the max depth and has a type alias, check if we should still expand it
      // Type aliases should generally be expanded to show their actual structure
      const isTypeAlias = type.aliasSymbol !== undefined;

      // If this is not a type alias and doesn't include "{", return as reference
      // But if it IS a type alias, continue to expand it even at maxDepth
      if (!typeName.includes("{") && !isTypeAlias) {
        const result: TypeTree = {
          kind: "reference",
          typeName,
        };

        if (generateDisplayParts) {
          try {
            result.displayParts = generateReferenceDisplayParts(type, typeName);
          } catch (error) {
            if (logger) {
              logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
            }
            result.displayParts = [displayParts.text(typeName)];
          }
        }

        return cacheAndReturn(result);
      }

      // Return all properties as excess to avoid deeper nesting
      // BUT: If this is a type alias (already checked above), allow it to expand its properties
      if (!isTypeAlias) {
        const excessProperties = typeProperties.length + indexSignatures.length;

        const result: TypeTree = {
          kind: "object",
          typeName,
          properties: [],
          excessProperties,
        };

        if (generateDisplayParts) {
          try {
            // Show object with ellipsis for excess properties
            result.displayParts = [
              displayParts.punctuation("{"),
              displayParts.space(),
              displayParts.punctuation("..."),
              displayParts.space(),
              displayParts.punctuation("}"),
            ];
          } catch (error) {
            if (logger) {
              logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
            }
            result.displayParts = [displayParts.text(typeName)];
          }
        }

        return cacheAndReturn(result);
      }
    }

    // Track how many properties are being cut off from the maxProperties option
    const excessProperties = Math.max(0, typeProperties.length + indexSignatures.length - depthMaxProps);
    indexSignatures = indexSignatures.slice(0, depthMaxProps);
    typeProperties = typeProperties.slice(0, Math.max(0, depthMaxProps - indexSignatures.length));

    // Track properties to be displayed
    const properties: TypeProperty[] = [];

    // Index signatures displayed first
    for (const indexSignature of indexSignatures) {
      // Add index signatures as properties
      const indexIdentifierName = indexSignature.declaration?.parameters[0]?.name?.getText() ?? "key";
      const indexType = checker.typeToString(
        indexSignature.keyType,
        undefined,
        typescript.TypeFormatFlags.NoTruncation,
      );

      properties.push({
        name: `[${indexIdentifierName}: ${indexType}]`,
        optional: false,
        readonly: indexSignature.isReadonly,
        type: getTypeTree(indexSignature.type, depth + 1, new Set(visited), generateDisplayParts, logger),
      });
    }

    for (const symbol of typeProperties) {
      const propertyType = checker.getTypeOfSymbol(symbol);

      properties.push({
        name: symbol.getName(),
        optional: isOptional(symbol),
        readonly: isReadOnly(symbol),
        type: getTypeTree(propertyType, depth + 1, new Set(visited), generateDisplayParts, logger), // Add depth for sub-properties
      });
    }

    const result: TypeTree = { kind: "object", typeName, properties, excessProperties: Math.max(0, excessProperties) };

    if (generateDisplayParts) {
      try {
        if (properties.length > 0) {
          result.displayParts = generateObjectDisplayParts(properties);
        } else {
          // Empty object
          result.displayParts = [displayParts.punctuation("{"), displayParts.space(), displayParts.punctuation("}")];
        }
      } catch (error) {
        if (logger) {
          logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
        }
        result.displayParts = [displayParts.text(typeName)];
      }
    }

    return cacheAndReturn(result);
  }

  const result: TypeTree = { kind: "reference", typeName };

  if (generateDisplayParts) {
    try {
      result.displayParts = generateReferenceDisplayParts(type, typeName);
    } catch (error) {
      if (logger) {
        logger.info(`[prettify-ts] Failed to generate display parts for ${typeName}: ${String(error)}`);
      }
      result.displayParts = [displayParts.text(typeName)];
    }
  }

  return cacheAndReturn(result);
}

/**
 * Check if a type is a primitive type
 */
function isPrimitiveType(type: ts.Type): boolean {
  const typeFlags = type.flags;

  if (typeFlags & typescript.TypeFlags.EnumLike) return false;

  return Boolean(
    typeFlags & typescript.TypeFlags.String ||
      typeFlags & typescript.TypeFlags.StringLiteral ||
      typeFlags & typescript.TypeFlags.TemplateLiteral ||
      typeFlags & typescript.TypeFlags.Number ||
      typeFlags & typescript.TypeFlags.NumberLiteral ||
      typeFlags & typescript.TypeFlags.Boolean ||
      typeFlags & typescript.TypeFlags.BooleanLike ||
      typeFlags & typescript.TypeFlags.BooleanLiteral ||
      typeFlags & typescript.TypeFlags.Undefined ||
      typeFlags & typescript.TypeFlags.Null ||
      typeFlags & typescript.TypeFlags.Void ||
      typeFlags & typescript.TypeFlags.BigInt ||
      typeFlags & typescript.TypeFlags.BigIntLiteral ||
      typeFlags & typescript.TypeFlags.ESSymbol ||
      typeFlags & typescript.TypeFlags.UniqueESSymbol ||
      typeFlags & typescript.TypeFlags.Never ||
      typeFlags & typescript.TypeFlags.Unknown ||
      typeFlags & typescript.TypeFlags.Any,
  );
}

/**
 * Get the intrinsic name of a type if it has one
 */
function getIntrinsicName(type: ts.Type): string {
  // Check for string, number, bigint, boolean, symbol, null, undefined
  if (type.flags & typescript.TypeFlags.String) return "string";
  if (type.flags & typescript.TypeFlags.Number) return "number";
  if (type.flags & typescript.TypeFlags.BigInt) return "bigint";
  if (type.flags & typescript.TypeFlags.Boolean) return "boolean";
  if (type.flags & typescript.TypeFlags.ESSymbol) return "symbol";
  if (type.flags & typescript.TypeFlags.Null) return "null";
  if (type.flags & typescript.TypeFlags.Undefined) return "undefined";
  if (type.flags & typescript.TypeFlags.Void) return "void";
  return "";
}

/**
 * Sort union types by intrinsic types order, following ts quick info order
 * Ex.
 * string, number, bigint, { a: string }, null, undefined
 */
function sortUnionTypes(a: ts.Type, b: ts.Type): number {
  const primitiveTypesOrder = ["string", "number", "bigint", "boolean", "symbol"];
  const falsyTypesOrder = ["null", "undefined"];

  const aIntrinsicName = getIntrinsicName(a);
  const bIntrinsicName = getIntrinsicName(b);

  const aPrimitiveIndex = primitiveTypesOrder.indexOf(aIntrinsicName);
  const bPrimitiveIndex = primitiveTypesOrder.indexOf(bIntrinsicName);
  const aFalsyIndex = falsyTypesOrder.indexOf(aIntrinsicName);
  const bFalsyIndex = falsyTypesOrder.indexOf(bIntrinsicName);

  // If both types are primitive, sort based on the order in primitiveTypesOrder
  if (aPrimitiveIndex !== -1 && bPrimitiveIndex !== -1) {
    return aPrimitiveIndex - bPrimitiveIndex;
  }

  // If one type is primitive and the other is not, the primitive type should come first
  if (aPrimitiveIndex !== -1) {
    return -1;
  }

  if (bPrimitiveIndex !== -1) {
    return 1;
  }

  // If both types are falsy, sort based on the order in falsyTypesOrder
  if (aFalsyIndex !== -1 && bFalsyIndex !== -1) {
    return aFalsyIndex - bFalsyIndex;
  }

  // If one type is falsy and the other is not, the falsy type should come last
  if (aFalsyIndex !== -1) {
    return 1;
  }
  if (bFalsyIndex !== -1) {
    return -1;
  }

  // If neither type is primitive or falsy, maintain the original order
  return 0;
}

/**
 * Check if an object property is public
 */
function isPublicProperty(symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations();
  if (!declarations) return true;

  const name = symbol.getName();
  if (name.startsWith("_") || name.startsWith("#")) return false;

  return declarations.every((declaration) => {
    if (
      !(
        typescript.isMethodDeclaration(declaration) ||
        typescript.isMethodSignature(declaration) ||
        typescript.isPropertyDeclaration(declaration) ||
        typescript.isPropertySignature(declaration)
      )
    )
      return true;

    const modifiers = declaration.modifiers ?? [];
    const hasPrivateOrProtectedModifier = modifiers.some((modifier) => {
      return (
        modifier.kind === typescript.SyntaxKind.PrivateKeyword ||
        modifier.kind === typescript.SyntaxKind.ProtectedKeyword
      );
    });

    return !hasPrivateOrProtectedModifier;
  });
}

/**
 * Type guard to check if a type is a TypeReference type (generic type)
 */
function isTypeReference(type: ts.Type): type is ts.TypeReference {
  return "target" in type && type.target !== undefined;
}

/**
 * Type guard to check if a type is a TupleTypeReference
 */
function isTupleTypeReference(type: ts.Type): type is ts.TupleTypeReference {
  return checker.isTupleType(type) && isTypeReference(type);
}

/**
 * Type guard to safely check if an array contains SymbolDisplayPart objects
 */
function isSymbolDisplayPartArray(arr: unknown): arr is ts.SymbolDisplayPart[] {
  return (
    Array.isArray(arr) &&
    arr.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "text" in item &&
        "kind" in item &&
        typeof item.text === "string" &&
        typeof item.kind === "string",
    )
  );
}

/**
 * Check if an object property is readonly
 */
function isReadOnly(symbol: ts.Symbol | undefined): boolean {
  if (!symbol) return false;

  const declarations = symbol.getDeclarations();
  if (!declarations) return false;

  return declarations.some((declaration) => {
    if (
      typescript.isPropertyDeclaration(declaration) ||
      typescript.isPropertySignature(declaration) ||
      typescript.isGetAccessor(declaration) ||
      typescript.isSetAccessor(declaration) ||
      typescript.isParameter(declaration)
    ) {
      return declaration.modifiers?.some((modifier) => modifier.kind === typescript.SyntaxKind.ReadonlyKeyword);
    }

    return false;
  });
}

/**
 * Check if an object property is optional
 */
function isOptional(symbol: ts.Symbol | undefined): boolean {
  if (!symbol) return false;

  const declarations = symbol.getDeclarations();
  if (!declarations) return false;

  return declarations.some(
    (declaration) =>
      (typescript.isPropertySignature(declaration) || typescript.isPropertyDeclaration(declaration)) &&
      Boolean(declaration.questionToken),
  );
}

/**
 * Builds a declaration string based on the syntax kind
 */
export function getSyntaxKindDeclaration(syntaxKind: ts.SyntaxKind, typeName: string): string {
  const SyntaxKind = typescript.SyntaxKind;

  // Handle imported types
  if (typeName.startsWith('"') && typeName.endsWith('"')) {
    const shortenedTypeName = typeName.replace(/"/g, "").split("node_modules/").pop()!;
    const finalTypeName = `"${shortenedTypeName}"`;

    return `typeof import(${finalTypeName}): `;
  }

  switch (syntaxKind) {
    case SyntaxKind.ClassDeclaration:
    case SyntaxKind.NewExpression:
      return `class ${typeName} `;

    case SyntaxKind.ExpressionWithTypeArguments:
    case SyntaxKind.InterfaceDeclaration:
    case SyntaxKind.QualifiedName:
      return `interface ${typeName} `;

    case SyntaxKind.ArrayType:
    case SyntaxKind.ConstructorType:
    case SyntaxKind.ConstructSignature:
    case SyntaxKind.EnumDeclaration:
    case SyntaxKind.FunctionType:
    case SyntaxKind.IndexedAccessType:
    case SyntaxKind.IndexSignature:
    case SyntaxKind.IntersectionType:
    case SyntaxKind.MappedType:
    case SyntaxKind.PropertySignature:
    case SyntaxKind.ThisType:
    case SyntaxKind.TupleType:
    case SyntaxKind.TypeAliasDeclaration:
    case SyntaxKind.TypeAssertionExpression:
    case SyntaxKind.TypeLiteral:
    case SyntaxKind.TypeOperator:
    case SyntaxKind.TypePredicate:
    case SyntaxKind.TypeQuery:
    case SyntaxKind.TypeReference:
    case SyntaxKind.UnionType:
      return `type ${typeName} = `;

    case SyntaxKind.FunctionDeclaration:
    case SyntaxKind.FunctionKeyword:
    case SyntaxKind.MethodDeclaration:
    case SyntaxKind.MethodSignature:
    case SyntaxKind.GetAccessor:
    case SyntaxKind.SetAccessor:
    case SyntaxKind.Constructor:
      return `function ${typeName}`;

    case SyntaxKind.LetKeyword:
      return `let ${typeName}: `;

    case SyntaxKind.VarKeyword:
      return `var ${typeName}: `;

    default:
      return `const ${typeName}: `;
  }
}

/**
 * Generate display parts for object type properties
 */
function generateObjectDisplayParts(properties: TypeProperty[]): ts.SymbolDisplayPart[] {
  const parts: ts.SymbolDisplayPart[] = [];

  parts.push(displayParts.punctuation("{"));
  parts.push(displayParts.space());

  for (let i = 0; i < properties.length; i++) {
    if (i > 0) {
      parts.push(displayParts.punctuation(";"));
      parts.push(displayParts.space());
    }

    const prop = properties[i];
    if (prop) {
      if (prop.readonly) {
        parts.push(displayParts.keyword("readonly"));
        parts.push(displayParts.space());
      }

      parts.push(displayParts.propertyName(prop.name));
      if (prop.optional) {
        parts.push(displayParts.punctuation("?"));
      }
      parts.push(displayParts.punctuation(":"));
      parts.push(displayParts.space());

      if (prop.type.displayParts) {
        parts.push(...prop.type.displayParts);
      } else {
        parts.push(displayParts.text(prop.type.typeName));
      }
    }
  }

  parts.push(displayParts.space());
  parts.push(displayParts.punctuation("}"));

  return parts;
}

// Export the converter functions
export { typeTreeToDisplayParts, hasDisplayParts } from "./type-tree-to-display-parts";
export { displayParts, isKeyword, createTypeReferenceDisplayParts, concatDisplayParts } from "./display-parts-builder";

/**
 * Generate display parts for a reference type based on its symbol information
 */
function generateReferenceDisplayParts(type: ts.Type, typeName: string): ts.SymbolDisplayPart[] {
  try {
    const symbol = type.getSymbol();

    if (symbol) {
      // Check symbol flags for classification
      if (symbol.flags & typescript.SymbolFlags.Class) {
        return [displayParts.className(symbol.name)];
      }
      if (symbol.flags & typescript.SymbolFlags.Interface) {
        return [displayParts.interfaceName(symbol.name)];
      }
      if (symbol.flags & typescript.SymbolFlags.TypeAlias) {
        return [displayParts.aliasName(symbol.name)];
      }
      if (symbol.flags & typescript.SymbolFlags.Enum) {
        return [displayParts.enumName(symbol.name)];
      }
      if (symbol.flags & typescript.SymbolFlags.TypeParameter) {
        return [displayParts.typeParameter(symbol.name)];
      }
      if (symbol.flags & typescript.SymbolFlags.Module) {
        return [displayParts.moduleName(symbol.name)];
      }
      if (symbol.flags & typescript.SymbolFlags.Function) {
        return [displayParts.functionName(symbol.name)];
      }
      if (symbol.flags & typescript.SymbolFlags.Method) {
        return [displayParts.methodName(symbol.name)];
      }
    }
    // Fallback to checking if it's a keyword or plain text
    return [isKeyword(typeName) ? displayParts.keyword(typeName) : displayParts.text(typeName)];
  } catch {
    return [displayParts.text(typeName)];
  }
}
