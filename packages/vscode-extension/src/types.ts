import type * as ts from 'typescript'

export type TypeProperty = { name: string, readonly: boolean, type: TypeTree }
export type TypeFunctionSignature = { returnType: TypeTree, parameters: TypeProperty[] }

/**
 * TypeTree is a tree representation of a TypeScript type.
 */
export type TypeTree = { typeName: string } & (
  | { kind: 'union', types: TypeTree[] }
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
  maxDepth: number
  maxProperties: number
  maxSubProperties: number
  unwrapFunctions: boolean
  unwrapArrays: boolean
  unwrapPromises: boolean
  skippedTypeNames: string[]
}

export type PrettifyRequest = {
  meta: 'prettify-type-info-request'
  options: PrettifyOptions
}
