import type * as ts from 'typescript'

export type TypeProperty = { name: string, readonly: boolean, type: TypeTree }
export type TypeFunctionParameter = { name: string, isRestParameter: boolean, type: TypeTree }
export type TypeFunctionSignature = { returnType: TypeTree, parameters: TypeFunctionParameter[] }

/**
 * TypeTree is a tree representation of a TypeScript type.
 */
export type TypeTree = { typeName: string } & (
  | { kind: 'union', excessMembers: number, types: TypeTree[] }
  | { kind: 'intersection', types: TypeTree[] }
  | { kind: 'object', excessProperties: number, properties: TypeProperty[] }
  | { kind: 'array', readonly: boolean, elementType: TypeTree }
  | { kind: 'function', signatures: TypeFunctionSignature[] }
  | { kind: 'promise', type: TypeTree }
  | { kind: 'enum', member: string }
  | { kind: 'basic' } // https://www.typescriptlang.org/docs/handbook/basic-types.html
)

/**
 * TypeInfo contains the type information of a TypeScript node.
 */
export type TypeInfo = {
  typeTree: TypeTree
  syntaxKind: ts.SyntaxKind
  name: string
}

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
