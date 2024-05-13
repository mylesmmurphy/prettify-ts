export type TypeInfo =
  | { kind: 'union', types: TypeInfo[] }
  | { kind: 'intersection', types: TypeInfo[] }
  | { kind: 'object', properties: Array<{ name: string, type: TypeInfo }> }
  | { kind: 'array', elementType: TypeInfo }
  | { kind: 'function', returnType: TypeInfo, parameters: Array<{ name: string, type: TypeInfo }> }
  | { kind: 'promise', type: TypeInfo }
  | { kind: 'primitive', type: string }
