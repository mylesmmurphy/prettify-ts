import { SyntaxKind } from 'ts-morph'

/**
 * Builds a declaration string based on the syntax kind
 */
export function buildDeclarationString (syntaxKind: SyntaxKind, typeName: string, typeString: string): string {
  switch (syntaxKind) {
    case SyntaxKind.ClassDeclaration:
    case SyntaxKind.NewExpression:
      return `class ${typeName} ${typeString}`

    case SyntaxKind.ExpressionWithTypeArguments:
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
  if (!Array.isArray(ignoredNestedTypes) || ignoredNestedTypes.length === 0) {
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

export function formatDeclarationString (declarationString: string, indentation: number): string {
  if (indentation < 1) return declarationString

  // Add newline after { and ;
  const splitDeclarationString = declarationString
    .replace(/{/g, '{\n')
    .replace(/}/g, '\n}')
    .replace(/;/g, ';\n')

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

    result += ' '.repeat(indentation).repeat(depth) + trimmedLine + '\n'

    if (hasOpenBrace) {
      depth++
    }
  }

  // Remove empty braces newlines
  result = result.replace(/{\s*\n*\s*}/g, '{}')

  // Remove empty lines
  result = result.replace(/^\s*[\r\n]/gm, '')
  return result
}

export function washString (str: string): string {
  // Remove the first line
  str = str.replace(/.*\n/, '')

  // Remove all whitespace, newlines, and semicolons
  return str.replace(/\s/g, '').replace(/\n/g, '').replace(/;/g, '')
}
