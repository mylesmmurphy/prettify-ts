import type * as ts from "typescript";
import type { Language } from "@volar/language-core";
import type { TypeFunctionSignature, TypeInfo, TypeProperty, TypeTree } from "./types";
import type { PrettifyOptions } from "../request";
import { FULL_COPY_LIMITS, PREVIEW_LIMITS, normalizeOptions } from "../options";
import { getDescendantAtRange } from "./get-ast-node";
import { getPositionForVue } from "./vue";
import { enumParent, resolvedReadonly } from "./compiler-internals";

export type AnalysisControl = {
  isCancellationRequested?: () => boolean;
  onError?: (error: unknown) => void;
  compilerOptions?: ts.CompilerOptions;
};

/** Analysis state belongs to one request, including all safety budgets. */
export function getTypeInfoAtPosition(
  typescript: typeof ts,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  position: number,
  prettifyOptions: PrettifyOptions,
  vueLanguage?: Language,
  control: AnalysisControl = {},
): TypeInfo | undefined {
  const options = normalizeOptions(prettifyOptions);
  const limits = options.fullExpansion ? FULL_COPY_LIMITS : PREVIEW_LIMITS;
  const deadline = Date.now() + limits.milliseconds;
  const reasons = new Set<string>();
  let nodes = 0;
  let textCharacters = 0;
  const exactOptional = control.compilerOptions?.exactOptionalPropertyTypes === true;
  // Approximate serialized bytes per visited node, so traversal stops with a partial tree
  // before the response-size check below has to discard the whole result.
  const serializedNodeEstimate = 80;
  const responseBudget = limits.characters * 0.9;

  function checkBudget(visited: Set<ts.Type>): boolean {
    if (control.isCancellationRequested?.()) {
      reasons.add("cancelled");
      return false;
    }
    if (
      ++nodes > limits.nodes ||
      visited.size >= limits.depth ||
      textCharacters + nodes * serializedNodeEstimate >= responseBudget ||
      Date.now() > deadline
    ) {
      reasons.add("analysis budget");
      return false;
    }
    return true;
  }

  /**
   * Depth-first expansion lets an early, deep member use up the safety budget and starve its siblings.
   * When the budget runs out, retry with increasing object depth and keep the deepest attempt that fits,
   * so shallow members always appear before deeper levels are cut. Expansions that fit are returned as is.
   */
  function expandFairly<T>(build: () => T): T {
    const start = { nodes, textCharacters, reasons: [...reasons] };
    const exhausted = () => reasons.has("analysis budget") || reasons.has("cancelled");
    const restore = (state: { nodes: number; textCharacters: number; reasons: string[] }) => {
      nodes = state.nodes;
      textCharacters = state.textCharacters;
      reasons.clear();
      for (const reason of state.reasons) reasons.add(reason);
    };
    const first = build();
    if (!exhausted() || reasons.has("cancelled")) return first;
    const firstState = { nodes, textCharacters, reasons: [...reasons] };
    const requestedDepth = options.maxDepth;
    let best: { tree: T; state: typeof firstState } | undefined;
    try {
      for (let depth = 0; depth < requestedDepth; depth++) {
        restore(start);
        options.maxDepth = depth;
        const tree = build();
        if (exhausted()) break;
        best = { tree, state: { nodes, textCharacters, reasons: [...reasons, "analysis budget"] } };
      }
    } finally {
      options.maxDepth = requestedDepth;
    }
    if (!best) {
      restore(firstState);
      return first;
    }
    restore(best.state);
    return best.tree;
  }

  function boundedText(text: string): string {
    if (textCharacters + text.length > limits.characters) {
      reasons.add("type text budget");
      return "unknown /* type text limit */";
    }
    textCharacters += text.length;
    return text;
  }

  /**
   * Previews keep the compiler's ordinary truncation (`Foo<...>`), which protects structural reference fallbacks.
   * Copies must paste as valid TypeScript, so they ask for the full text; the text budget still bounds it.
   */
  function typeText(type: ts.Type, flags = typescript.TypeFormatFlags.None): string {
    return checker.typeToString(
      type,
      undefined,
      options.copy ? flags | typescript.TypeFormatFlags.NoTruncation : flags,
    );
  }

  // Previews mark only the elisions they have always reported; copies also report `Foo<...>` and `[...]`.
  const compilerElision = options.copy ? /\.\.\. \d+ more|\.\.\.$|<\.\.\.>|\[\.\.\.\]/ : /\.\.\. \d+ more|\.\.\.$/;

  function reference(type: ts.Type, expandAlias = false): TypeTree {
    const text = typeText(type, expandAlias ? typescript.TypeFormatFlags.InTypeAlias : typescript.TypeFormatFlags.None);
    if (compilerElision.test(text)) reasons.add("compiler text limit");
    return { kind: "reference", typeName: boundedText(text) };
  }

  /**
   * Render the immediate constraint as declared (`K extends keyof T`, `T extends U`).
   * The base constraint would resolve these to their apparent types and change the signature.
   */
  function typeParameterConstraint(parameter: ts.TypeParameter): TypeTree | undefined {
    const node = checker.typeParameterToDeclaration(
      parameter,
      undefined,
      typescript.NodeBuilderFlags.IgnoreErrors |
        typescript.NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope |
        (options.copy ? typescript.NodeBuilderFlags.NoTruncation : typescript.NodeBuilderFlags.None),
    );
    if (!node) {
      const base = checker.getBaseConstraintOfType(parameter);
      return base && reference(base);
    }
    if (!node.constraint) return undefined;
    const text = typescript
      .createPrinter({ removeComments: true })
      .printNode(typescript.EmitHint.Unspecified, node.constraint, sourceFile);
    if (compilerElision.test(text)) reasons.add("compiler text limit");
    return { kind: "reference", typeName: boundedText(text) };
  }

  /**
   * Members shown after `?:`. Without exactOptionalPropertyTypes, `a?: T | undefined` means `a?: T`, so undefined is
   * dropped as in earlier releases; with it, only the implicit "missing" member is dropped.
   */
  function optionalMembers(type: ts.Type): ts.Type[] | undefined {
    if (!type.isUnion()) return undefined;
    return type.types.filter((member) => {
      if (!(member.flags & typescript.TypeFlags.Undefined)) return true;
      return exactOptional && (member as ts.Type & { debugIntrinsicName?: string }).debugIntrinsicName !== "missing";
    });
  }

  function getTypeTree(
    type: ts.Type,
    depth: number,
    visited: Set<ts.Type>,
    annotation?: ts.Node,
    optional = false,
  ): TypeTree {
    if (!checkBudget(visited)) return { kind: "reference", typeName: "unknown /* expansion limit */" };
    const skippedName = getSkippedTypeName(annotation);
    if (skippedName) return { kind: "reference", typeName: boundedText(skippedName) };
    if (visited.has(type)) {
      const name = type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
      if (name && !name.startsWith("__")) return reference(type);
      reasons.add("circular reference");
      return { kind: "reference", typeName: "unknown /* circular */" };
    }
    if (type.flags & typescript.TypeFlags.TypeParameter) return reference(type);
    if (
      type.flags &
      (typescript.TypeFlags.Conditional | typescript.TypeFlags.Index | typescript.TypeFlags.IndexedAccess)
    )
      return reference(type, true);
    const next = new Set(visited).add(type);
    const apparent = checker.getApparentType(type);
    if (type.isIntersection() && type.types.some(isPrimitiveType)) return reference(type, true);
    if (isPrimitiveType(type)) {
      return {
        kind: "primitive",
        typeName: boundedText(
          type.flags & typescript.TypeFlags.StringLiteral
            ? JSON.stringify((type as ts.StringLiteralType).value)
            : checker.typeToString(type, undefined, typescript.TypeFormatFlags.NoTruncation),
        ),
      };
    }

    const aliasName = type.aliasSymbol?.getName();
    const target = (type as ts.TypeReference).target;
    const genericName = aliasName && type.aliasTypeArguments?.length ? aliasName : target?.getSymbol()?.getName();
    const args =
      aliasName && type.aliasTypeArguments?.length
        ? type.aliasTypeArguments
        : target
          ? checker.getTypeArguments(type as ts.TypeReference)
          : [];
    const name = aliasName ?? type.getSymbol()?.getName();
    // Arrays and tuples are expanded before skipped names apply, so "Array" in the list only affects
    // explicit `Array<T>` annotations (handled by getSkippedTypeName above).
    const arrayLike = checker.isArrayType(apparent) || checker.isTupleType(apparent);
    if (
      !arrayLike &&
      ((name && options.skippedTypeNames.includes(name)) ||
        (genericName && options.skippedTypeNames.includes(genericName)))
    ) {
      // Skipped types are not expanded; copies keep their arguments (`Map<string, number>`) to stay valid.
      const skipped = options.copy ? typeText(type) : (genericName ?? name)! + (args.length ? "<...>" : "");
      return { kind: "reference", typeName: boundedText(skipped) };
    }
    if (genericName && args.length && options.unwrapGenericArgumentsTypeNames.includes(genericName)) {
      return {
        kind: "generic",
        typeName: boundedText(genericName),
        arguments: args.map((arg) => getTypeTree(arg, depth, next)),
      };
    }

    if (apparent.isUnion()) {
      const members = optional ? (optionalMembers(apparent) ?? apparent.types) : apparent.types;
      if (members.length === 1) return getTypeTree(members[0]!, depth, visited);
      // Boolean is represented by false | true in larger compiler unions.
      const sorted = [...members].sort(sortUnionTypes);
      const types = sorted.slice(0, options.maxUnionMembers).map((member) => getTypeTree(member, depth, next));
      if (members.length > types.length) reasons.add("union member limit");
      return { kind: "union", typeName: "", types, excessMembers: Math.max(0, members.length - types.length) };
    }
    const parent = type.symbol && enumParent(type.symbol);
    if (type.symbol?.flags & typescript.SymbolFlags.EnumMember && parent) {
      return { kind: "enum", typeName: "", member: boundedText(parent.name + "." + type.symbol.name) };
    }

    if (checker.isTupleType(apparent)) {
      const tuple = apparent as ts.TupleTypeReference;
      const elements = checker.getTypeArguments(tuple).map((element, index) => {
        const flags = tuple.target.elementFlags[index] ?? typescript.ElementFlags.Required;
        const declaration = tuple.target.labeledElementDeclarations?.[index];
        const arrayRest = !!(flags & typescript.ElementFlags.Rest);
        const variadic = !!(flags & typescript.ElementFlags.Variadic);
        const annotation = arrayRest ? getArrayElementAnnotation(declaration?.type) : declaration?.type;
        let tree = variadic
          ? reference(element)
          : getTypeTree(element, depth, next, annotation, !!(flags & typescript.ElementFlags.Optional));
        if (arrayRest) tree = { kind: "array", typeName: "", readonly: false, elementType: tree };
        return {
          name: declaration && typescript.isIdentifier(declaration.name) ? declaration.name.text : undefined,
          optional: !!(flags & typescript.ElementFlags.Optional),
          rest: arrayRest || variadic,
          type: tree,
        };
      });
      return { kind: "tuple", typeName: "", readonly: tuple.target.readonly, elements };
    }
    if (checker.isArrayType(apparent)) {
      if (!options.unwrapArrays) return reference(type);
      const element = checker.getTypeArguments(apparent as ts.TypeReference)[0];
      return {
        kind: "array",
        typeName: "",
        readonly: apparent.getSymbol()?.getName() === "ReadonlyArray",
        elementType: element
          ? getTypeTree(element, depth, next, getArrayElementAnnotation(annotation))
          : { kind: "primitive", typeName: "any" },
      };
    }

    const calls = apparent.getCallSignatures();
    const constructs = apparent.getConstructSignatures();
    if (calls.length && !options.unwrapFunctions && (type.aliasSymbol || type.isClassOrInterface()))
      return reference(type);
    let members = apparent.getProperties();
    const indexes = checker.getIndexInfosOfType(apparent);
    // Generic mapped types (e.g. Partial<T>) have no resolvable members; keep their declared form.
    if (
      type.flags & typescript.TypeFlags.Object &&
      (type as ts.ObjectType).objectFlags & typescript.ObjectFlags.Mapped &&
      !members.length &&
      !indexes.length &&
      !calls.length &&
      !constructs.length
    )
      return reference(type, true);
    if (options.hidePrivateProperties) members = members.filter(isPublicProperty);
    const signatures = [
      ...calls.map((signature) => ({ signature, construct: false })),
      ...constructs.map((signature) => ({ signature, construct: true })),
    ];
    if (signatures.length && !members.length && !indexes.length) {
      const kept = signatures.slice(0, options.maxFunctionSignatures);
      const excessSignatures = signatures.length - kept.length;
      if (excessSignatures) reasons.add("function signature limit");
      return {
        kind: "function",
        typeName: "",
        excessSignatures,
        signatures: kept.map(({ signature, construct }) => getSignature(signature, depth, next, construct)),
      };
    }

    if (apparent.flags & typescript.TypeFlags.Object || members.length || indexes.length || signatures.length) {
      if (depth >= options.maxDepth) {
        reasons.add("object depth limit");
        if (type.aliasSymbol || (type.getSymbol() && !type.getSymbol()!.getName().startsWith("__")))
          return reference(type);
        return { kind: "object", typeName: "", properties: [], excessProperties: members.length + indexes.length };
      }
      const limit = depth ? options.maxSubProperties : options.maxProperties;
      const properties: TypeProperty[] = [];
      let local = 0;
      for (const index of indexes) {
        if (local >= limit || !checkBudget(next)) break;
        local++;
        const identifier = index.declaration?.parameters[0]?.name?.getText() ?? "key";
        properties.push({
          name: "[" + identifier + ": " + typeText(index.keyType) + "]",
          computed: true,
          readonly: index.isReadonly,
          optional: false,
          type: getTypeTree(index.type, depth + 1, next),
        });
      }
      for (const symbol of members) {
        if (local >= limit || !checkBudget(next)) break;
        local++;
        const optional = !!(symbol.flags & typescript.SymbolFlags.Optional);
        properties.push({
          name: boundedText(isSymbolProperty(symbol) ? checker.symbolToString(symbol) : symbol.getName()),
          computed: isSymbolProperty(symbol),
          optional,
          readonly: isReadOnly(symbol),
          type: getTypeTree(checker.getTypeOfSymbol(symbol), depth + 1, next, getTypeAnnotation(symbol), optional),
        });
      }
      const excessProperties = members.length + indexes.length - properties.length;
      if (excessProperties) reasons.add("property limit");
      const kept = signatures.slice(0, options.maxFunctionSignatures);
      const excessSignatures = signatures.length - kept.length;
      if (excessSignatures) reasons.add("function signature limit");
      return {
        kind: "object",
        typeName: "",
        properties,
        excessProperties,
        ...(signatures.length
          ? {
              signatures: kept.map(({ signature, construct }) => getSignature(signature, depth, next, construct)),
              excessSignatures,
            }
          : {}),
      };
    }
    return reference(type);
  }

  function getSignature(
    signature: ts.Signature,
    depth: number,
    visited: Set<ts.Type>,
    construct = false,
  ): TypeFunctionSignature {
    const signatureType = (type: ts.Type, annotation?: ts.Node, optional = false): TypeTree =>
      options.unwrapFunctions
        ? getTypeTree(type, depth, visited, annotation, optional)
        : { kind: "reference", typeName: boundedText(getSkippedTypeName(annotation) ?? typeText(type)) };
    const symbols = signature.thisParameter ? [signature.thisParameter, ...signature.parameters] : signature.parameters;
    const parameters = symbols.map((symbol) => {
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      const param = declaration && typescript.isParameter(declaration) ? declaration : undefined;
      const optional = !!param && checker.isOptionalParameter(param);
      const type = checker.getTypeOfSymbol(symbol);
      let tree = signatureType(type, getTypeAnnotation(symbol), optional);
      if (
        param?.initializer &&
        !optional &&
        !(type.flags & typescript.TypeFlags.Undefined) &&
        !(type.isUnion() && type.types.some((member) => member.flags & typescript.TypeFlags.Undefined))
      ) {
        tree = {
          kind: "union",
          typeName: "",
          excessMembers: 0,
          types: [tree, { kind: "primitive", typeName: "undefined" }],
        };
      }
      return {
        name: boundedText(symbol === signature.thisParameter ? "this" : symbol.getName()),
        optional,
        isRestParameter: !!param?.dotDotDotToken,
        type: tree,
      };
    });
    const typeParameters = signature.typeParameters?.map((parameter) => {
      const defaultType = checker.getDefaultFromTypeParameter(parameter);
      const declaration = parameter.symbol.declarations?.find(typescript.isTypeParameterDeclaration);
      const modifiers = declaration?.modifiers?.map((modifier) => typescript.tokenToString(modifier.kind) ?? "");
      const constraint = typeParameterConstraint(parameter);
      return {
        ...(modifiers?.length ? { modifiers } : {}),
        name: boundedText(parameter.symbol.getName()),
        ...(constraint ? { constraint } : {}),
        ...(defaultType ? { default: signatureType(defaultType) } : {}),
      };
    });
    const predicate = checker.getTypePredicateOfSignature(signature);
    const asserts =
      predicate &&
      (predicate.kind === typescript.TypePredicateKind.AssertsIdentifier ||
        predicate.kind === typescript.TypePredicateKind.AssertsThis);
    const returnType = checker.getReturnTypeOfSignature(signature);
    return {
      parameters,
      ...(typeParameters?.length ? { typeParameters } : {}),
      ...(construct ? { construct: true } : {}),
      ...(predicate
        ? {
            predicate: {
              parameter: "parameterName" in predicate ? (predicate.parameterName ?? "this") : "this",
              asserts: !!asserts,
              ...(predicate.type ? { type: signatureType(predicate.type) } : {}),
            },
          }
        : {}),
      returnType: construct ? reference(returnType) : signatureType(returnType, signature.getDeclaration()?.type),
    };
  }

  function isReadOnly(symbol: ts.Symbol): boolean {
    // These compiler flags also cover mapped +/-readonly and synthesized intersection properties.
    const resolved = resolvedReadonly(typescript, symbol);
    if (resolved !== undefined) return resolved;
    if (symbol.flags & typescript.SymbolFlags.GetAccessor && !(symbol.flags & typescript.SymbolFlags.SetAccessor))
      return true;
    return (symbol.declarations ?? []).some(
      (declaration) =>
        typescript.canHaveModifiers(declaration) &&
        typescript
          .getModifiers(declaration)
          ?.some((modifier) => modifier.kind === typescript.SyntaxKind.ReadonlyKeyword),
    );
  }

  /** Retrieve annotations before the compiler erases primitive type aliases. */
  function getTypeAnnotation(symbol: ts.Symbol): ts.TypeNode | undefined {
    for (const declaration of symbol.declarations ?? []) {
      if (
        typescript.isVariableDeclaration(declaration) ||
        typescript.isPropertyDeclaration(declaration) ||
        typescript.isPropertySignature(declaration) ||
        typescript.isParameter(declaration)
      ) {
        if (declaration.type) return declaration.type;
      }
    }
    return undefined;
  }

  function getSkippedTypeName(annotation: ts.Node | undefined): string | undefined {
    if (!annotation) return undefined;
    if (typescript.isParenthesizedTypeNode(annotation)) return getSkippedTypeName(annotation.type);
    const nameNode = typescript.isTypeReferenceNode(annotation) ? annotation.typeName : annotation;
    if (!typescript.isIdentifier(nameNode) && !typescript.isQualifiedName(nameNode)) return undefined;
    const name = nameNode.getText();
    let symbol = checker.getSymbolAtLocation(nameNode);
    if (symbol && symbol.flags & typescript.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    if (options.skippedTypeNames.includes(name) || (symbol && options.skippedTypeNames.includes(symbol.getName()))) {
      return typescript.isTypeReferenceNode(annotation) && annotation.typeArguments?.length && !options.copy
        ? `${name}<...>`
        : annotation.getText();
    }
    return undefined;
  }

  function getArrayElementAnnotation(annotation: ts.Node | undefined): ts.TypeNode | undefined {
    if (!annotation) return undefined;
    if (typescript.isArrayTypeNode(annotation)) return annotation.elementType;
    if (typescript.isTypeReferenceNode(annotation)) return annotation.typeArguments?.[0];
    return undefined;
  }

  function isSymbolProperty(symbol: ts.Symbol): boolean {
    return symbol.getName().startsWith("__@") && checker.symbolToString(symbol).startsWith("[");
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
      typeFlags & typescript.TypeFlags.Any ||
      // The `object` keyword; its apparent type is `{}`, which would also accept primitives.
      typeFlags & typescript.TypeFlags.NonPrimitive,
    );
  }

  /**
   * Check if a type is an intrinsic type
   */
  function isIntrinsicType(type: ts.Type): type is ts.Type & { intrinsicName: string } {
    return typeof (type as ts.Type & { intrinsicName?: string }).intrinsicName === "string";
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

  function isPublicProperty(symbol: ts.Symbol): boolean {
    const name = symbol.getName();
    if (name.startsWith("#")) return false;
    if (options.treatUnderscoreAsPrivate !== false && name.startsWith("_") && !isSymbolProperty(symbol)) return false;

    const declarations = symbol.getDeclarations();
    if (!declarations) return true;

    return declarations.every((declaration) => {
      if (!(
        typescript.isMethodDeclaration(declaration) ||
        typescript.isMethodSignature(declaration) ||
        typescript.isPropertyDeclaration(declaration) ||
        typescript.isPropertySignature(declaration) ||
        typescript.isGetAccessor(declaration) ||
        typescript.isSetAccessor(declaration) ||
        typescript.isParameter(declaration)
      ))
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

  function getSyntaxKindDeclaration(syntaxKind: ts.SyntaxKind, typeName: string): string {
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

  try {
    if (vueLanguage) position = getPositionForVue(vueLanguage, sourceFile.fileName.replace(/\\/g, "/"), position);
    const node = getDescendantAtRange(typescript, sourceFile, [position, position]);
    if (!node || node === sourceFile || !node.parent) return undefined;
    // `as const` is a keyword, not a type: the compiler resolves it to an unresolved `const` symbol.
    if (typescript.isConstTypeReference(node.parent)) return undefined;
    let symbol = checker.getSymbolAtLocation(node);
    if (!symbol) return undefined;
    if (symbol.flags & typescript.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const type = checker.getTypeAtLocation(node);
    const typeReference = typescript.isTypeReferenceNode(node.parent) ? node.parent : undefined;
    const typeDeclaration =
      typeReference &&
      symbol.declarations?.find(
        (declaration) =>
          typescript.isTypeAliasDeclaration(declaration) ||
          typescript.isInterfaceDeclaration(declaration) ||
          typescript.isClassDeclaration(declaration),
      );
    const declarationNode =
      typeDeclaration ??
      symbol.declarations?.find((declaration) => declaration === node.parent) ??
      symbol.valueDeclaration ??
      symbol.declarations?.[0];
    let kind = declarationNode?.kind ?? typescript.SyntaxKind.ConstKeyword;
    if (declarationNode && typescript.isVariableDeclaration(declarationNode)) {
      const list = declarationNode.parent;
      kind =
        list.flags & typescript.NodeFlags.Const
          ? typescript.SyntaxKind.ConstKeyword
          : list.flags & typescript.NodeFlags.Let
            ? typescript.SyntaxKind.LetKeyword
            : typescript.SyntaxKind.VarKeyword;
    }
    const name = boundedText(symbol.getName());
    // Only the constructed class itself (`new Foo()`, `new ns.Foo()`), not classes used as arguments or type arguments.
    const callee = typescript.isPropertyAccessExpression(node.parent) && node.parent.name === node ? node.parent : node;
    const newExpression =
      typescript.isNewExpression(callee.parent) && callee.parent.expression === callee ? callee.parent : undefined;
    let tree: TypeTree;
    let declaration: string;
    const constructSignatures = type.getConstructSignatures();
    // Class values (constructor calls, static access, `extends`) show the constructor; declarations and imports do not.
    if (
      kind === typescript.SyntaxKind.ClassDeclaration &&
      !typescript.isClassDeclaration(node.parent) &&
      !typescript.findAncestor(
        node,
        (ancestor) =>
          typescript.isImportDeclaration(ancestor) ||
          typescript.isImportSpecifier(ancestor) ||
          typescript.isImportClause(ancestor),
      ) &&
      (newExpression || constructSignatures.length)
    ) {
      const signature = newExpression ? checker.getResolvedSignature(newExpression) : constructSignatures[0];
      if (!signature) return undefined;
      tree = {
        kind: "function",
        typeName: "",
        excessSignatures: 0,
        signatures: [expandFairly(() => getSignature(signature, 0, new Set(), true))],
      };
      declaration = getSyntaxKindDeclaration(typescript.SyntaxKind.Constructor, name);
    } else {
      const annotation =
        typeReference ??
        (typescript.isTypeAliasDeclaration(node.parent) ? node.parent.name : getTypeAnnotation(symbol));
      tree = expandFairly(() => getTypeTree(type, 0, new Set(), annotation));
      const declaredParameters =
        declarationNode &&
        (typescript.isTypeAliasDeclaration(declarationNode) ||
          typescript.isInterfaceDeclaration(declarationNode) ||
          typescript.isClassDeclaration(declarationNode)) &&
        declarationNode.name === node
          ? declarationNode.typeParameters
          : undefined;
      const declarationName = declaredParameters?.length
        ? boundedText(name + "<" + declaredParameters.map((parameter) => parameter.getText()).join(", ") + ">")
        : name;
      declaration = getSyntaxKindDeclaration(kind, declarationName);
      if (declaration.startsWith("function") && tree.kind !== "function") declaration = "const " + name + ": ";
      // An interface header needs a body; arrays, references and skipped interfaces are written as aliases.
      if (declaration.startsWith("interface ") && tree.kind !== "object") {
        declaration = "type " + declaration.slice("interface ".length).trimEnd() + " = ";
      }
    }
    if (control.isCancellationRequested?.()) return undefined;
    const result: TypeInfo = {
      typeTree: tree,
      declaration,
      name,
      compilerVersion: typescript.version,
      ...(reasons.size ? { truncationReasons: [...reasons] } : {}),
    };
    if (JSON.stringify(result).length > limits.characters) {
      result.typeTree = { kind: "reference", typeName: "unknown /* response size limit */" };
      reasons.add("response size limit");
      result.truncationReasons = [...reasons];
    }
    return result;
  } catch (error) {
    control.onError?.(error);
    return undefined;
  }
}
