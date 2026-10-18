import type * as ts from "typescript";
import type {
  Checker,
  Project,
  Signature,
  Symbol as ApiSymbol,
  TupleTypeReference,
  Type,
  TypeParameter,
  TypeReference,
  UnionOrIntersectionType,
} from "typescript-7/async";
import type { PrettifyOptions } from "../options";
import type { TypeInfo } from "../types";
import { CheckFact, PRIMITIVE_FACTS, SymbolFact, TypeFact, runAsync } from "../builder/backend";
import type { Backend, IndexInfoView, PrefetchHints, TupleElementView } from "../builder/backend";
import { getTypeInfo } from "../builder/builder";
import type { AnalysisControl } from "../builder/builder";
import type { SyntaxModule } from "../builder/syntax";

type AsyncApiModule = typeof import("typescript-7/async");

/**
 * Modules of the TypeScript 7 installation that runs the language server. The API client must match the server,
 * so these are always loaded from that installation (`sdk.importModule`), never bundled.
 */
export type Ts7Modules = {
  api: Pick<
    AsyncApiModule,
    | "TypeFlags"
    | "ObjectFlags"
    | "SymbolFlags"
    | "CheckFlags"
    | "ElementFlags"
    | "TypeFormatFlags"
    | "TypePredicateKind"
    | "SignatureKind"
  >;
  ast: { SyntaxKind: object; NodeFlags: object };
  scanner: { tokenToString(kind: never): string | undefined };
  version: string;
};

type Ts7Backend = Backend<Type, ApiSymbol, Signature>;

/** Signature levels fetched ahead: methods of members, and the callbacks among their parameters. */
const SIGNATURE_LOOKAHEAD = 2;

