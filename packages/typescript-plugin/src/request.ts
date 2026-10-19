import type * as ts from "typescript";

import type { PrettifyOptions } from "@prettify-ts/core/src/options";
import type { TypeInfo } from "@prettify-ts/core/src/types";

export type { PrettifyOptions };

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
