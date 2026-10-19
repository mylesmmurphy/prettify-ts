import type * as ts from "typescript";
import type { SyntaxModule } from "./syntax";

/** A result available now (the in-process compiler) or later (an asynchronous backend). */
export type Step<T> = T | PromiseLike<T>;

/**
 * A builder computation. Each compiler query is yielded, so the same builder runs synchronously inside TS Server
 * (runSync) and asynchronously against a backend whose queries are requests to another process (runAsync).
 */
export type Computation<T> = Generator<unknown, T, unknown>;

/**
 * Wait for one compiler query. Only pending results suspend: resuming a suspended builder passes through every
 * enclosing `yield*`, so the in-process compiler, whose results are never pending, runs without suspending at all.
 * Available results also skip creating a generator: `yield*` reads the shared finished iterator immediately,
 * before any other query can run.
 */
export function step<T>(value: Step<T>): Computation<T> {
  if (isPromiseLike(value)) return suspend(value);
  pending = value;
  return finishedIterator as Computation<T>;
}

function* suspend<T>(value: PromiseLike<T>): Computation<T> {
  return (yield value) as T;
}

/** The available result between `step` and the `yield*` that reads it; cleared on reading, so it never outlives a query. */
let pending: unknown;
const finishedIterator = {
  next(): IteratorReturnResult<unknown> {
    const value = pending;
    pending = undefined;
    return { done: true, value };
  },
  [Symbol.iterator]() {
    return this;
  },
} as unknown as Computation<unknown>;

