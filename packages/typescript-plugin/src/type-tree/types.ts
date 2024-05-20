import type * as ts from 'typescript'

/**
 * TypeTree is a tree representation of a TypeScript type.
 */
export type TypeTree = { typeName: string } & (
  | { kind: 'union', types: TypeTree[] }
  | { kind: 'intersection', types: TypeTree[] }
  | { kind: 'object', properties: Array<{ name: string, readonly?: boolean, type: TypeTree }> }
  | { kind: 'array', readonly?: boolean, elementType: TypeTree }
  | { kind: 'function', returnType: TypeTree, parameters: Array<{ name: string, type: TypeTree }> }
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
