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
export function stringifyTypeTree (typeTree: TypeTree, anonymousFunction = true): string {
  if (typeTree.kind === 'union') {
    const unionString = typeTree.types.map(t => stringifyTypeTree(t)).join(' | ')
    if (typeTree.excessMembers > 0) {
      return `${unionString} | ... ${typeTree.excessMembers} more`
    }

    return unionString
  }

  if (typeTree.kind === 'intersection') {
    const nonObjectTypeStrings = typeTree.types.filter(t => t.kind !== 'object').map(t => stringifyTypeTree(t))
    const objectTypes = typeTree.types.filter((t): t is Extract<TypeTree, { kind: 'object' }> => t.kind === 'object')

    if (objectTypes.length === 0) {
      return nonObjectTypeStrings.join(' & ')
    }

    const objectTypesProperties = objectTypes.flatMap(t => t.properties)
    const objectTypeExcessProperties = objectTypes.reduce((acc, t) => acc + t.excessProperties, 0)
    const mergedObjectTypeString = stringifyTypeTree({
      kind: 'object',
      typeName: typeTree.typeName,
      properties: objectTypesProperties,
      excessProperties: objectTypeExcessProperties
    })

    return [...nonObjectTypeStrings, mergedObjectTypeString].join(' & ')
  }

  if (typeTree.kind === 'object') {
    let propertiesString = typeTree.properties.map(p => {
      const readonly = (p.readonly) ? 'readonly ' : ''

      let optional = ''
      if (p.type.kind === 'union') {
        const hasUndefined = p.type.types.some(t => t.kind === 'basic' && t.typeName === 'undefined')
        if (hasUndefined) {
          optional = '?'
        }
        // Remove undefined from union
        p.type.types = p.type.types.filter(t => t.kind !== 'basic' || t.typeName !== 'undefined')
      }

      return `${readonly}${p.name}${optional}: ${stringifyTypeTree(p.type)};`
    }).join(' ')

    if (typeTree.excessProperties > 0) {
      propertiesString += ` ... ${typeTree.excessProperties} more;`
    }

    return `{ ${propertiesString} }`
  }

  if (typeTree.kind === 'array') {
    let elementTypeString = stringifyTypeTree(typeTree.elementType)
    if (elementTypeString.includes('|') || elementTypeString.includes('&')) {
      elementTypeString = `(${elementTypeString})`
    }

    return `${typeTree.readonly ? 'readonly ' : ''}${elementTypeString}[]`
  }

  if (typeTree.kind === 'function') {
    const returnTypeChar = anonymousFunction ? ' =>' : ':'

    const signatures = typeTree.signatures.map(s => {
      const { parameters, returnType } = s
      const parametersString = parameters.map(p => {
        let optional = ''
        if (p.type.kind === 'union') {
          const hasUndefined = p.type.types.some(t => t.kind === 'basic' && t.typeName === 'undefined')
          if (hasUndefined) {
            optional = '?'
          }
          // Remove undefined from union
          p.type.types = p.type.types.filter(t => t.kind !== 'basic' || t.typeName !== 'undefined')
        }

        return `${p.isRestParameter ? '...' : ''}${p.name}${optional}: ${stringifyTypeTree(p.type)}`
      }).join(', ')

      return `(${parametersString})${returnTypeChar} ${stringifyTypeTree(returnType)}`
    })

    // If there are multiple signatures, wrap them in braces with semi-colons at the end of each line
    if (signatures.length > 1) {
      return `{${signatures.join('; ')};}`
    }

    return signatures[0]
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
      return `class ${typeName} `

    case SyntaxKind.ExpressionWithTypeArguments:
    case SyntaxKind.InterfaceDeclaration:
    case SyntaxKind.QualifiedName:
      return `interface ${typeName} `

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
      return `type ${typeName} = `

    case SyntaxKind.FunctionDeclaration:
    case SyntaxKind.FunctionKeyword:
    case SyntaxKind.MethodDeclaration:
    case SyntaxKind.MethodSignature:
    case SyntaxKind.GetAccessor:
    case SyntaxKind.SetAccessor:
      return `function ${typeName}`

    default:
      return `const ${typeName}: `
  }
}

export function prettyPrintTypeString (typeStringInput: string, indentation = 2): string {
  // Replace typeof import("...node_modules/MODULE_NAME") with: typeof import("MODULE_NAME")
  const typeString = typeStringInput
    .replace(/typeof import\(".*?node_modules\/(.*?)"\)/g, 'typeof import("$1")')
    .replace(/ } & { /g, ' ')

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
    // if (line.includes(':') && (line.includes(' | undefined') || line.includes('undefined | '))) {
    //   line = line.replace(':', '?:').replace(' | undefined', '').replace('undefined | ', '').replace('??', '?')
    // }

    // Replace true/false with boolean
    line = line.replace('false | true', 'boolean')

    // Remove semi-colons from excess properties
    if (line.includes('...')) {
      line = line.replace('more;', 'more')
    }

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

  result = result
    .replace(/{\s*\n*\s*}/g, '{}') // Remove empty braces newlines
    .replace(/^\s*[\r\n]/gm, '') // Remove empty newlines
    .replace(/{\s*\.\.\.\s*([0-9]+)\s*more\s*}/g, '{ ... $1 more }') // Replace only excess properties into one line

  return result
}

/**
 * Sanitizes a string by removing leading words, whitespace, newlines, and semicolons
 */
export function sanitizeString (str: string): string {
  return str
    .replace(/^[a-z]+\s/, '') // Remove the leading word, ex: type, const, interface
    .replace(/\s/g, '') // Remove all whitespace
    .replace(/\n/g, '') // Remove all newlines
    .replace(/;/g, '') // Remove all semicolons
}
