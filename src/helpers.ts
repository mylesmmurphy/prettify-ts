import { SyntaxKind } from 'ts-morph'

/**
 * https://github.com/microsoft/TypeScript/blob/main/src/compiler/types.ts
 * HasType Type
 */
export function hasType (syntaxKind: SyntaxKind): boolean {
  switch (syntaxKind) {
    case SyntaxKind.ImportSpecifier:
    case SyntaxKind.ArrayType:
    case SyntaxKind.ClassDeclaration:
    case SyntaxKind.ConstructorType:
    case SyntaxKind.ConstructSignature:
    case SyntaxKind.FunctionType:
    case SyntaxKind.IndexedAccessType:
    case SyntaxKind.IndexSignature:
    case SyntaxKind.InterfaceDeclaration:
    case SyntaxKind.IntersectionType:
    case SyntaxKind.MappedType:
    case SyntaxKind.MethodSignature:
    case SyntaxKind.NewExpression:
    case SyntaxKind.Parameter:
    case SyntaxKind.ParenthesizedType:
    case SyntaxKind.PropertyAccessExpression:
    case SyntaxKind.PropertyAssignment:
    case SyntaxKind.PropertyDeclaration:
    case SyntaxKind.PropertySignature:
    case SyntaxKind.QualifiedName:
    case SyntaxKind.ShorthandPropertyAssignment:
    case SyntaxKind.ThisType:
    case SyntaxKind.TupleType:
    case SyntaxKind.TypeAliasDeclaration:
    case SyntaxKind.TypeAssertionExpression:
    case SyntaxKind.TypeLiteral:
    case SyntaxKind.TypeOperator:
    case SyntaxKind.TypePredicate:
    case SyntaxKind.TypeQuery:
    case SyntaxKind.TypeReference:
    case SyntaxKind.UnionType:
    case SyntaxKind.VariableDeclaration:
      return true
    default:
      return false
  }
}

/**
 * Builds a declaration string based on the syntax kind
 */
export function buildDeclarationString (syntaxKind: SyntaxKind, typeName: string, typeString: string): string {
  switch (syntaxKind) {
    case SyntaxKind.ClassDeclaration:
    case SyntaxKind.NewExpression:
      return `class ${typeName} ${typeString}`

    case SyntaxKind.InterfaceDeclaration:
    case SyntaxKind.QualifiedName:
      return `interface ${typeName} ${typeString}`

    case SyntaxKind.ArrayType:
    case SyntaxKind.ConstructorType:
    case SyntaxKind.ConstructSignature:
    case SyntaxKind.FunctionType:
    case SyntaxKind.IndexedAccessType:
    case SyntaxKind.IndexSignature:
    case SyntaxKind.IntersectionType:
    case SyntaxKind.MappedType:
    case SyntaxKind.PropertySignature:
    case SyntaxKind.ThisType:
    case SyntaxKind.TupleType:
    case SyntaxKind.TypeAliasDeclaration:
    case SyntaxKind.TypeAssertionExpression:
    case SyntaxKind.TypeLiteral:
    case SyntaxKind.TypeOperator:
    case SyntaxKind.TypePredicate:
    case SyntaxKind.TypeQuery:
    case SyntaxKind.TypeReference:
    case SyntaxKind.UnionType:
      return `type ${typeName} = ${typeString}`

    default:
      return `const ${typeName}: ${typeString}`
  }
}

/**
 * Builds the prettify type string depending on user settings
 */
export function getPrettifyType (prettifyId: string, viewNestedTypes: boolean, ignoredNestedTypes: string[]): string {
  if (ignoredNestedTypes.length === 0) {
    ignoredNestedTypes = ['undefined']
  }

  const objectPropType = viewNestedTypes
    ? `Prettify_${prettifyId}<T[P]>`
    : 'T[P]'

  return `T extends ${ignoredNestedTypes.join(' | ')}
      ? T
      : T extends Array<infer U>
        ? Prettify_${prettifyId}<U>[]
        : T extends object
          ? { [P in keyof T]: ${objectPropType} } & unknown
          : T;`
}

export function formatDeclarationString (declarationString: string): string {
  // Add newline after { and ; to make the type string more readable
  const splitDeclarationString = declarationString.replace(/{\s/g, '{\n').replace(/;\s/g, ';\n')

  let depth = 0
  let result = ''
  const lines = splitDeclarationString.split('\n')

  for (const line of lines) {
    const trimmedLine = line.trim()
    const hasOpenBrace = trimmedLine.includes('{')
    const hasCloseBrace = trimmedLine.includes('}')

    if (hasCloseBrace) {
      depth--
    }

    result += '  '.repeat(depth) + trimmedLine + '\n'

    if (hasOpenBrace) {
      depth++
    }
  }

  return result
}

export function washString (str: string): string {
  return str.replace(/^export\s/, '').replace(/\s/g, '').replace(/;/g, '')
}
