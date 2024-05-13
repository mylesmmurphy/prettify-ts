import type * as ts from 'typescript/lib/tsserverlibrary'

export type TypeInfo =
  | { kind: 'union', types: TypeInfo[] }
  | { kind: 'intersection', types: TypeInfo[] }
  | { kind: 'object', properties: Array<{ name: string, type: TypeInfo }> }
  | { kind: 'array', elementType: TypeInfo }
  | { kind: 'function', returnType: TypeInfo, parameters: Array<{ name: string, type: TypeInfo }> }
  | { kind: 'promise', type: TypeInfo }
  | { kind: 'primitive', type: string }

/**
 * Prettify Request
 */
export type PrettifyRequest = {
  meta: 'prettify-request'
}

/**
 * Prettify Response with required type information
 */
export type FullPrettifyRequest = PrettifyRequest | ts.CompletionsTriggerCharacter | undefined

export type PrettifyResponse = {
  typeInfo?: TypeInfo
  identifier?: string
  name?: string
}

/**
 *
 */
export type FullPrettifyResponse = ts.WithMetadata<ts.CompletionInfo> & {
  __prettifyResponse?: PrettifyResponse
}
