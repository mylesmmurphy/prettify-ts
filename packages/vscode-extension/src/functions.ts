import { type TypeInfo } from './types'

/**
 * Uses type info to return a string representation of the type for Markdown rendering
 */
export function getTypeString (typeInfo: TypeInfo): string {
  if (typeInfo.kind === 'union') {
    return typeInfo.types.map(getTypeString).join(' | ')
  }

  if (typeInfo.kind === 'intersection') {
    const properties = typeInfo.types.flatMap(t => t.kind === 'object' ? t.properties : [])
    return `{ ${properties.map(p => `${p.name}: ${getTypeString(p.type)}`).join(' ')} }`
  }

  if (typeInfo.kind === 'object') {
    return `{ ${typeInfo.properties.map(p => `${p.name}: ${getTypeString(p.type)}`).join(' ')} }`
  }

  if (typeInfo.kind === 'array') {
    return `${getTypeString(typeInfo.elementType)}[]`
  }

  if (typeInfo.kind === 'function') {
    return `(${typeInfo.parameters.map(p => `${p.name}: ${getTypeString(p.type)}`).join(', ')}) => ${getTypeString(typeInfo.returnType)}`
  }

  if (typeInfo.kind === 'promise') {
    return `Promise<${getTypeString(typeInfo.type)}>`
  }

  return `${typeInfo.type};`
}

export function formatTypeString (typeString: string, indentation = 2): string {
  if (indentation < 1) return typeString

  // Add newline after { and ;
  const splitDeclarationString = typeString
    .replace(/{/g, '{\n')
    .replace(/}/g, '\n}')
    .replace(/;/g, ';\n')

  let depth = 0
  let result = ''
  const lines = splitDeclarationString.split('\n')

  for (const line of lines) {
    let trimmedLine = line.trim()

    // Remove redudant undefined union
    if (trimmedLine.includes('?:') && trimmedLine.includes(' | undefined')) {
      trimmedLine = trimmedLine.replace(' | undefined', '')
    }

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
