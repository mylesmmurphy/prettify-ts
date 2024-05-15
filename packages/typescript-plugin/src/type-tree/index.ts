import type * as ts from 'typescript'

import type { TypeInfo, TypeTree } from './types'
import { getDescendantAtRange } from './get-ast-node'

const maxProps = 25
const maxDepth = 3

let typescript: typeof ts
let checker: ts.TypeChecker

/**
 * Get type information at a position in a source file
 */
export function getTypeTreeAtPosition (
  typescriptContext: typeof ts,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  position: number
): TypeInfo | undefined {
  try {
    typescript = typescriptContext
    checker = typeChecker

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
  const typeName = checker.typeToString(type)

  if (depth >= maxDepth || isPrimitiveType(type)) return {
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

  const symbolWithParent = type.symbol as ts.Symbol & { parent?: ts.Symbol }
  if (type?.symbol?.flags & typescript.SymbolFlags.EnumMember && symbolWithParent.parent) {
    return {
      kind: 'enum',
      typeName,
      member: `${symbolWithParent.parent.name}.${symbolWithParent.name}`
    }
  }

  if (type.isIntersection()) return {
    kind: 'intersection',
    typeName,
    types: type.types.map(t => getTypeTree(t, depth, new Set(visited)))
  }

  if (typeName.startsWith('Promise<')) {
    const typeArgument = checker.getTypeArguments(type as ts.TypeReference)[0]
    return {
      kind: 'promise',
      typeName,
      type: typeArgument ? getTypeTree(typeArgument, depth, new Set(visited)) : { kind: 'basic', typeName: 'void' }
    }
  }

  const signature = type.getCallSignatures()[0]
  if (signature) return {
    kind: 'function',
    typeName,
    returnType: getTypeTree(checker.getReturnTypeOfSignature(signature), depth, new Set(visited)),
    parameters: signature.parameters.map(symbol => {
      const symbolType = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
      return { name: symbol.getName(), type: getTypeTree(symbolType, depth, new Set(visited)) }
    })
  }

  if (checker.isArrayType(type)) {
    const arrayType = checker.getTypeArguments(type as ts.TypeReference)[0]
    if (!arrayType) return {
      kind: 'array',
      typeName,
      elementType: { kind: 'basic', typeName: 'any' }
    }

    return {
      kind: 'array',
      typeName,
      elementType: getTypeTree(arrayType, depth, new Set(visited))
    }
  }

  if (type.isClassOrInterface() || (type.flags & typescript.TypeFlags.Object)) {
    const publicProperties = type
      .getApparentProperties()
      .filter((symbol) => isPublicProperty(symbol))
      .slice(0, maxProps)

    return {
      kind: 'object',
      typeName,
      properties: publicProperties.map(symbol => {
        const symbolType = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
        return {
          name: symbol.getName(),
          type: getTypeTree(symbolType, depth + 1, new Set(visited)) // Add depth to prevent infinite recursion
        }
      })
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
    typeFlags & typescript.TypeFlags.Number ||
    typeFlags & typescript.TypeFlags.Boolean ||
    typeFlags & typescript.TypeFlags.Undefined ||
    typeFlags & typescript.TypeFlags.Null ||
    typeFlags & typescript.TypeFlags.Void ||
    typeFlags & typescript.TypeFlags.Enum ||
    typeFlags & typescript.TypeFlags.BigInt
  )
}

/**
 * Check if a symbol is public
 */
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
