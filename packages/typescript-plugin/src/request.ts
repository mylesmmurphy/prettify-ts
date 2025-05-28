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
    !!request && typeof request === "object" && "meta" in request && request["meta"] === "prettify-type-info-request"
  );
}
