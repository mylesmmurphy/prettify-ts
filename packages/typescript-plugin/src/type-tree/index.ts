import type * as ts from "typescript";

import type { TypeFunctionSignature, TypeInfo, TypeProperty, TypeTree } from "./types";
import { getDescendantAtRange } from "./get-ast-node";
import type { PrettifyOptions } from "../request";
import { getPositionForVue, isVueProgram } from "./vue";

let typescript: typeof ts;
let checker: ts.TypeChecker;

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
  projectName: string,
): TypeInfo | undefined {
  try {
    typescript = typescriptContext;
    checker = typeChecker;
    options = prettifyOptions;

    if (isVueProgram(program)) {
      position = getPositionForVue(
        {
          projectName,
          program,
          typeChecker,
          ts: typescriptContext,
          sourceFile,
        },
        sourceFile.fileName.replace(/\\/g, "/"),
        position,
      );
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
        typeTree: getConstructorTypeInfo(type, typeChecker, name),
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

    const typeTree = getTypeTree(type, 0, new Set());

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
function getConstructorTypeInfo(type: ts.Type, typeChecker: ts.TypeChecker, name: string): TypeTree {
  const params = type.getConstructSignatures()[0]!.parameters;
  const paramTypes = params.map((p) => typeChecker.getTypeOfSymbol(p));
  const parameters = paramTypes.map((t, index) => {
    const declaration = params[index]?.declarations?.[0];
    const isRestParameter = Boolean(declaration && typescript.isParameter(declaration) && !!declaration.dotDotDotToken);
    const optional = Boolean(declaration && typescript.isParameter(declaration) && !!declaration.questionToken);

    return {
      name: params[index]?.getName() ?? `param${index}`,
      isRestParameter,
      optional,
      type: getTypeTree(t, 0, new Set()),
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
 * Recursively get type information by building a TypeTree object from the given type
 */
function getTypeTree(type: ts.Type, depth: number, visited: Set<ts.Type>): TypeTree {
  const typeName = checker.typeToString(type, undefined, typescript.TypeFormatFlags.NoTruncation);
  const apparentType = checker.getApparentType(type);

  // Primitive types
  const baseConstraintType = checker.getBaseConstraintOfType(type);
  if (
    isPrimitiveType(type) ||
    isPrimitiveType(apparentType) ||
    (baseConstraintType && isPrimitiveType(baseConstraintType))
  ) {
    return {
      kind: "primitive",
      typeName,
    };
  }

  // Skipped type names
  if (options.skippedTypeNames.includes(typeName)) {
    return {
      kind: "reference",
      typeName,
    };
  }

  // Prevent infinite recursion when encountering circular references
  if (visited.has(type)) {
    if (typeName.includes("{") || typeName.includes("[") || typeName.includes("(")) {
      return {
        kind: "reference",
        typeName: "...",
      };
    }

    return {
      kind: "reference",
      typeName: checker.typeToString(apparentType, undefined, typescript.TypeFormatFlags.NoTruncation),
    };
  }

  visited.add(type);

  // Unions
  if (apparentType.isUnion()) {
    const excessMembers = Math.max(0, apparentType.types.length - options.maxUnionMembers);
    const types = apparentType.types
      .slice(0, options.maxUnionMembers)
      .sort(sortUnionTypes)
      .map((t) => getTypeTree(t, depth, new Set(visited)));

    return {
      kind: "union",
      typeName,
      excessMembers,
      types,
    };
  }

  // Enums
  if (type?.symbol?.flags & typescript.SymbolFlags.EnumMember && type.symbol.parent) {
    return {
      kind: "enum",
      typeName,
      member: `${type.symbol.parent.name}.${type.symbol.name}`,
    };
  }

  // Functions
  const callSignatures = apparentType.getCallSignatures();
  if (callSignatures.length > 0) {
    if (!options.unwrapFunctions) {
      depth = options.maxDepth;
    }

    const signatures: TypeFunctionSignature[] = callSignatures
      .slice(0, options.maxFunctionSignatures)
      .map((signature) => {
        const returnType = getTypeTree(checker.getReturnTypeOfSignature(signature), depth, new Set(visited));
        const parameters = signature.parameters.map((symbol) => {
          const declaration = symbol.declarations?.[0];
          const isRestParameter = Boolean(
            declaration && typescript.isParameter(declaration) && !!declaration.dotDotDotToken,
          );
          const optional = Boolean(declaration && typescript.isParameter(declaration) && !!declaration.questionToken);

          return {
            name: symbol.getName(),
            isRestParameter,
            optional,
            type: getTypeTree(checker.getTypeOfSymbol(symbol), depth, new Set(visited)),
          };
        });

        return { returnType, parameters };
      });

    // If there are more signatures than the max allowed, count them as excess
    const excessSignatures = Math.max(0, callSignatures.length - options.maxFunctionSignatures);

    return {
      kind: "function",
      excessSignatures,
      typeName,
      signatures,
    };
  }

  // Tuples
  if (checker.isTupleType(apparentType)) {
    const readonly = (apparentType as ts.TupleTypeReference)?.target?.readonly ?? false;
    const elementTypes = checker
      .getTypeArguments(apparentType as ts.TupleTypeReference)
      .map((t) => getTypeTree(t, depth, new Set(visited)));

    return {
      kind: "tuple",
      typeName,
      readonly,
      elementTypes,
    };
  }

  // Arrays
  if (checker.isArrayType(apparentType)) {
    if (!options.unwrapArrays) {
      depth = options.maxDepth;
    }

    const arrayType = checker.getTypeArguments(apparentType as ts.TypeReference)[0];
    const elementType: TypeTree = arrayType
      ? getTypeTree(arrayType, depth, new Set(visited))
      : { kind: "primitive", typeName: "any" };

    return {
      kind: "array",
      typeName,
      readonly: apparentType.getSymbol()?.getName() === "ReadonlyArray",
      elementType,
    };
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
      return {
        kind: "reference",
        typeName: `${targetTypeName}<...>`,
      };
    }

    if (options.unwrapGenericArgumentsTypeNames.includes(targetTypeName))
      return {
        kind: "generic",
        typeName: targetTypeName,
        arguments: typeArguments.map((argument) => getTypeTree(argument, depth, new Set(visited))),
      };
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
      // If we've reached the max depth and has a type alias, return it as a reference type
      // Otherwise, return an object with the properties count
      // Example: { ... 3 more } or A & B
      if (!typeName.includes("{"))
        return {
          kind: "reference",
          typeName,
        };

      // Return all properties as excess to avoid deeper nesting
      const excessProperties = typeProperties.length + indexSignatures.length;

      return {
        kind: "object",
        typeName,
        properties: [],
        excessProperties,
      };
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
        type: getTypeTree(indexSignature.type, depth + 1, new Set(visited)),
      });
    }

    for (const symbol of typeProperties) {
      const symbolType = checker.getTypeOfSymbol(symbol);
      properties.push({
        name: symbol.getName(),
        optional: isOptional(symbol),
        readonly: isReadOnly(symbol),
        type: getTypeTree(symbolType, depth + 1, new Set(visited)), // Add depth for sub-properties
      });
    }

    return {
      kind: "object",
      typeName,
      properties,
      excessProperties: Math.max(0, excessProperties),
    };
  }

  return {
    kind: "reference",
    typeName,
  };
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
 * Check if a type is an intrinsic type
 */
function isIntrinsicType(type: ts.Type): type is ts.IntrinsicType {
  return (type.flags & typescript.TypeFlags.Intrinsic) !== 0;
}

/**
 * Sort union types by intrinsic types order, following ts quick info order
 * Ex.
 * string, number, bigint, { a: string }, null, undefined
 */
function sortUnionTypes(a: ts.Type, b: ts.Type): number {
  const primitiveTypesOrder = ["string", "number", "bigint", "boolean", "symbol"];
  const falsyTypesOrder = ["null", "undefined"];

  const aIntrinsicName = isIntrinsicType(a) ? a.intrinsicName : "";
  const bIntrinsicName = isIntrinsicType(b) ? b.intrinsicName : "";

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
 * Check if a type is a TypeReference type (generic type)
 */
function isTypeReference(type: ts.Type): type is ts.TypeReference {
  return (type as ts.TypeReference).target !== undefined;
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
      !!declaration.questionToken,
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
