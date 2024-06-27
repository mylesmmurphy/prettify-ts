import type * as ts from 'typescript'

import type { TypeInfo } from './type-tree/types'

export type PrettifyOptions = {
  hidePrivateProperties: boolean
  maxDepth: number
  maxProperties: number
  maxSubProperties: number
  maxUnionMembers: number
  skippedTypeNames: string[]
  unwrapArrays: boolean
  unwrapFunctions: boolean
  unwrapPromises: boolean
}

export type PrettifyRequest = {
  meta: 'prettify-type-info-request'
  options: PrettifyOptions
}

export type PrettifyCompletionsTriggerCharacter = PrettifyRequest | ts.CompletionsTriggerCharacter | undefined

export type PrettifyResponse = ts.WithMetadata<ts.CompletionInfo> & {
  __prettifyResponse?: TypeInfo
}

export function isPrettifyRequest (request: PrettifyCompletionsTriggerCharacter): request is PrettifyRequest {
  return !!request && typeof request === 'object' && 'meta' in request && request['meta'] === 'prettify-type-info-request'
}
