import type { PrettifyOptions } from "./request";

export const DEFAULT_OPTIONS: PrettifyOptions = {
  hidePrivateProperties: true,
  treatUnderscoreAsPrivate: true,
  maxDepth: 1,
  maxProperties: 1000,
  maxSubProperties: 10,
  maxUnionMembers: 15,
  maxFunctionSignatures: 5,
  skippedTypeNames: ["ArrayBuffer", "Buffer", "Date", "Element", "Error", "Number", "RegExp", "String", "Symbol"],
  unwrapArrays: true,
  unwrapFunctions: true,
  unwrapGenericArgumentsTypeNames: ["Promise", "Set", "Map", "Observable"],
};

export const DISPLAY_DEFAULTS = { enabled: true, typeIndentation: 4, maxCharacters: 20000 };
export const MAX_OUTPUT_CHARACTERS = 99000;
export const MAX_ANALYSIS_NODES = 5000;
export const MAX_TRAVERSAL_DEPTH = 48;

export function integerSetting(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.floor(value)))
    : fallback;
}

export function normalizeOptions(input: Partial<PrettifyOptions> = {}): PrettifyOptions {
  if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
  const result = { ...DEFAULT_OPTIONS };
  for (const key of ["hidePrivateProperties", "treatUnderscoreAsPrivate", "unwrapArrays", "unwrapFunctions"] as const) {
    if (typeof input[key] === "boolean") result[key] = input[key];
  }
  for (const key of [
    "maxDepth",
    "maxProperties",
    "maxSubProperties",
    "maxUnionMembers",
    "maxFunctionSignatures",
  ] as const) {
    result[key] = integerSetting(
      input[key],
      DEFAULT_OPTIONS[key],
      key === "maxDepth" ? 0 : 1,
      key === "maxDepth"
        ? 20
        : key === "maxFunctionSignatures"
          ? 50
          : key === "maxUnionMembers"
            ? 100
            : MAX_ANALYSIS_NODES,
    );
  }
  for (const key of ["skippedTypeNames", "unwrapGenericArgumentsTypeNames"] as const) {
    const value = input[key];
    result[key] = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").slice(0, 200)
      : [...DEFAULT_OPTIONS[key]];
  }
  if (typeof input.unwrapPromises === "boolean") result.unwrapPromises = input.unwrapPromises;
  result.fullExpansion = input.fullExpansion === true;
  if (result.fullExpansion) {
    result.maxDepth = 20;
    result.maxProperties = MAX_ANALYSIS_NODES;
    result.maxSubProperties = MAX_ANALYSIS_NODES;
    result.maxUnionMembers = 100;
    result.maxFunctionSignatures = 50;
    result.unwrapArrays = true;
    result.unwrapFunctions = true;
  }
  return result;
}
