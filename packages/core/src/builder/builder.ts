import type * as ts from "typescript";
import type { TypeFunctionSignature, TypeInfo, TypeProperty, TypeTree } from "../types";
import type { PrettifyOptions } from "../options";
import { FULL_COPY_LIMITS, PREVIEW_LIMITS, normalizeOptions } from "../options";
import { CheckFact, PRIMITIVE_FACTS, SymbolFact, TypeFact, step } from "./backend";
import type { Backend, Computation, PrefetchWork, TypeParameterView } from "./backend";
import { findAncestor, getDescendantAtRange, modifiersOf, syntaxGuards } from "./syntax";

export type AnalysisControl = {
  isCancellationRequested?: () => boolean;
  onError?: (error: unknown) => void;
  compilerOptions?: { exactOptionalPropertyTypes?: boolean };
};

/**
 * Type information at a position. Analysis state belongs to one request, including all safety budgets.
 * Run with runSync for the in-process compiler, or runAsync for the TypeScript 7 API.
 */
export function* getTypeInfo<T extends object, S extends object, G extends object>(
  backend: Backend<T, S, G>,
  sourceFile: ts.SourceFile,
  position: number,
  prettifyOptions: PrettifyOptions,
  control: AnalysisControl = {},
): Computation<TypeInfo | undefined> {
  const K = backend.syntax.SyntaxKind;
  const is = syntaxGuards(backend.syntax);
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

  function checkBudget(visited: Set<T>): boolean {
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
  function* expandFairly<R>(build: () => Computation<R>): Computation<R> {
    const start = { nodes, textCharacters, reasons: [...reasons] };
    const exhausted = () => reasons.has("analysis budget") || reasons.has("cancelled");
    const restore = (state: { nodes: number; textCharacters: number; reasons: string[] }) => {
      nodes = state.nodes;
      textCharacters = state.textCharacters;
      reasons.clear();
      for (const reason of state.reasons) reasons.add(reason);
    };
    const first = yield* build();
    if (!exhausted() || reasons.has("cancelled")) return first;
    const firstState = { nodes, textCharacters, reasons: [...reasons] };
    const requestedDepth = options.maxDepth;
    let best: { tree: R; state: typeof firstState } | undefined;
    try {
      for (let depth = 0; depth < requestedDepth; depth++) {
        restore(start);
        options.maxDepth = depth;
        const tree = yield* build();
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
  function typeText(type: T, alias = false): Computation<string> {
    return step(backend.typeToString(type, { alias, noTruncation: options.copy }));
  }

  // Previews mark only the elisions they have always reported; copies also report `Foo<...>` and `[...]`.
  const compilerElision = options.copy ? /\.\.\. \d+ more|\.\.\.$|<\.\.\.>|\[\.\.\.\]/ : /\.\.\. \d+ more|\.\.\.$/;

  function referenceText(text: string): TypeTree {
    if (compilerElision.test(text)) reasons.add("compiler text limit");
    return { kind: "reference", typeName: boundedText(text) };
  }

  function* reference(type: T, expandAlias = false): Computation<TypeTree> {
    return referenceText(yield* typeText(type, expandAlias));
  }

  /**
   * Render the immediate constraint as declared (`K extends keyof T`, `T extends U`).
   * The base constraint would resolve these to their apparent types and change the signature.
   */
  function* typeParameterConstraint(parameter: TypeParameterView<T>): Computation<TypeTree | undefined> {
    if (parameter.constraintText !== undefined) return referenceText(parameter.constraintText);
    return parameter.constraintType && (yield* reference(parameter.constraintType));
  }

  function isPrimitiveType(type: T): boolean {
    const facts = backend.typeFacts(type);
    return !(facts & TypeFact.EnumLike) && !!(facts & PRIMITIVE_FACTS);
  }

  /** Sort union members as TypeScript's quick info does: string, number, bigint, { a: string }, null, undefined. */
  function sortUnionTypes(a: T, b: T): number {
    const primitiveTypesOrder = ["string", "number", "bigint", "boolean", "symbol"];
    const falsyTypesOrder = ["null", "undefined"];
    const aIntrinsicName = backend.intrinsicName(a) ?? "";
    const bIntrinsicName = backend.intrinsicName(b) ?? "";
    const aPrimitiveIndex = primitiveTypesOrder.indexOf(aIntrinsicName);
    const bPrimitiveIndex = primitiveTypesOrder.indexOf(bIntrinsicName);
    const aFalsyIndex = falsyTypesOrder.indexOf(aIntrinsicName);
    const bFalsyIndex = falsyTypesOrder.indexOf(bIntrinsicName);
    if (aPrimitiveIndex !== -1 && bPrimitiveIndex !== -1) return aPrimitiveIndex - bPrimitiveIndex;
    if (aPrimitiveIndex !== -1) return -1;
    if (bPrimitiveIndex !== -1) return 1;
    if (aFalsyIndex !== -1 && bFalsyIndex !== -1) return aFalsyIndex - bFalsyIndex;
    if (aFalsyIndex !== -1) return 1;
    if (bFalsyIndex !== -1) return -1;
    return 0;
  }

  function* prefetch(work: PrefetchWork<T, S, G>): Computation<void> {
    if (!backend.batches) return;
    yield* step(backend.prefetch(work, { noTruncation: !!options.copy, maxSignatures: options.maxFunctionSignatures }));
  }

  /**
   * Members shown after `?:`. Without exactOptionalPropertyTypes, `a?: T | undefined` means `a?: T`, so undefined is
   * dropped as in earlier releases; with it, only the implicit "missing" member is dropped.
   */
  function* optionalMembers(type: T): Computation<readonly T[] | undefined> {
    if (!(backend.typeFacts(type) & TypeFact.Union)) return undefined;
    return (yield* step(backend.constituents(type))).filter((member) => {
      const facts = backend.typeFacts(member);
      if (!(facts & TypeFact.Undefined)) return true;
      return exactOptional && !(facts & TypeFact.Missing);
    });
  }

  function* getTypeTree(
    type: T,
    depth: number,
    visited: Set<T>,
    annotation?: ts.Node,
    optional = false,
  ): Computation<TypeTree> {
    if (!checkBudget(visited)) return { kind: "reference", typeName: "unknown /* expansion limit */" };
    const skippedName =
      annotation && options.skippedTypeNames.length ? yield* getSkippedTypeName(annotation) : undefined;
    if (skippedName) return { kind: "reference", typeName: boundedText(skippedName) };
    const facts = backend.typeFacts(type);
    if (visited.has(type)) {
      const name = (yield* step(backend.aliasName(type))) ?? (yield* step(backend.symbolName(type)));
      if (name && !name.startsWith("__")) return yield* reference(type);
      reasons.add("circular reference");
      return { kind: "reference", typeName: "unknown /* circular */" };
    }
    if (facts & TypeFact.TypeParameter) return yield* reference(type);
    if (facts & TypeFact.Deferred) return yield* reference(type, true);
    const next = new Set(visited).add(type);
    if (facts & TypeFact.Intersection && (yield* step(backend.constituents(type))).some(isPrimitiveType))
      return yield* reference(type, true);
    if (isPrimitiveType(type)) {
      return {
        kind: "primitive",
        typeName: boundedText(
          facts & TypeFact.StringLiteral
            ? JSON.stringify(backend.stringLiteralValue(type))
            : yield* step(backend.typeToString(type, { noTruncation: true })),
        ),
      };
    }
    const apparent = yield* step(backend.apparentType(type));
    const aliasName = yield* step(backend.aliasName(type));
    const symbolName = yield* step(backend.symbolName(type));
    const aliasArguments = aliasName ? yield* step(backend.aliasArguments(type)) : [];
    const target = yield* step(backend.reference(type));
    const genericName = aliasName && aliasArguments.length ? aliasName : target?.targetName;
    const args = aliasName && aliasArguments.length ? aliasArguments : (target?.arguments ?? []);
    const name = aliasName ?? symbolName;
    const isArray = yield* step(backend.isArray(apparent));
    const isTuple = yield* step(backend.isTuple(apparent));
    // Arrays and tuples are expanded before skipped names apply, so "Array" in the list only affects
    // explicit `Array<T>` annotations (handled by getSkippedTypeName above).
    if (
      !isArray &&
      !isTuple &&
      ((name && options.skippedTypeNames.includes(name)) ||
        (genericName && options.skippedTypeNames.includes(genericName)))
    ) {
      // Skipped types are not expanded; copies keep their arguments (`Map<string, number>`) to stay valid.
      const skipped = options.copy ? yield* typeText(type) : (genericName ?? name)! + (args.length ? "<...>" : "");
      return { kind: "reference", typeName: boundedText(skipped) };
    }
    if (genericName && args.length && options.unwrapGenericArgumentsTypeNames.includes(genericName)) {
      yield* prefetch({ types: args });
      const typeName = boundedText(genericName);
      const argumentTrees: TypeTree[] = [];
      for (const arg of args) argumentTrees.push(yield* getTypeTree(arg, depth, next));
      return { kind: "generic", typeName, arguments: argumentTrees };
    }

    if (backend.typeFacts(apparent) & TypeFact.Union) {
      const all = yield* step(backend.constituents(apparent));
      const members = optional ? ((yield* optionalMembers(apparent)) ?? all) : all;
      if (members.length === 1) return yield* getTypeTree(members[0]!, depth, visited);
      // Boolean is represented by false | true in larger compiler unions.
      const sorted = [...members].sort(sortUnionTypes).slice(0, options.maxUnionMembers);
      yield* prefetch({ types: sorted });
      const types: TypeTree[] = [];
      for (const member of sorted) types.push(yield* getTypeTree(member, depth, next));
      if (members.length > types.length) reasons.add("union member limit");
      return { kind: "union", typeName: "", types, excessMembers: Math.max(0, members.length - types.length) };
    }
    const enumMember = yield* step(backend.enumMemberName(type));
    if (enumMember) return { kind: "enum", typeName: "", member: boundedText(enumMember) };

    if (isTuple) {
      const tuple = yield* step(backend.tuple(apparent));
      yield* prefetch({ types: tuple.elements.map((element) => element.type) });
      const elements = [];
      for (const element of tuple.elements) {
        const declaration = element.label;
        const annotation = element.rest ? getArrayElementAnnotation(declaration?.type) : declaration?.type;
        let tree = element.variadic
          ? yield* reference(element.type)
          : yield* getTypeTree(element.type, depth, next, annotation, element.optional);
        if (element.rest) tree = { kind: "array", typeName: "", readonly: false, elementType: tree };
        elements.push({
          name: declaration && is.isIdentifier(declaration.name) ? declaration.name.text : undefined,
          optional: element.optional,
          rest: element.rest || element.variadic,
          type: tree,
        });
      }
      return { kind: "tuple", typeName: "", readonly: tuple.readonly, elements };
    }
    if (isArray) {
      if (!options.unwrapArrays) return yield* reference(type);
      const element = (yield* step(backend.reference(apparent)))?.arguments[0];
      return {
        kind: "array",
        typeName: "",
        readonly: (yield* step(backend.symbolName(apparent))) === "ReadonlyArray",
        elementType: element
          ? yield* getTypeTree(element, depth, next, getArrayElementAnnotation(annotation))
          : { kind: "primitive", typeName: "any" },
      };
    }

    const calls = yield* step(backend.callSignatures(apparent));
    const constructs = yield* step(backend.constructSignatures(apparent));
    if (calls.length && !options.unwrapFunctions && (aliasName || facts & TypeFact.ClassOrInterface))
      return yield* reference(type);
    let members = yield* step(backend.properties(apparent));
    const indexes = yield* step(backend.indexInfos(apparent));
    // Generic mapped types (e.g. Partial<T>) have no resolvable members; keep their declared form.
    if (facts & TypeFact.Mapped && !members.length && !indexes.length && !calls.length && !constructs.length)
      return yield* reference(type, true);
    if (options.hidePrivateProperties) {
      const visible: S[] = [];
      for (const member of members) {
        const name = backend.name(member);
        const visibleByName =
          !name.startsWith("#") && !(options.treatUnderscoreAsPrivate !== false && name.startsWith("_"));
        if (visibleByName ? declaredPublic(yield* step(backend.declarations(member))) : yield* isPublicProperty(member))
          visible.push(member);
      }
      members = visible;
    }
    const signatures = [
      ...calls.map((signature) => ({ signature, construct: false })),
      ...constructs.map((signature) => ({ signature, construct: true })),
    ];
    if (signatures.length && !members.length && !indexes.length) {
      const kept = signatures.slice(0, options.maxFunctionSignatures);
      const excessSignatures = signatures.length - kept.length;
      if (excessSignatures) reasons.add("function signature limit");
      const trees: TypeFunctionSignature[] = [];
      for (const { signature, construct } of kept) trees.push(yield* getSignature(signature, depth, next, construct));
      return { kind: "function", typeName: "", excessSignatures, signatures: trees };
    }

    if (backend.typeFacts(apparent) & TypeFact.Object || members.length || indexes.length || signatures.length) {
      if (depth >= options.maxDepth) {
        reasons.add("object depth limit");
        if (aliasName || (symbolName && !symbolName.startsWith("__"))) return yield* reference(type);
        return { kind: "object", typeName: "", properties: [], excessProperties: members.length + indexes.length };
      }
      const limit = depth ? options.maxSubProperties : options.maxProperties;
      const properties: TypeProperty[] = [];
      let local = 0;
      for (const index of indexes) {
        if (local >= limit || !checkBudget(next)) break;
        local++;
        const identifier = index.declaration?.parameters[0]?.name?.getText() ?? "key";
        const name = "[" + identifier + ": " + (yield* typeText(index.keyType)) + "]";
        properties.push({
          name,
          computed: true,
          readonly: index.readonly,
          optional: false,
          type: yield* getTypeTree(index.type, depth + 1, next),
        });
      }
      const shown = members.slice(0, Math.max(0, limit - local));
      const shownTypes = backend.batches && shown.length ? yield* step(backend.typesOfSymbols(shown)) : undefined;
      if (shownTypes) yield* prefetch({ types: shownTypes, symbols: shown });
      for (let index = 0; index < shown.length; index++) {
        if (local >= limit || !checkBudget(next)) break;
        local++;
        const symbol = shown[index]!;
        const optional = !!(backend.symbolFacts(symbol) & SymbolFact.Optional);
        const symbolProperty = yield* isSymbolProperty(symbol);
        const name = boundedText(symbolProperty ? yield* step(backend.displayName(symbol)) : backend.name(symbol));
        const declarations = yield* step(backend.declarations(symbol));
        const readonly = isReadOnly(symbol, declarations);
        const memberType = shownTypes?.[index] ?? (yield* step(backend.typeOfSymbol(symbol)));
        const annotation = getTypeAnnotation(declarations);
        properties.push({
          name,
          computed: symbolProperty,
          optional,
          readonly,
          type: yield* getTypeTree(memberType, depth + 1, next, annotation, optional),
        });
      }
      const excessProperties = members.length + indexes.length - properties.length;
      if (excessProperties) reasons.add("property limit");
      const kept = signatures.slice(0, options.maxFunctionSignatures);
      const excessSignatures = signatures.length - kept.length;
      if (excessSignatures) reasons.add("function signature limit");
      const trees: TypeFunctionSignature[] = [];
      if (signatures.length)
        for (const { signature, construct } of kept) trees.push(yield* getSignature(signature, depth, next, construct));
      return {
        kind: "object",
        typeName: "",
        properties,
        excessProperties,
        ...(signatures.length ? { signatures: trees, excessSignatures } : {}),
      };
    }
    return yield* reference(type);
  }

  function* getSignature(
    signature: G,
    depth: number,
    visited: Set<T>,
    construct = false,
  ): Computation<TypeFunctionSignature> {
    function* signatureType(type: T, annotation?: ts.Node, optional = false): Computation<TypeTree> {
      if (options.unwrapFunctions) return yield* getTypeTree(type, depth, visited, annotation, optional);
      return {
        kind: "reference",
        typeName: boundedText((yield* getSkippedTypeName(annotation)) ?? (yield* typeText(type))),
      };
    }
    yield* prefetch({ signatures: [signature] });
    const view = yield* step(backend.signature(signature));
    const symbols = view.thisParameter ? [view.thisParameter, ...view.parameters] : view.parameters;
    const parameters = [];
    for (const symbol of symbols) {
      const declaration =
        (yield* step(backend.valueDeclaration(symbol))) ?? (yield* step(backend.declarations(symbol)))[0];
      const param = declaration && is.isParameter(declaration) ? declaration : undefined;
      const optional = !!param && (yield* step(backend.isOptionalParameter(param)));
      const type = yield* step(backend.typeOfSymbol(symbol));
      let tree = yield* signatureType(type, getTypeAnnotation(yield* step(backend.declarations(symbol))), optional);
      if (param?.initializer && !optional && !(yield* includesUndefined(type))) {
        tree = {
          kind: "union",
          typeName: "",
          excessMembers: 0,
          types: [tree, { kind: "primitive", typeName: "undefined" }],
        };
      }
      parameters.push({
        name: boundedText(
          symbol === view.thisParameter
            ? "this"
            : param && !is.isIdentifier(param.name)
              ? bindingPatternText(param.name)
              : backend.name(symbol),
        ),
        optional,
        isRestParameter: !!param?.dotDotDotToken,
        type: tree,
      });
    }
    const typeParameters = [];
    for (const parameter of view.typeParameters) {
      const info = yield* step(backend.typeParameter(parameter, { noTruncation: options.copy }));
      const modifiers = info.declaration
        ? modifiersOf(info.declaration).map((modifier) => backend.syntax.tokenToString(modifier.kind) ?? "")
        : undefined;
      const constraint = yield* typeParameterConstraint(info);
      const name = boundedText(info.name);
      const defaultTree = info.default ? yield* signatureType(info.default) : undefined;
      typeParameters.push({
        ...(modifiers?.length ? { modifiers } : {}),
        name,
        ...(constraint ? { constraint } : {}),
        ...(defaultTree ? { default: defaultTree } : {}),
      });
    }
    const predicate = yield* step(backend.predicate(signature));
    const returnType = yield* step(backend.returnType(signature));
    const predicateType = predicate?.type ? yield* signatureType(predicate.type) : undefined;
    return {
      parameters,
      ...(typeParameters.length ? { typeParameters } : {}),
      ...(construct ? { construct: true } : {}),
      ...(predicate
        ? {
            predicate: {
              parameter: predicate.parameterName ?? "this",
              asserts: predicate.asserts,
              ...(predicateType ? { type: predicateType } : {}),
            },
          }
        : {}),
      returnType: construct ? yield* reference(returnType) : yield* signatureType(returnType, view.declaration?.type),
    };
  }

  function* includesUndefined(type: T): Computation<boolean> {
    const facts = backend.typeFacts(type);
    if (facts & TypeFact.Undefined) return true;
    if (!(facts & TypeFact.Union)) return false;
    return (yield* step(backend.constituents(type))).some(
      (member) => !!(backend.typeFacts(member) & TypeFact.Undefined),
    );
  }

  /** Destructured parameters are named `__0` by the compiler; show the pattern instead, as TypeScript's hover does. */
  function bindingPatternText(pattern: ts.BindingName): string {
    if (is.isIdentifier(pattern)) return pattern.text;
    if (is.isObjectBindingPattern(pattern)) {
      if (!pattern.elements.length) return "{}";
      const elements = pattern.elements.map(
        (element) =>
          (element.dotDotDotToken ? "..." : "") +
          (element.propertyName ? element.propertyName.getText() + ": " : "") +
          bindingPatternText(element.name),
      );
      return "{ " + elements.join(", ") + " }";
    }
    const elements = pattern.elements.map((element) => {
      // Holes are omitted expressions in the JavaScript compiler and unnamed binding elements in TypeScript 7.
      const binding = element as Partial<ts.BindingElement>;
      if (is.isOmittedExpression(element) || !binding.name) return "";
      return (binding.dotDotDotToken ? "..." : "") + bindingPatternText(binding.name);
    });
    return "[" + elements.join(", ") + "]";
  }

  function isReadOnly(symbol: S, declarations: readonly ts.Declaration[]): boolean {
    // These compiler flags also cover mapped +/-readonly and synthesized intersection properties.
    const resolved = backend.checkFacts(symbol);
    if (resolved & CheckFact.Readonly) return true;
    if (resolved & CheckFact.SyntheticOrMapped) return false;
    const facts = backend.symbolFacts(symbol);
    if (facts & SymbolFact.GetAccessor && !(facts & SymbolFact.SetAccessor)) return true;
    return declarations.some((declaration) =>
      modifiersOf(declaration).some((modifier) => modifier.kind === K.ReadonlyKeyword),
    );
  }

  /** Retrieve annotations before the compiler erases primitive type aliases. */
  function getTypeAnnotation(declarations: readonly ts.Declaration[]): ts.TypeNode | undefined {
    for (const declaration of declarations) {
      if (
        is.isVariableDeclaration(declaration) ||
        is.isPropertyDeclaration(declaration) ||
        is.isPropertySignature(declaration) ||
        is.isParameter(declaration)
      ) {
        if (declaration.type) return declaration.type;
      }
    }
    return undefined;
  }

  function* getSkippedTypeName(annotation: ts.Node | undefined): Computation<string | undefined> {
    if (!annotation || !options.skippedTypeNames.length) return undefined;
    if (is.isParenthesizedTypeNode(annotation)) return yield* getSkippedTypeName(annotation.type);
    const nameNode = is.isTypeReferenceNode(annotation) ? annotation.typeName : annotation;
    if (!is.isIdentifier(nameNode) && !is.isQualifiedName(nameNode)) return undefined;
    const name = nameNode.getText();
    let skipped = options.skippedTypeNames.includes(name);
    if (!skipped) {
      let symbol = yield* step(backend.symbolAtLocation(nameNode));
      if (symbol && backend.symbolFacts(symbol) & SymbolFact.Alias) symbol = yield* step(backend.aliasedSymbol(symbol));
      skipped = !!symbol && options.skippedTypeNames.includes(backend.name(symbol));
    }
    if (!skipped) return undefined;
    return is.isTypeReferenceNode(annotation) && annotation.typeArguments?.length && !options.copy
      ? `${name}<...>`
      : annotation.getText();
  }

  function getArrayElementAnnotation(annotation: ts.Node | undefined): ts.TypeNode | undefined {
    if (!annotation) return undefined;
    if (is.isArrayTypeNode(annotation)) return annotation.elementType;
    if (is.isTypeReferenceNode(annotation)) return annotation.typeArguments?.[0];
    return undefined;
  }

  function* isSymbolProperty(symbol: S): Computation<boolean> {
    return backend.name(symbol).startsWith("__@") && (yield* step(backend.displayName(symbol))).startsWith("[");
  }

  function* isPublicProperty(symbol: S): Computation<boolean> {
    const name = backend.name(symbol);
    if (name.startsWith("#")) return false;
    if (options.treatUnderscoreAsPrivate !== false && name.startsWith("_") && !(yield* isSymbolProperty(symbol)))
      return false;
    return declaredPublic(yield* step(backend.declarations(symbol)));
  }

  function declaredPublic(declarations: readonly ts.Declaration[]): boolean {
    return declarations.every((declaration) => {
      if (!(
        is.isMethodDeclaration(declaration) ||
        is.isMethodSignature(declaration) ||
        is.isPropertyDeclaration(declaration) ||
        is.isPropertySignature(declaration) ||
        is.isGetAccessor(declaration) ||
        is.isSetAccessor(declaration) ||
        is.isParameter(declaration)
      ))
        return true;
      return !modifiersOf(declaration).some(
        (modifier) => modifier.kind === K.PrivateKeyword || modifier.kind === K.ProtectedKeyword,
      );
    });
  }

  function getSyntaxKindDeclaration(syntaxKind: ts.SyntaxKind, typeName: string): string {
    // Handle imported types
    if (typeName.startsWith('"') && typeName.endsWith('"')) {
      const shortenedTypeName = typeName.replace(/"/g, "").split("node_modules/").pop()!;
      const finalTypeName = `"${shortenedTypeName}"`;

      return `typeof import(${finalTypeName}): `;
    }

    switch (syntaxKind) {
      case K.ClassDeclaration:
      case K.NewExpression:
        return `class ${typeName} `;

      case K.ExpressionWithTypeArguments:
      case K.InterfaceDeclaration:
      case K.QualifiedName:
        return `interface ${typeName} `;

      case K.ArrayType:
      case K.ConstructorType:
      case K.ConstructSignature:
      case K.EnumDeclaration:
      case K.FunctionType:
      case K.IndexedAccessType:
      case K.IndexSignature:
      case K.IntersectionType:
      case K.MappedType:
      case K.PropertySignature:
      case K.ThisType:
      case K.TupleType:
      case K.TypeAliasDeclaration:
      case K.TypeAssertionExpression:
      case K.TypeLiteral:
      case K.TypeOperator:
      case K.TypePredicate:
      case K.TypeQuery:
      case K.TypeReference:
      case K.UnionType:
        return `type ${typeName} = `;

      case K.FunctionDeclaration:
      case K.FunctionKeyword:
      case K.MethodDeclaration:
      case K.MethodSignature:
      case K.GetAccessor:
      case K.SetAccessor:
      case K.Constructor:
        return `function ${typeName}`;

      case K.LetKeyword:
        return `let ${typeName}: `;

      case K.VarKeyword:
        return `var ${typeName}: `;

      default:
        return `const ${typeName}: `;
    }
  }

  try {
    const node = getDescendantAtRange(sourceFile, [position, position]);
    if (!node || node === sourceFile || !node.parent) return undefined;
    // `as const` is a keyword, not a type: the compiler resolves it to an unresolved `const` symbol.
    if (is.isConstTypeReference(node.parent)) return undefined;
    let symbol = yield* step(backend.symbolAtLocation(node));
    if (!symbol) return undefined;
    if (backend.symbolFacts(symbol) & SymbolFact.Alias) symbol = yield* step(backend.aliasedSymbol(symbol));
    // getTypeAtLocation picks the right meaning for names shared by a type and a value, but returns `any` for
    // keywords such as `default` in `export default function`; the symbol's type is correct there.
    let type = yield* step(backend.typeAtLocation(node));
    if (backend.typeFacts(type) & TypeFact.Any && !is.isIdentifier(node)) {
      // A class declaration shows its instance members, as when hovering a class name.
      type =
        backend.symbolFacts(symbol) & SymbolFact.Class && is.isClassDeclaration(node.parent)
          ? yield* step(backend.declaredTypeOfSymbol(symbol))
          : yield* step(backend.typeOfSymbolAtLocation(symbol, node));
    }
    const declarations = yield* step(backend.declarations(symbol));
    const typeReference = is.isTypeReferenceNode(node.parent) ? node.parent : undefined;
    const typeDeclaration =
      typeReference &&
      declarations.find(
        (declaration) =>
          is.isTypeAliasDeclaration(declaration) ||
          is.isInterfaceDeclaration(declaration) ||
          is.isClassDeclaration(declaration),
      );
    const declarationNode =
      typeDeclaration ??
      declarations.find((declaration) => declaration === node.parent) ??
      (yield* step(backend.valueDeclaration(symbol))) ??
      declarations[0];
    let kind = declarationNode?.kind ?? K.ConstKeyword;
    if (declarationNode && is.isVariableDeclaration(declarationNode)) {
      const list = declarationNode.parent;
      const NodeFlags = backend.syntax.NodeFlags;
      kind = list.flags & NodeFlags.Const ? K.ConstKeyword : list.flags & NodeFlags.Let ? K.LetKeyword : K.VarKeyword;
    }
    const name = boundedText(backend.name(symbol));
    // Only the constructed class itself (`new Foo()`, `new ns.Foo()`), not classes used as arguments or type arguments.
    const callee = is.isPropertyAccessExpression(node.parent) && node.parent.name === node ? node.parent : node;
    const newExpression =
      is.isNewExpression(callee.parent) && callee.parent.expression === callee ? callee.parent : undefined;
    let tree: TypeTree;
    let declaration: string;
    // Class values (constructor calls, static access, `extends`) show the constructor; declarations and imports do not.
    const classValue =
      kind === K.ClassDeclaration &&
      !is.isClassDeclaration(node.parent) &&
      !findAncestor(
        node,
        (ancestor) => is.isImportDeclaration(ancestor) || is.isImportSpecifier(ancestor) || is.isImportClause(ancestor),
      );
    const constructSignatures = classValue ? yield* step(backend.constructSignatures(type)) : [];
    if (classValue && (newExpression || constructSignatures.length)) {
      const signature = newExpression ? yield* step(backend.resolvedSignature(newExpression)) : constructSignatures[0];
      if (!signature) return undefined;
      tree = {
        kind: "function",
        typeName: "",
        excessSignatures: 0,
        signatures: [yield* expandFairly(() => getSignature(signature, 0, new Set(), true))],
      };
      declaration = getSyntaxKindDeclaration(K.Constructor, name);
    } else {
      const annotation =
        typeReference ?? (is.isTypeAliasDeclaration(node.parent) ? node.parent.name : getTypeAnnotation(declarations));
      tree = yield* expandFairly(() => getTypeTree(type, 0, new Set(), annotation));
      const declaredParameters =
        declarationNode &&
        (is.isTypeAliasDeclaration(declarationNode) ||
          is.isInterfaceDeclaration(declarationNode) ||
          is.isClassDeclaration(declarationNode)) &&
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
      compilerVersion: backend.version,
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
