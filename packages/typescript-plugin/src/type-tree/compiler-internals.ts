import type * as ts from "typescript";

/** Keep the small compiler-internal surface explicit and checked at runtime. */
export function resolvedReadonly(typescript: typeof ts, symbol: ts.Symbol): boolean | undefined {
  const internals = typescript as typeof ts & {
    getCheckFlags?: (symbol: ts.Symbol) => number;
    CheckFlags?: { Readonly: number; SyntheticProperty: number; Mapped: number };
  };
  if (!internals.getCheckFlags || !internals.CheckFlags) {
    throw new Error("This TypeScript version does not expose resolved readonly metadata");
  }
  const flags = internals.getCheckFlags(symbol);
  if (flags & internals.CheckFlags.Readonly) return true;
  if (flags & (internals.CheckFlags.SyntheticProperty | internals.CheckFlags.Mapped)) return false;
  return undefined;
}

export function enumParent(symbol: ts.Symbol): ts.Symbol | undefined {
  return (symbol as ts.Symbol & { parent?: ts.Symbol }).parent;
}
