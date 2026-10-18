import type * as ts from "typescript";
import { CheckFact, SymbolFact, TypeFact } from "@prettify-ts/core/src/builder/backend";
import type { Backend, TupleElementView } from "@prettify-ts/core/src/builder/backend";
import { checkFlags, enumParent } from "./compiler-internals";

/** The builder's compiler queries over the in-process JavaScript compiler (TypeScript 6 and earlier). */
export function createCompilerBackend(
  typescript: typeof ts,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): Backend<ts.Type, ts.Symbol, ts.Signature> {
  const { TypeFlags, ObjectFlags, SymbolFlags, ElementFlags, TypeFormatFlags, NodeBuilderFlags } = typescript;
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
  const typeFacts = new WeakMap<ts.Type, number>();
  const target = (type: ts.Type) => (type as ts.TypeReference).target as ts.GenericType | undefined;

  return {
    syntax: typescript,
    version: typescript.version,
    batches: false,

    typeFacts(type) {
      const cached = typeFacts.get(type);
      if (cached !== undefined) return cached;
      let result = facts(type.flags, typeFactFlags);
      if (type.flags & TypeFlags.Object) {
        const objectFlags = (type as ts.ObjectType).objectFlags;
        if (objectFlags & ObjectFlags.Mapped) result |= TypeFact.Mapped;
        if (objectFlags & ObjectFlags.ClassOrInterface) result |= TypeFact.ClassOrInterface;
      }
      if (
        type.flags & TypeFlags.Undefined &&
        (type as ts.Type & { debugIntrinsicName?: string }).debugIntrinsicName === "missing"
      )
        result |= TypeFact.Missing;
      typeFacts.set(type, result);
      return result;
    },
    intrinsicName: (type) => (type as ts.Type & { intrinsicName?: string }).intrinsicName,
    stringLiteralValue: (type) => (type as ts.StringLiteralType).value,
    typeToString: (type, format) =>
      checker.typeToString(
        type,
        undefined,
        (format.alias ? TypeFormatFlags.InTypeAlias : TypeFormatFlags.None) |
          (format.noTruncation ? TypeFormatFlags.NoTruncation : TypeFormatFlags.None),
      ),
    apparentType: (type) => checker.getApparentType(type),
    constituents: (type) => (type as ts.UnionOrIntersectionType).types,
    aliasName: (type) => type.aliasSymbol?.getName(),
    aliasArguments: (type) => type.aliasTypeArguments ?? [],
    symbolName: (type) => type.getSymbol()?.getName(),
    reference(type) {
      const generic = target(type);
      if (!generic) return undefined;
      return {
        targetName: generic.getSymbol()?.getName(),
        arguments: checker.getTypeArguments(type as ts.TypeReference),
      };
    },
    isArray: (type) => checker.isArrayType(type),
    isTuple: (type) => checker.isTupleType(type),
    tuple(type) {
      const tuple = (type as ts.TupleTypeReference).target;
      const elements = checker
        .getTypeArguments(type as ts.TupleTypeReference)
        .map((element, index): TupleElementView<ts.Type> => {
          const flags = tuple.elementFlags[index] ?? ElementFlags.Required;
          const label = tuple.labeledElementDeclarations?.[index];
          return {
            type: element,
            optional: !!(flags & ElementFlags.Optional),
            rest: !!(flags & ElementFlags.Rest),
            variadic: !!(flags & ElementFlags.Variadic),
            ...(label ? { label } : {}),
          };
        });
      return { readonly: tuple.readonly, elements };
    },
    enumMemberName(type) {
      const symbol = type.symbol as ts.Symbol | undefined;
      const parent = symbol && enumParent(symbol);
      return symbol && symbol.flags & SymbolFlags.EnumMember && parent ? parent.name + "." + symbol.name : undefined;
    },
    callSignatures: (type) => type.getCallSignatures(),
    constructSignatures: (type) => type.getConstructSignatures(),
    properties: (type) => type.getProperties(),
    indexInfos: (type) =>
      checker.getIndexInfosOfType(type).map((info) => ({
        keyType: info.keyType,
        type: info.type,
        readonly: info.isReadonly,
        ...(info.declaration ? { declaration: info.declaration } : {}),
      })),
    typeOfSymbol: (symbol) => checker.getTypeOfSymbol(symbol),
    typesOfSymbols: (symbols) => symbols.map((symbol) => checker.getTypeOfSymbol(symbol)),
    prefetch: () => undefined,

    name: (symbol) => symbol.getName(),
    symbolFacts: (symbol) => facts(symbol.flags, symbolFactFlags),
    checkFacts(symbol) {
      const flags = checkFlags(typescript, symbol);
      const internals = typescript as typeof ts & {
        CheckFlags: { Readonly: number; SyntheticProperty: number; Mapped: number };
      };
      return (
        (flags & internals.CheckFlags.Readonly ? CheckFact.Readonly : 0) |
        (flags & (internals.CheckFlags.SyntheticProperty | internals.CheckFlags.Mapped)
          ? CheckFact.SyntheticOrMapped
          : 0)
      );
    },
    declarations: (symbol) => symbol.declarations ?? [],
    valueDeclaration: (symbol) => symbol.valueDeclaration,
    displayName: (symbol) => checker.symbolToString(symbol),
    aliasedSymbol: (symbol) => checker.getAliasedSymbol(symbol),
    symbolAtLocation: (node) => checker.getSymbolAtLocation(node),

    signature: (signature) => ({
      parameters: signature.parameters,
      ...(signature.thisParameter ? { thisParameter: signature.thisParameter } : {}),
      typeParameters: signature.typeParameters ?? [],
      ...(signature.getDeclaration() ? { declaration: signature.getDeclaration() } : {}),
    }),
    returnType: (signature) => checker.getReturnTypeOfSignature(signature),
    predicate(signature) {
      const predicate = checker.getTypePredicateOfSignature(signature);
      if (!predicate) return undefined;
      return {
        asserts:
          predicate.kind === typescript.TypePredicateKind.AssertsIdentifier ||
          predicate.kind === typescript.TypePredicateKind.AssertsThis,
        ...("parameterName" in predicate && predicate.parameterName !== undefined
          ? { parameterName: predicate.parameterName }
          : {}),
        ...(predicate.type ? { type: predicate.type } : {}),
      };
    },
    isOptionalParameter: (parameter) => checker.isOptionalParameter(parameter),
    typeParameter(type, format) {
      const parameter = type as ts.TypeParameter;
      const defaultType = checker.getDefaultFromTypeParameter(parameter);
      const declaration = parameter.symbol.declarations?.find(typescript.isTypeParameterDeclaration);
      const node = checker.typeParameterToDeclaration(
        parameter,
        undefined,
        NodeBuilderFlags.IgnoreErrors |
          NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope |
          (format.noTruncation ? NodeBuilderFlags.NoTruncation : NodeBuilderFlags.None),
      );
      const base = node ? undefined : checker.getBaseConstraintOfType(parameter);
      return {
        name: parameter.symbol.getName(),
        ...(declaration ? { declaration } : {}),
        ...(defaultType ? { default: defaultType } : {}),
        ...(node?.constraint
          ? {
              constraintText: typescript
                .createPrinter({ removeComments: true })
                .printNode(typescript.EmitHint.Unspecified, node.constraint, sourceFile),
            }
          : {}),
        ...(base ? { constraintType: base } : {}),
      };
    },

    typeAtLocation: (node) => checker.getTypeAtLocation(node),
    declaredTypeOfSymbol: (symbol) => checker.getDeclaredTypeOfSymbol(symbol),
    typeOfSymbolAtLocation: (symbol, node) => checker.getTypeOfSymbolAtLocation(symbol, node),
    resolvedSignature: (node) => checker.getResolvedSignature(node),
  };
}
