import type * as ts from 'typescript'

export type TypeInfo = { typeName: string } & (
  | { kind: 'union', types: TypeInfo[] }
  | { kind: 'intersection', types: TypeInfo[] }
  | { kind: 'object', properties: Array<{ name: string, type: TypeInfo }> }
  | { kind: 'array', elementType: TypeInfo }
  | { kind: 'function', returnType: TypeInfo, parameters: Array<{ name: string, type: TypeInfo }> }
  | { kind: 'promise', type: TypeInfo }
  | { kind: 'basic', type: string } // https://www.typescriptlang.org/docs/handbook/basic-types.html
)

export type PrettifyResponse = {
  typeInfo: TypeInfo
  syntaxKind: ts.SyntaxKind
  name: string
}
