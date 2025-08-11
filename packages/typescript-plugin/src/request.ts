import type * as ts from "typescript";

import type { TypeInfo } from "./type-tree/types";

/**
 * Prettify Request options. These options control how the type information is prettified.
 */
export type PrettifyOptions = {
  /**
   * Denotes whether to hide private properties in the type information.
   */
  hidePrivateProperties: boolean;

  /**
   * Determines the maximum depth of the type tree.
   * This limits how deeply nested types will be expanded.
   */
  maxDepth: number;

  /**
   * Specifies the maximum number of properties to include in an object type.
   * If the number of properties exceeds this limit, the excess properties will be summarized.
   */
  maxProperties: number;

  /**
   * Specifies the maximum number of sub-properties to include in an object type.
   * Sub-properties are properties of properties.
   */
  maxSubProperties: number;

  /**
   * Specifies the maximum number of members to include in a union type.
   */
  maxUnionMembers: number;

  /**
   * Specifies the maximum number of function signatures to include in a function type.
   */
  maxFunctionSignatures: number;

  /**
   * List of type names to skip unwrapping in the type tree.
   */
  skippedTypeNames: string[];

  /**
   * Denotes whether to unwrap arrays in the type tree.
   */
  unwrapArrays: boolean;

  /**
   * Denotes whether to unwrap functions in the type tree.
   */
  unwrapFunctions: boolean;

  /**
   * List of generic type names whose arguments should be displayed as-is, rather than resolving to their apparent (final) type.
   */
  unwrapGenericArgumentsTypeNames: string[];

  /**
   * Controls whether to generate displayParts information for semantic token highlighting.
   *
   * When enabled (true):
   * - TypeTree nodes will include SymbolDisplayPart arrays for proper syntax highlighting
   * - Enables semantic coloring in editors that support it
   * - Adds ~5-10ms overhead to hover response time for complex types
   * - Memory usage increases by approximately 0.5-1KB per TypeTree node
   *
   * When disabled (false):
   * - TypeTree nodes will only contain the typeName string
   * - The typeTreeToDisplayParts function will provide basic fallback display parts
   * - Maintains optimal performance for large codebases
   *
   * @default false - Disabled by default for backward compatibility and performance
   *
   * @remarks
   * Display parts generation is automatically skipped at maximum depth to prevent performance degradation.
   */
  generateDisplayParts?: boolean;

  /**
   * Performance warning threshold in milliseconds.
   * When type tree generation exceeds this duration, a warning will be logged (if DEBUG is enabled).
   *
   * @default 20 - Warns when type tree generation takes more than 20ms
   */
  perfWarningThresholdMs?: number;
};

/**
 * Request format for prettifying type information.
 * This request is sent when the user triggers a type information request with a specific character.
 */
export type PrettifyRequest = {
  meta: "prettify-type-info-request";
  options: PrettifyOptions;
};

/**
 * Overrides the default TypeScript completions trigger character type to include the PrettifyRequest.
 */
export type PrettifyCompletionsTriggerCharacter = PrettifyRequest | ts.CompletionsTriggerCharacter | undefined;

/**
 * Response format for prettified type information.
 */
export type PrettifyResponse = ts.WithMetadata<ts.CompletionInfo> & {
  __prettifyResponse?: TypeInfo;
};

/**
 * Determines if the request is a PrettifyRequest.
 */
export function isPrettifyRequest(request: PrettifyCompletionsTriggerCharacter): request is PrettifyRequest {
  return (
    Boolean(request) &&
    typeof request === "object" &&
    "meta" in request &&
    request["meta"] === "prettify-type-info-request"
  );
}
