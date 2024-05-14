import type * as ts from 'typescript'

import type { TypeInfo, TypeTree } from './types'
import { getDescendantAtRange } from './get-ast-node'

const maxProps = 100
const maxDepth = 5

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

    const typeTree = getTypeTree(type)

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
function getTypeTree (type: ts.Type, depth = 0): TypeTree {
  const typeName = checker.typeToString(type)

  if (depth >= maxDepth || isPrimitiveType(type)) return { kind: 'basic', typeName }

  // TODO: type.types separates boolean into true and false
  if (type.isUnion()) return {
    kind: 'union',
    typeName,
    types: type.types.map(t => getTypeTree(t, depth))
  }

  if (type.isIntersection()) return {
    kind: 'intersection',
    typeName,
    types: type.types.map(t => getTypeTree(t, depth))
  }

  if (typeName.startsWith('Promise<')) {
    const typeArgument = checker.getTypeArguments(type as ts.TypeReference)[0]
    return {
      kind: 'promise',
      typeName,
      type: typeArgument ? getTypeTree(typeArgument, depth) : { kind: 'basic', typeName: 'void' }
    }
  }

  const signature = type.getCallSignatures()[0]
  if (signature) return {
    kind: 'function',
    typeName,
    returnType: getTypeTree(checker.getReturnTypeOfSignature(signature), depth),
    parameters: signature.parameters.map(symbol => {
      return { name: symbol.getName(), type: getTypeTree(checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!), depth + 1) }
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
      elementType: getTypeTree(arrayType, depth + 1)
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
          type: getTypeTree(symbolType, depth + 1) // Add depth to prevent infinite recursion
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
