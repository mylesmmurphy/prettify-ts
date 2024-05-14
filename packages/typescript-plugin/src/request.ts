import type * as ts from 'typescript/lib/tsserverlibrary'

import type { TypeInfo } from './type-tree/types'

/**
 * Prettify Request
 */
export type PrettifyRequest = {
  meta: 'prettify-type-info-request'
}

/**
 * TypeScript Completions Request or Prettify Request
 */
export type PrettifyCompletionsTriggerCharacter = PrettifyRequest | ts.CompletionsTriggerCharacter | undefined

/**
 * Prettify Response
 */
export type PrettifyResponse = ts.WithMetadata<ts.CompletionInfo> & {
  __prettifyResponse?: TypeInfo
}

/**
 * Type Guard for PrettifyRequest
 */
export function isPrettifyRequest (request: PrettifyCompletionsTriggerCharacter): request is PrettifyRequest {
  return !!request && typeof request === 'object' && 'meta' in request && request['meta'] === 'prettify-type-info-request'
}
