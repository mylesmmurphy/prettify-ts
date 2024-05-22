import { SyntaxKind } from 'typescript'
import type { TypeTree } from './types'

/**
 * Uses type info to return a string representation of the type
 *
 * Example:
 * { kind: 'union', types: [{ kind: 'basic', type: 'string' }, { kind: 'basic', type: 'number' }] }
 * Yields:
 * 'string | number'
 */
export function stringifyTypeTree (typeTree: TypeTree): string {
  if (typeTree.kind === 'union') {
    return typeTree.types.map(stringifyTypeTree).join(' | ')
  }

  if (typeTree.kind === 'intersection') {
    const nonObjectTypeStrings = typeTree.types.filter(t => t.kind !== 'object').map(stringifyTypeTree)

    const objectTypes = typeTree.types.filter((t): t is Extract<TypeTree, { kind: 'object' }> => t.kind === 'object')
    const objectTypesProperties = objectTypes.flatMap(t => t.properties)
    const objectTypeExcessProperties = objectTypes.reduce((acc, t) => acc + t.excessProperties, 0)
    const mergedObjectTypeString = stringifyTypeTree({
      kind: 'object',
      typeName: typeTree.typeName,
      properties: objectTypesProperties,
      excessProperties: objectTypeExcessProperties
    })

    return [...nonObjectTypeStrings, mergedObjectTypeString].join(' & ').replace(/} & {/, ' ')
  }

  if (typeTree.kind === 'object') {
    let propertiesString = typeTree.properties.map(p => `${p.readonly ? 'readonly ' : ''}${p.name}: ${stringifyTypeTree(p.type)};`).join(' ')

    if (typeTree.excessProperties > 0) {
      propertiesString += `... ${typeTree.excessProperties} more;`
    }

    return `{ ${propertiesString} }`
  }

  if (typeTree.kind === 'array') {
    return `${typeTree.readonly ? 'readonly ' : ''}${stringifyTypeTree(typeTree.elementType)}[]`
  }

  if (typeTree.kind === 'function') {
    return `(${typeTree.parameters.map(p => `${p.name}: ${stringifyTypeTree(p.type)}`).join(', ')}) => ${stringifyTypeTree(typeTree.returnType)}`
  }

  if (typeTree.kind === 'enum') {
    return typeTree.member
  }

  if (typeTree.kind === 'promise') {
    return `Promise<${stringifyTypeTree(typeTree.type)}>`
  }

  return typeTree.typeName
}

/**
 * Builds a declaration string based on the syntax kind
 */
export function getSyntaxKindDeclaration (syntaxKind: SyntaxKind, typeName: string): string {
  switch (syntaxKind) {
    case SyntaxKind.ClassDeclaration:
    case SyntaxKind.NewExpression:
      return `class ${typeName}`

    case SyntaxKind.ExpressionWithTypeArguments:
    case SyntaxKind.InterfaceDeclaration:
    case SyntaxKind.QualifiedName:
      return `interface ${typeName}`

    case SyntaxKind.ArrayType:
    case SyntaxKind.ConstructorType:
    case SyntaxKind.ConstructSignature:
    case SyntaxKind.EnumDeclaration:
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
      return `type ${typeName} =`

    case SyntaxKind.FunctionDeclaration:
    case SyntaxKind.FunctionKeyword:
    case SyntaxKind.MethodDeclaration:
    case SyntaxKind.MethodSignature:
    case SyntaxKind.GetAccessor:
    case SyntaxKind.SetAccessor:
      return `function ${typeName}`

    default:
      return `const ${typeName}:`
  }
}

export function prettyPrintTypeString (typeString: string, indentation = 2): string {
  if (indentation < 1) return typeString

  // Add newline after braces and semicolons
  const splitTypeString = typeString
    .replace(/{/g, '{\n')
    .replace(/}/g, '\n}')
    .replace(/(\S); /g, '$1;\n ')

  let depth = 0
  let result = ''

  const lines = splitTypeString.split('\n')

  for (let line of lines) {
    line = line.trim()

    // Replace : with ?: if line contains undefined union
    if (line.includes(':') && (line.includes(' | undefined') || line.includes('undefined | '))) {
      line = line.replace(':', '?:').replace(' | undefined', '').replace('undefined | ', '')
    }

    // Replace true/false with boolean
    line = line.replace('false | true', 'boolean').replace('false & true', 'boolean')

    // Remove semi-colons from excess properties
    line = line.replace('more;', 'more')

    const hasOpenBrace = line.includes('{')
    const hasCloseBrace = line.includes('}')

    if (hasCloseBrace) {
      depth--
    }

    result += ' '.repeat(indentation).repeat(depth) + line + '\n'

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
  // Remove the leading word, ex: type, const, interface
  str = str.replace(/^[a-z]+\s/, '')

  // Remove all whitespace, newlines, and semicolons
  return str.replace(/\s/g, '').replace(/\n/g, '').replace(/;/g, '')
}
