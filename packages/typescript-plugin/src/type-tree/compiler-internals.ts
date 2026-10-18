import type * as ts from "typescript";

/** Keep the small compiler-internal surface explicit and checked at runtime. */
export function checkFlags(typescript: typeof ts, symbol: ts.Symbol): number {
  const internals = typescript as typeof ts & {
    getCheckFlags?: (symbol: ts.Symbol) => number;
    CheckFlags?: { Readonly: number; SyntheticProperty: number; Mapped: number };
  };
  if (!internals.getCheckFlags || !internals.CheckFlags) {
    throw new Error("This TypeScript version does not expose resolved readonly metadata");
  }
  return internals.getCheckFlags(symbol);
}

export function enumParent(symbol: ts.Symbol): ts.Symbol | undefined {
  return (symbol as ts.Symbol & { parent?: ts.Symbol }).parent;
}
