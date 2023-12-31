import * as path from 'path'
import * as fs from 'fs'

import { SyntaxKind } from 'ts-morph'

export const getTsConfigPath = (fileName: string): string | undefined => {
  // Start with the directory of the file
  let dir = path.dirname(fileName)

  // Loop until we reach the root directory
  while (dir !== '/' && dir !== '' && dir !== '.' && dir.length > 0) {
    // Construct the path to tsconfig.json in the current directory
    const tsConfigPath = path.join(dir, 'tsconfig.json')

    // If tsconfig.json exists in the current directory, return its path
    if (fs.existsSync(tsConfigPath)) {
      return tsConfigPath
    }

    // Move up to the parent directory
    const parentDir = path.dirname(dir)
    if (dir === parentDir) {
      break // We've reached the root directory
    }
    dir = parentDir
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

    result += ' '.repeat(indentation).repeat(depth) + trimmedLine + '\n'

    if (hasOpenBrace) {
      depth++
    }
  }

  return result
}

export function washString (str: string): string {
  // Remove all whitespace, newlines, and semicolons
  return str.replace(/\s/g, '').replace(/\n/g, '').replace(/;/g, '')
}
