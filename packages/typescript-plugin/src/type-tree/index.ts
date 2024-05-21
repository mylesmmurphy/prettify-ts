import type * as ts from 'typescript'

import type { TypeInfo, TypeProperty, TypeTree } from './types'
import { getDescendantAtRange } from './get-ast-node'
import type { PrettifyOptions } from '../request'

let typescript: typeof ts
let checker: ts.TypeChecker

let options: PrettifyOptions = {
  maxDepth: 2,
  maxProperties: 100,
  maxSubProperties: 5,
  unwrapFunctions: true,
  unwrapArrays: true,
  unwrapPromises: true,
  skippedTypeNames: []
}

// Tracks the properties processed so far
// let propsCount = 0

/**
 * Get TypeInfo at a position in a source file
 */
export function getTypeInfoAtPosition (
  typescriptContext: typeof ts,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  position: number,
  prettifyOptions: PrettifyOptions
): TypeInfo | undefined {
  try {
    typescript = typescriptContext
    checker = typeChecker
    options = prettifyOptions
    propsCount = 0

    const node = getDescendantAtRange(typescript, sourceFile, [position, position])
    if (!node || node === sourceFile || !node.parent) return undefined

    const symbol = typeChecker.getSymbolAtLocation(node)
    if (!symbol) return undefined

    let type = typeChecker.getTypeOfSymbolAtLocation(symbol, node)

    // If the symbol has a declared type, use that when available
    const declaredType = typeChecker.getDeclaredTypeOfSymbol(symbol)
    if (declaredType.flags !== typescript.TypeFlags.Any) {
      type = declaredType
    }

    const syntaxKind = symbol?.declarations?.[0]?.kind ?? typescript.SyntaxKind.ConstKeyword
    const name = symbol?.getName() ?? typeChecker.typeToString(type)

    const typeTree = getTypeTree(type, 0, new Set())

    return {
      typeTree,
      syntaxKind,
      name
    }
  } catch (e) {
    return undefined
  }
}

/**
 * Recursively get type information by building a TypeInfo object
 */
function getTypeTree (type: ts.Type, depth: number, visited: Set<ts.Type>): TypeTree {
  const typeName = checker.typeToString(type, undefined, typescript.TypeFormatFlags.NoTruncation)
  const apparentType = checker.getApparentType(type)

  if (depth > options.maxDepth || isPrimitiveType(type) || options.skippedTypeNames.includes(typeName)) return {
    kind: 'basic',
    typeName
  }

  if (visited.has(type)) return {
    kind: 'basic',
    typeName
  }

  visited.add(type)

  if (type.isUnion()) return {
    kind: 'union',
    typeName,
    types: type.types.map(t => getTypeTree(t, depth, new Set(visited)))
  }

  if (type?.symbol?.flags & typescript.SymbolFlags.EnumMember && type.symbol.parent) {
    return {
      kind: 'enum',
      typeName,
      member: `${type.symbol.parent.name}.${type.symbol.name}`
    }
  }

  if (type.isIntersection()) return {
    kind: 'intersection',
    typeName,
    types: type.types.map(t => getTypeTree(t, depth, new Set(visited)))
  }

  if (typeName.startsWith('Promise<')) {
    if (!options.unwrapPromises) return { kind: 'basic', typeName }

    const typeArgument = checker.getTypeArguments(apparentType as ts.TypeReference)[0]
    return {
      kind: 'promise',
      typeName,
      type: typeArgument ? getTypeTree(typeArgument, depth, new Set(visited)) : { kind: 'basic', typeName: 'void' }
    }
  }

  const signature = apparentType.getCallSignatures()[0]
  if (signature) {
    if (!options.unwrapFunctions) return { kind: 'basic', typeName }

    const returnType = getTypeTree(checker.getReturnTypeOfSignature(signature), depth + 1, new Set(visited))
    const parameters = signature.parameters.map(symbol => ({
      name: symbol.getName(),
      readonly: isReadOnly(symbol),
      type: getTypeTree(checker.getTypeOfSymbol(symbol), depth + 1, new Set(visited))
    }))

    return {
      kind: 'function',
      typeName,
      returnType,
      parameters
    }
  }

  if (checker.isArrayType(type)) {
    if (!options.unwrapArrays) return { kind: 'basic', typeName }

    const arrayType = checker.getTypeArguments(type as ts.TypeReference)[0]
    const elementType: TypeTree = arrayType
      ? getTypeTree(arrayType, depth, new Set(visited))
      : { kind: 'basic', typeName: 'any' }

    return {
      kind: 'array',
      typeName,
      readonly: type.getSymbol()?.getName() === 'ReadonlyArray',
      elementType
    }
  }

  if (apparentType.isClassOrInterface() || (apparentType.flags & typescript.TypeFlags.Object)) {
    const publicProperties = apparentType
      .getApparentProperties()
      .filter((symbol) => isPublicProperty(symbol))
      .slice(0, options.maxProperties)

    const properties: TypeProperty[] = publicProperties.map(symbol => {
      const symbolType = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
      return {
        name: symbol.getName(),
        readonly: isReadOnly(symbol),
        type: getTypeTree(symbolType, depth + 1, new Set(visited)) // Add depth to prevent infinite recursion
      }
    })

    const stringIndexType = type.getStringIndexType()
    if (stringIndexType) {
      properties.push({
        name: '[key: string]',
        readonly: isReadOnly(stringIndexType.symbol),
        type: getTypeTree(stringIndexType, depth + 1, new Set(visited))
      })
    }

    const numberIndexType = type.getNumberIndexType()
    if (numberIndexType) {
      properties.push({
        name: '[key: number]',
        readonly: isReadOnly(numberIndexType.symbol),
        type: getTypeTree(numberIndexType, depth + 1, new Set(visited))
      })
    }

    return {
      kind: 'object',
      typeName,
      properties
    }
  }

  return {
    kind: 'basic',
    typeName
  }
}

