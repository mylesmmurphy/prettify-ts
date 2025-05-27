import { SyntaxKind } from 'typescript'
import type { TypeTree } from '@prettify-ts/typescript-plugin/src/type-tree/types'

/**
 * Regular expression to validate an object key that does not require quotes.
 * Includes dynamic keys wrapped in square brackets (e.g., [dynamicKey]).
 */
const unquotedObjectKeyRegex = /^(?:\d+|[a-zA-Z_$][\w$]*|\[.*\])$/

/**
 * List of reserved keywords in TypeScript that should not be used as object keys.
 * This is used to determine if an object key needs to be wrapped in quotes.
 */
const reservedKeywords = ['class', 'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'default', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'delete', 'typeof', 'instanceof', 'void', 'this', 'super', 'import', 'export', 'extends', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'static', 'yield', 'let', 'const', 'var', 'do', 'with', 'debugger', 'enum', 'await', 'async']

/**
 * Uses type info to return a string representation of the type
 *
 * Example:
 * { kind: 'union', types: [{ kind: 'primitive', type: 'string' }, { kind: 'primitive', type: 'number' }] }
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

  if (typeTree.kind === 'object') {
    let propertiesString = typeTree.properties.map(p => {
      const readonly = (p.readonly) ? 'readonly ' : ''

      let optional = ''
      if (p.optional && p.type.kind === 'union') {
        optional = '?'
        // Remove undefined from union if optional
        p.type.types = p.type.types.filter(t => t.typeName !== 'undefined')
      }

      // If the name has invalid characters, wrap it in quotes
      let name = p.name
      if (!unquotedObjectKeyRegex.test(p.name) || reservedKeywords.includes(p.name)) {
        name = `"${p.name}"`
      }

      return `${readonly}${name}${optional}: ${stringifyTypeTree(p.type)};`
    }).join(' ')

    if (typeTree.excessProperties > 0) {
      propertiesString += ` ... ${typeTree.excessProperties} more;`
    }

    return `{ ${propertiesString} }`
  }

  if (typeTree.kind === 'tuple') {
    const elementTypesString = typeTree.elementTypes.map(t => stringifyTypeTree(t)).join(', ')

    return `${typeTree.readonly ? 'readonly ' : ''}[${elementTypesString}]`
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
        const rest = p.isRestParameter ? '...' : ''

        let optional = ''
        if (p.optional && p.type.kind === 'union') {
          optional = '?'
          // Remove undefined from union if optional
          p.type.types = p.type.types.filter(t => t.typeName !== 'undefined')
        }

        return `${rest}${p.name}${optional}: ${stringifyTypeTree(p.type)}`
      }).join(', ')

      return `(${parametersString})${returnTypeChar} ${stringifyTypeTree(returnType)}`
    })

    // If there are multiple signatures, wrap them in braces with semi-colons at the end of each line
    if (signatures.length > 1) {
      let signaturesString = `{${signatures.join('; ')};`
      if (typeTree.excessSignatures > 0) {
        signaturesString += ` ... ${typeTree.excessSignatures} more;`
      }
      signaturesString += '}'

      return signaturesString
    }

    return signatures[0]
  }

  if (typeTree.kind === 'enum') {
    return typeTree.member
  }

  if (typeTree.kind === 'generic') {
    const argumentsString = typeTree.arguments.map(arg => stringifyTypeTree(arg)).join(', ')
    return `${typeTree.typeName}<${argumentsString}>`
  }

  // Primitive or reference type
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
    case SyntaxKind.Constructor:
      return `function ${typeName}`

    case SyntaxKind.LetKeyword:
      return `let ${typeName}: `

    case SyntaxKind.VarKeyword:
      return `var ${typeName}: `

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

    // Replace true/false with boolean
    line = line.replace('false | true', 'boolean')

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
    .replace(/{\s*\.\.\.\s*([0-9]+)\s*more;\s*}/g, '{ ... $1 more }') // Replace only excess properties into one line

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
    .replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\./g, '') // Remove namespaces (e.g., z.)
}
