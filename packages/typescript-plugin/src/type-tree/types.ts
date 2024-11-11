import type * as ts from 'typescript'

export type TypeProperty = { name: string, optional: boolean, readonly: boolean, type: TypeTree }
export type TypeFunctionParameter = { name: string, optional: boolean, isRestParameter: boolean, type: TypeTree }
export type TypeFunctionSignature = { returnType: TypeTree, parameters: TypeFunctionParameter[] }

// TODO: Make "promise" into "generic" and add a "typeArguments" field

/**
 * TypeTree is a tree representation of a TypeScript type.
 * Discriminated by the `kind` field.
 */
export type TypeTree = { typeName: string } & (
  | { kind: 'union', excessMembers: number, types: TypeTree[] }
  | { kind: 'intersection', types: TypeTree[] }
  | { kind: 'object', excessProperties: number, properties: TypeProperty[] }
  | { kind: 'array', readonly: boolean, elementType: TypeTree }
  | { kind: 'function', signatures: TypeFunctionSignature[] }
  | { kind: 'promise', type: TypeTree }
  | { kind: 'enum', member: string }
  | { kind: 'primitive' } // string, number, boolean, symbol, bigint, undefined, null, void, never, any
  | { kind: 'reference' } // Named types like classes, interfaces, type aliases, etc. when maxDepth is reached
)

/**
 * TypeInfo contains the type information of a TypeScript node.
 */
export type TypeInfo = {
  typeTree: TypeTree
  syntaxKind: ts.SyntaxKind
  variableDeclarationKind?: 'let' | 'const' | 'var'
  name: string
}