function isPrimitiveType (type: ts.Type): boolean {
  const typeFlags = type.flags

  return Boolean(
    typeFlags & typescript.TypeFlags.String ||
    typeFlags & typescript.TypeFlags.StringLiteral ||
    typeFlags & typescript.TypeFlags.Number ||
    typeFlags & typescript.TypeFlags.NumberLiteral ||
    typeFlags & typescript.TypeFlags.Boolean ||
    typeFlags & typescript.TypeFlags.BooleanLike ||
    typeFlags & typescript.TypeFlags.BooleanLiteral ||
    typeFlags & typescript.TypeFlags.Undefined ||
    typeFlags & typescript.TypeFlags.Null ||
    typeFlags & typescript.TypeFlags.Void ||
    typeFlags & typescript.TypeFlags.Enum ||
    typeFlags & typescript.TypeFlags.EnumLiteral ||
    typeFlags & typescript.TypeFlags.BigInt ||
    typeFlags & typescript.TypeFlags.BigIntLiteral ||
    typeFlags & typescript.TypeFlags.ESSymbol ||
    typeFlags & typescript.TypeFlags.UniqueESSymbol ||
    typeFlags & typescript.TypeFlags.Never ||
    typeFlags & typescript.TypeFlags.Unknown ||
    typeFlags & typescript.TypeFlags.Any
  )
}

function isPublicProperty (symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations()
  if (!declarations) return true

  const name = symbol.getName()
  if (name.startsWith('_')) return false

  return declarations.every(declaration => {
    if (!(
      typescript.isMethodDeclaration(declaration) ||
      typescript.isMethodSignature(declaration) ||
      typescript.isPropertyDeclaration(declaration) ||
      typescript.isPropertySignature(declaration)
    )) return true

    const modifiers = declaration.modifiers ?? []
    const hasPrivateOrProtectedModifier = modifiers.some(modifier => {
      return modifier.kind === typescript.SyntaxKind.PrivateKeyword || modifier.kind === typescript.SyntaxKind.ProtectedKeyword
    })

    return !hasPrivateOrProtectedModifier
  })
}

function isReadOnly (symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations()
  if (!declarations) return false

  return declarations.some(declaration => (
    (
      typescript.isPropertyDeclaration(declaration) ||
      typescript.isMethodDeclaration(declaration)
    ) &&
    declaration.modifiers?.some(modifier => modifier.kind === typescript.SyntaxKind.ReadonlyKeyword)))
}