function isPromiseLike<T>(value: Step<T>): value is PromiseLike<T> {
  return (
    !!value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

export function runSync<T>(computation: Computation<T>): T {
  let result = computation.next();
  while (!result.done) {
    if (isPromiseLike(result.value)) throw new Error("A synchronous backend returned a promise");
    result = computation.next(result.value);
  }
  return result.value;
}

export async function runAsync<T>(computation: Computation<T>): Promise<T> {
  let result = computation.next();
  while (!result.done) {
    let value: unknown;
    try {
      value = await result.value;
    } catch (error) {
      result = computation.throw(error);
      continue;
    }
    result = computation.next(value);
  }
  return result.value;
}

/** Type categories used by the builder, independent of each compiler's TypeFlags numbering. */
export const TypeFact = {
  Any: 1 << 0,
  Unknown: 1 << 1,
  String: 1 << 2,
  StringLiteral: 1 << 3,
  TemplateLiteral: 1 << 4,
  Number: 1 << 5,
  NumberLiteral: 1 << 6,
  Boolean: 1 << 7,
  BooleanLiteral: 1 << 8,
  BigInt: 1 << 9,
  BigIntLiteral: 1 << 10,
  ESSymbol: 1 << 11,
  UniqueESSymbol: 1 << 12,
  Void: 1 << 13,
  Undefined: 1 << 14,
  Null: 1 << 15,
  Never: 1 << 16,
  /** The `object` keyword. */
  NonPrimitive: 1 << 17,
  EnumLike: 1 << 18,
  TypeParameter: 1 << 19,
  /** Conditional, `keyof` and indexed access types, shown as written. */
  Deferred: 1 << 20,
  Object: 1 << 21,
  Union: 1 << 22,
  Intersection: 1 << 23,
  /** An object type created by a mapped type. */
  Mapped: 1 << 24,
  ClassOrInterface: 1 << 25,
  /** The implicit `undefined` of an optional property under exactOptionalPropertyTypes. */
  Missing: 1 << 26,
} as const;

/** Types shown by their compiler text rather than expanded. Enum-like types are excluded separately. */
export const PRIMITIVE_FACTS =
  TypeFact.String |
  TypeFact.StringLiteral |
  TypeFact.TemplateLiteral |
  TypeFact.Number |
  TypeFact.NumberLiteral |
  TypeFact.Boolean |
  TypeFact.BooleanLiteral |
  TypeFact.Undefined |
  TypeFact.Null |
  TypeFact.Void |
  TypeFact.BigInt |
  TypeFact.BigIntLiteral |
  TypeFact.ESSymbol |
  TypeFact.UniqueESSymbol |
  TypeFact.Never |
  TypeFact.Unknown |
  TypeFact.Any |
  // The `object` keyword; its apparent type is `{}`, which would also accept primitives.
  TypeFact.NonPrimitive;

export const SymbolFact = {
  Optional: 1 << 0,
  GetAccessor: 1 << 1,
  SetAccessor: 1 << 2,
  Alias: 1 << 3,
  Class: 1 << 4,
} as const;

/** Resolved modifier metadata; covers mapped +/-readonly and synthesized intersection properties. */
export const CheckFact = {
  Readonly: 1 << 0,
  SyntheticOrMapped: 1 << 1,
} as const;

export type TupleElementView<T> = {
  type: T;
  optional: boolean;
  /** `...T[]`: an array rest element. */
  rest: boolean;
  /** `...T`: a generic spread. */
  variadic: boolean;
  label?: ts.NamedTupleMember | ts.ParameterDeclaration;
};

export type IndexInfoView<T> = {
  keyType: T;
  type: T;
  readonly: boolean;
  declaration?: ts.IndexSignatureDeclaration;
};

export type SignatureView<T, S> = {
  parameters: readonly S[];
  thisParameter?: S;
  typeParameters: readonly T[];
  declaration?: ts.SignatureDeclaration;
};

export type PredicateView<T> = { asserts: boolean; parameterName?: string; type?: T };

/** Either the constraint as written (`K extends keyof T`) or, when unavailable, a constraint type. */
export type TypeParameterView<T> = {
  name: string;
  declaration?: ts.TypeParameterDeclaration;
  default?: T;
  constraintText?: string;
  constraintType?: T;
};

/** A generic instantiation: its target's name and type arguments. */
export type ReferenceView<T> = { targetName?: string; arguments: readonly T[] };

export type PrefetchWork<T, S, G> = { types?: readonly T[]; symbols?: readonly S[]; signatures?: readonly G[] };

/** What the builder will ask for, so a prefetch fetches the same compiler text and no more signatures than shown. */
export type PrefetchHints = { noTruncation: boolean; maxSignatures: number };

/**
 * The compiler queries the builder needs. T, S and G are the compiler's own type, symbol and signature objects;
 * identity must be stable for the duration of one request. Nodes use the TypeScript AST shape.
 */
export interface Backend<T extends object, S extends object, G extends object> {
  readonly syntax: SyntaxModule;
  readonly version: string;
  /** Fetch member types in one batch, and warm caches before visiting siblings. */
  readonly batches: boolean;

  typeFacts(type: T): number;
  intrinsicName(type: T): string | undefined;
  stringLiteralValue(type: T): string | undefined;
  typeToString(type: T, format: { alias?: boolean; noTruncation?: boolean }): Step<string>;
  apparentType(type: T): Step<T>;
  /** Members of a union or intersection. */
  constituents(type: T): Step<readonly T[]>;
  aliasName(type: T): Step<string | undefined>;
  aliasArguments(type: T): Step<readonly T[]>;
  symbolName(type: T): Step<string | undefined>;
  reference(type: T): Step<ReferenceView<T> | undefined>;
  isArray(type: T): Step<boolean>;
  isTuple(type: T): Step<boolean>;
  tuple(type: T): Step<{ readonly: boolean; elements: TupleElementView<T>[] }>;
  /** `Enum.Member` for enum member types. */
  enumMemberName(type: T): Step<string | undefined>;
  callSignatures(type: T): Step<readonly G[]>;
  constructSignatures(type: T): Step<readonly G[]>;
  properties(type: T): Step<readonly S[]>;
  indexInfos(type: T): Step<readonly IndexInfoView<T>[]>;
  typeOfSymbol(symbol: S): Step<T>;
  typesOfSymbols(symbols: readonly S[]): Step<readonly T[]>;
  /** Warm caches for objects about to be visited, in a few batched rounds. Only called when `batches` is set. */
  prefetch(work: PrefetchWork<T, S, G>, hints: PrefetchHints): Step<void>;

  name(symbol: S): string;
  symbolFacts(symbol: S): number;
  checkFacts(symbol: S): number;
  declarations(symbol: S): Step<readonly ts.Declaration[]>;
  valueDeclaration(symbol: S): Step<ts.Declaration | undefined>;
  /** Display name of symbol-keyed members, such as `[Symbol.iterator]`. */
  displayName(symbol: S): Step<string>;
  aliasedSymbol(symbol: S): Step<S>;
  symbolAtLocation(node: ts.Node): Step<S | undefined>;

  signature(signature: G): Step<SignatureView<T, S>>;
  returnType(signature: G): Step<T>;
  predicate(signature: G): Step<PredicateView<T> | undefined>;
  isOptionalParameter(parameter: ts.ParameterDeclaration): Step<boolean>;
  typeParameter(type: T, format: { noTruncation?: boolean }): Step<TypeParameterView<T>>;

  typeAtLocation(node: ts.Node): Step<T>;
  declaredTypeOfSymbol(symbol: S): Step<T>;
  typeOfSymbolAtLocation(symbol: S, node: ts.Node): Step<T>;
  resolvedSignature(node: ts.NewExpression): Step<G | undefined>;
}