/** The builder's compiler queries over the TypeScript 7 API. Create one per request: results are cached. */
export async function createApiBackend(modules: Ts7Modules, checker: Checker): Promise<Ts7Backend> {
  const { TypeFlags, ObjectFlags, SymbolFlags, CheckFlags, ElementFlags, TypeFormatFlags, TypePredicateKind } =
    modules.api;
  const syntax: SyntaxModule = {
    SyntaxKind: modules.ast.SyntaxKind as typeof ts.SyntaxKind,
    NodeFlags: modules.ast.NodeFlags as typeof ts.NodeFlags,
    tokenToString: (kind) => modules.scanner.tokenToString(kind as never),
  };
  const undefinedTypeId = (await checker.getUndefinedType()).id;
  const typeFactFlags: [number, number][] = [
    [TypeFlags.Any, TypeFact.Any],
    [TypeFlags.Unknown, TypeFact.Unknown],
    [TypeFlags.String, TypeFact.String],
    [TypeFlags.StringLiteral, TypeFact.StringLiteral],
    [TypeFlags.TemplateLiteral, TypeFact.TemplateLiteral],
    [TypeFlags.Number, TypeFact.Number],
    [TypeFlags.NumberLiteral, TypeFact.NumberLiteral],
    [TypeFlags.Boolean, TypeFact.Boolean],
    [TypeFlags.BooleanLiteral, TypeFact.BooleanLiteral],
    [TypeFlags.BigInt, TypeFact.BigInt],
    [TypeFlags.BigIntLiteral, TypeFact.BigIntLiteral],
    [TypeFlags.ESSymbol, TypeFact.ESSymbol],
    [TypeFlags.UniqueESSymbol, TypeFact.UniqueESSymbol],
    [TypeFlags.Void, TypeFact.Void],
    [TypeFlags.Undefined, TypeFact.Undefined],
    [TypeFlags.Null, TypeFact.Null],
    [TypeFlags.Never, TypeFact.Never],
    [TypeFlags.NonPrimitive, TypeFact.NonPrimitive],
    [TypeFlags.EnumLike, TypeFact.EnumLike],
    [TypeFlags.TypeParameter, TypeFact.TypeParameter],
    [TypeFlags.Conditional | TypeFlags.Index | TypeFlags.IndexedAccess, TypeFact.Deferred],
    [TypeFlags.Object, TypeFact.Object],
    [TypeFlags.Union, TypeFact.Union],
    [TypeFlags.Intersection, TypeFact.Intersection],
  ];
  const symbolFactFlags: [number, number][] = [
    [SymbolFlags.Optional, SymbolFact.Optional],
    [SymbolFlags.GetAccessor, SymbolFact.GetAccessor],
    [SymbolFlags.SetAccessor, SymbolFact.SetAccessor],
    [SymbolFlags.Alias, SymbolFact.Alias],
    [SymbolFlags.Class, SymbolFact.Class],
  ];
  const facts = (flags: number, table: [number, number][]) =>
    table.reduce((result, [flag, fact]) => (flags & flag ? result | fact : result), 0);
  const objectFlags = (type: Type) =>
    type.flags & TypeFlags.Object ? ((type as Type & { objectFlags?: number }).objectFlags ?? 0) : 0;

  // Results are kept as promises, so concurrent prefetches and later visits share one request.
  const cache = new Map<string, Promise<unknown>>();
  function memo<R>(key: string, compute: () => Promise<R>): Promise<R> {
    let value = cache.get(key) as Promise<R> | undefined;
    if (!value) {
      value = compute();
      cache.set(key, value);
    }
    return value;
  }
  const typeKey = (type: Type, name: string) => "t" + type.id + ":" + name;
  const symbolKey = (symbol: ApiSymbol, name: string) => "s" + symbol.id + ":" + name;
  const signatureKey = (signature: Signature, name: string) => "g" + signature.id + ":" + name;

  const nodeSymbols = new WeakMap<ts.Node, Promise<ApiSymbol | undefined>>();
  const typeOfSymbol = (symbol: ApiSymbol) => memo(symbolKey(symbol, "type"), () => checker.getTypeOfSymbol(symbol));
  const typeSymbol = (type: Type) => memo(typeKey(type, "symbol"), () => type.getSymbol());
  const resolveAll = <N>(handles: readonly { resolve(): Promise<unknown> }[]) =>
    Promise.all(handles.map((handle) => handle.resolve())).then(
      (nodes) => nodes.filter((node) => node !== undefined) as N[],
    );

  const backend: Ts7Backend = {
    syntax,
    version: modules.version,
    batches: true,

    typeFacts(type) {
      let result = facts(type.flags, typeFactFlags);
      const flags = objectFlags(type);
      if (flags & ObjectFlags.Mapped) result |= TypeFact.Mapped;
      if (flags & ObjectFlags.ClassOrInterface) result |= TypeFact.ClassOrInterface;
      // The implicit `undefined` of an optional property is a distinct type from the `undefined` keyword.
      if (type.flags & TypeFlags.Undefined && type.id !== undefinedTypeId) result |= TypeFact.Missing;
      return result;
    },
    intrinsicName: (type) => (type as Type & { intrinsicName?: string }).intrinsicName,
    stringLiteralValue: (type) => (type as Type & { value?: string }).value,
    typeToString(type, format) {
      const flags =
        (format.alias ? TypeFormatFlags.InTypeAlias : TypeFormatFlags.None) |
        (format.noTruncation ? TypeFormatFlags.NoTruncation : TypeFormatFlags.None);
      return memo(typeKey(type, "text" + flags), () => checker.typeToString(type, undefined, flags));
    },
    apparentType: (type) => memo(typeKey(type, "apparent"), () => type.getApparentType()),
    constituents: (type) => memo(typeKey(type, "types"), () => (type as UnionOrIntersectionType).getTypes()),
    aliasName: (type) => memo(typeKey(type, "alias"), () => type.getAliasSymbol().then((symbol) => symbol?.name)),
    aliasArguments: (type) => memo(typeKey(type, "aliasArguments"), () => type.getAliasTypeArguments()),
    symbolName: (type) => typeSymbol(type).then((symbol) => symbol?.name),
    reference(type) {
      if (!(objectFlags(type) & ObjectFlags.Reference)) return undefined;
      return memo(typeKey(type, "reference"), async () => {
        const [target, args] = await Promise.all([
          (type as TypeReference).getTarget(),
          checker.getTypeArguments(type as TypeReference),
        ]);
        return { targetName: (await typeSymbol(target))?.name, arguments: args };
      });
    },
    isArray: (type) => memo(typeKey(type, "isArray"), () => checker.isArrayType(type)),
    isTuple: (type) => memo(typeKey(type, "isTuple"), () => checker.isTupleType(type)),
    async tuple(type) {
      const reference = type as TupleTypeReference;
      const [target, args] = await Promise.all([reference.getTarget(), checker.getTypeArguments(reference)]);
      const labels = await Promise.all(
        args.map((_, index) => target.labeledElementDeclarations?.[index]?.resolve() ?? Promise.resolve(undefined)),
      );
      const elements = args.map((element, index): TupleElementView<Type> => {
        const flags = target.elementFlags[index] ?? ElementFlags.Required;
        const label = labels[index] as ts.NamedTupleMember | ts.ParameterDeclaration | undefined;
        return {
          type: element,
          optional: !!(flags & ElementFlags.Optional),
          rest: !!(flags & ElementFlags.Rest),
          variadic: !!(flags & ElementFlags.Variadic),
          ...(label ? { label } : {}),
        };
      });
      return { readonly: target.readonly, elements };
    },
    async enumMemberName(type) {
      const symbol = await typeSymbol(type);
      if (!symbol || !(symbol.flags & SymbolFlags.EnumMember)) return undefined;
      const parent = await checker.getParentOfSymbol(symbol);
      return parent ? parent.name + "." + symbol.name : undefined;
    },
    callSignatures: (type) => memo(typeKey(type, "calls"), () => type.getCallSignatures()),
    constructSignatures: (type) => memo(typeKey(type, "constructs"), () => type.getConstructSignatures()),
    properties: (type) => memo(typeKey(type, "properties"), () => type.getProperties()),
    indexInfos: (type) =>
      memo(typeKey(type, "indexes"), async () => {
        const infos = await checker.getIndexInfosOfType(type);
        return Promise.all(
          infos.map(async (info): Promise<IndexInfoView<Type>> => {
            const declaration = (await info.declaration?.resolve()) as ts.IndexSignatureDeclaration | undefined;
            return {
              keyType: info.keyType,
              type: info.valueType,
              readonly: info.isReadonly,
              ...(declaration ? { declaration } : {}),
            };
          }),
        );
      }),
    typeOfSymbol,
    async typesOfSymbols(symbols) {
      const missing = symbols.filter((symbol) => !cache.has(symbolKey(symbol, "type")));
      if (missing.length) {
        const batch = checker.getTypeOfSymbol(missing);
        missing.forEach((symbol, index) =>
          cache.set(
            symbolKey(symbol, "type"),
            batch.then((types) => types[index]!),
          ),
        );
      }
      return Promise.all(symbols.map(typeOfSymbol));
    },
    prefetch: (work, hints) =>
      Promise.all([
        ...(work.types ?? []).map((type) => prefetchType(type, hints, SIGNATURE_LOOKAHEAD)),
        ...(work.symbols ?? []).map(prefetchSymbol),
        ...(work.signatures ?? []).map((signature) => prefetchSignature(signature, hints, SIGNATURE_LOOKAHEAD)),
      ]).then(() => undefined),

    name: (symbol) => symbol.name,
    symbolFacts: (symbol) => facts(symbol.flags, symbolFactFlags),
    checkFacts: (symbol) =>
      (symbol.checkFlags & CheckFlags.Readonly ? CheckFact.Readonly : 0) |
      (symbol.checkFlags & (CheckFlags.SyntheticProperty | CheckFlags.Mapped) ? CheckFact.SyntheticOrMapped : 0),
    declarations: (symbol) =>
      memo(symbolKey(symbol, "declarations"), () => resolveAll<ts.Declaration>(symbol.declarations)),
    valueDeclaration: (symbol) =>
      memo(
        symbolKey(symbol, "valueDeclaration"),
        async () => (await symbol.valueDeclaration?.resolve()) as ts.Declaration | undefined,
      ),
    async displayName(symbol) {
      // `[Symbol.iterator]`: symbol-keyed members are declared with a computed name.
      for (const declaration of await backend.declarations(symbol)) {
        const name = (declaration as ts.Declaration & { name?: ts.Node }).name;
        if (name?.kind === syntax.SyntaxKind.ComputedPropertyName) return name.getText();
      }
      return symbol.name;
    },
    aliasedSymbol: (symbol) => memo(symbolKey(symbol, "aliased"), () => checker.getAliasedSymbol(symbol)),
    symbolAtLocation(node) {
      let symbol = nodeSymbols.get(node);
      if (!symbol) {
        symbol = checker.getSymbolAtLocation(node as never);
        nodeSymbols.set(node, symbol);
      }
      return symbol;
    },

    signature: (signature) =>
      memo(signatureKey(signature, "view"), async () => {
        const [parameters, thisParameter, typeParameters, declaration] = await Promise.all([
          signature.getParameters(),
          signature.getThisParameter(),
          signature.getTypeParameters(),
          signature.declaration?.resolve(),
        ]);
        return {
          parameters,
          ...(thisParameter ? { thisParameter } : {}),
          typeParameters,
          ...(declaration ? { declaration: declaration as unknown as ts.SignatureDeclaration } : {}),
        };
      }),
    returnType: (signature) => memo(signatureKey(signature, "return"), () => signature.getReturnType()),
    async predicate(signature) {
      const predicate = await memo(signatureKey(signature, "predicate"), () =>
        checker.getTypePredicateOfSignature(signature),
      );
      if (!predicate) return undefined;
      return {
        asserts:
          predicate.kind === TypePredicateKind.AssertsIdentifier || predicate.kind === TypePredicateKind.AssertsThis,
        ...(predicate.parameterName !== undefined ? { parameterName: predicate.parameterName } : {}),
        ...(predicate.type ? { type: predicate.type } : {}),
      };
    },
    isOptionalParameter(parameter) {
      if (parameter.questionToken) return true;
      if (!parameter.initializer) return false;
      // A default value makes a parameter optional only when every later parameter is optional too.
      const parameters = parameter.parent.parameters;
      return parameters
        .slice(parameters.indexOf(parameter) + 1)
        .every((later) => !!later.questionToken || !!later.initializer || !!later.dotDotDotToken);
    },
    async typeParameter(type) {
      const parameter = type as TypeParameter;
      const symbol = await typeSymbol(parameter);
      const [declarations, defaultType, constraintType] = await Promise.all([
        symbol ? backend.declarations(symbol) : Promise.resolve([]),
        checker.getDefaultFromTypeParameter(parameter),
        checker.getConstraintOfTypeParameter(parameter),
      ]);
      const declaration = declarations.find((node) => node.kind === syntax.SyntaxKind.TypeParameter) as
        ts.TypeParameterDeclaration | undefined;
      return {
        name: symbol?.name ?? "",
        ...(declaration ? { declaration } : {}),
        ...(defaultType ? { default: defaultType } : {}),
        ...(constraintType ? { constraintType } : {}),
      };
    },

    typeAtLocation: (node) => checker.getTypeAtLocation(node as never),
    declaredTypeOfSymbol: (symbol) => checker.getDeclaredTypeOfSymbol(symbol),
    typeOfSymbolAtLocation: (symbol, node) => checker.getTypeOfSymbolAtLocation(symbol, node as never),
    resolvedSignature: (node) => checker.getResolvedSignature(node as never),
  };

  /**
   * Fetch what visiting a type needs in batched rounds: its names and text, then its apparent shape, then (one level
   * deep) the signatures of functions, which are expanded at any depth.
   */
  async function prefetchType(type: Type, hints: PrefetchHints, depth: number): Promise<void> {
    const typeFacts = backend.typeFacts(type);
    const pending: Promise<unknown>[] = [
      typeSymbol(type),
      backend.aliasName(type) as Promise<unknown>,
      backend.typeToString(type, {
        noTruncation: hints.noTruncation || !!(typeFacts & PRIMITIVE_FACTS),
      }) as Promise<unknown>,
    ];
    if (typeFacts & (PRIMITIVE_FACTS | TypeFact.TypeParameter | TypeFact.Deferred)) {
      await Promise.all(pending);
      return;
    }
    const reference = backend.reference(type);
    if (reference) pending.push(reference as Promise<unknown>);
    const apparent = await backend.apparentType(type);
    const [calls, constructs] = await Promise.all([
      backend.callSignatures(apparent),
      backend.constructSignatures(apparent),
      backend.isArray(apparent),
      backend.isTuple(apparent),
      backend.properties(apparent),
      backend.indexInfos(apparent),
      backend.typeFacts(apparent) & TypeFact.Union ? backend.constituents(apparent) : undefined,
      ...pending,
    ]);
    if (depth > 0) {
      const signatures = [...calls, ...constructs].slice(0, hints.maxSignatures);
      await Promise.all(signatures.map((signature) => prefetchSignature(signature, hints, depth - 1)));
    }
  }

  async function prefetchSignature(signature: Signature, hints: PrefetchHints, depth: number): Promise<void> {
    const [view, returnType] = await Promise.all([
      backend.signature(signature),
      backend.returnType(signature),
      backend.predicate(signature),
    ]);
    const parameters = view.thisParameter ? [view.thisParameter, ...view.parameters] : view.parameters;
    const [parameterTypes] = await Promise.all([backend.typesOfSymbols(parameters), ...parameters.map(prefetchSymbol)]);
    await Promise.all([...parameterTypes, returnType].map((type) => prefetchType(type, hints, depth)));
  }

  async function prefetchSymbol(symbol: ApiSymbol): Promise<void> {
    const [declarations] = await Promise.all([backend.declarations(symbol), backend.valueDeclaration(symbol)]);
    // Skipped type names are checked against the symbols that annotations refer to.
    const names = declarations.flatMap((declaration) =>
      annotationNames((declaration as ts.Declaration & { type?: ts.Node }).type),
    );
    await Promise.all(
      names.map(async (name) => {
        const target = await backend.symbolAtLocation(name);
        if (target && backend.symbolFacts(target) & SymbolFact.Alias) await backend.aliasedSymbol(target);
      }),
    );
  }

  /** Type reference names in an annotation, as far as the builder looks: parentheses, array elements, `Array<T>`. */
  function annotationNames(annotation: ts.Node | undefined): ts.Node[] {
    const K = syntax.SyntaxKind;
    if (!annotation) return [];
    if (annotation.kind === K.ParenthesizedType) return annotationNames((annotation as ts.ParenthesizedTypeNode).type);
    if (annotation.kind === K.ArrayType) return annotationNames((annotation as ts.ArrayTypeNode).elementType);
    if (annotation.kind !== K.TypeReference) return [];
    const reference = annotation as ts.TypeReferenceNode;
    return [reference.typeName, ...annotationNames(reference.typeArguments?.[0])];
  }

  return backend;
}

/** Type information from a TypeScript 7 project, for a UTF-16 offset in the file's text in that snapshot. */
export async function getTypeInfoFromProject(
  modules: Ts7Modules,
  project: Project,
  file: string | { uri: string },
  position: number,
  options: PrettifyOptions,
  control: AnalysisControl = {},
): Promise<TypeInfo | undefined> {
  try {
    const sourceFile = await project.program.getSourceFile(file);
    if (!sourceFile) return undefined;
    const backend = await createApiBackend(modules, project.checker);
    const compilerOptions = project.program.getCompilerOptions() as { exactOptionalPropertyTypes?: boolean };
    return await runAsync(
      getTypeInfo(backend, sourceFile as unknown as ts.SourceFile, position, options, {
        ...control,
        compilerOptions: { exactOptionalPropertyTypes: compilerOptions.exactOptionalPropertyTypes === true },
      }),
    );
  } catch (error) {
    control.onError?.(error);
    return undefined;
  }
}
