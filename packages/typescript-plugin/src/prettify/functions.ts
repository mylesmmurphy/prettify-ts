import * as ts from 'typescript/lib/tsserverlibrary'

import type { PrettifyRequest, PrettifyResponse, TypeInfo } from './types'
import { getDescendantAtRange } from './node'

export function isPrettifyRequest (request: unknown): request is PrettifyRequest {
  return !!request && typeof request === 'object' && 'meta' in request && request['meta'] === 'prettify-request'
}

function isPublicProperty (symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations()
  if (!declarations) return true

  const name = symbol.getName()
  if (name.startsWith('_')) return false

  return declarations.every(declaration => {
    if (!(
      ts.isMethodDeclaration(declaration) ||
      ts.isMethodSignature(declaration) ||
      ts.isPropertyDeclaration(declaration) ||
      ts.isPropertySignature(declaration)
    )) return true

    const hasPrivateOrProtectedModifier = (declaration.modifiers ?? []).some(modifier => {
      return modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword
    })

    return !hasPrivateOrProtectedModifier
  })
}

/**
 * Recursively get type information by building a TypeInfo object
 */
function getTypeInfo (type: ts.Type, checker: ts.TypeChecker, depth = 0, maxProps = 100): TypeInfo {
  const typeName = checker.typeToString(type)

  if (depth >= 5) return { kind: 'basic', typeName, type: typeName }

  if (type.isUnion()) return {
    kind: 'union',
    typeName,
    types: type.types.map(t => getTypeInfo(t, checker, depth))
  }

  if (type.isIntersection()) return {
    kind: 'intersection',
    typeName,
    types: type.types.map(t => getTypeInfo(t, checker, depth))
  }

  if (typeName.startsWith('Promise<')) {
    const typeArgument = checker.getTypeArguments(type as ts.TypeReference)[0]
    return {
      kind: 'promise',
      typeName,
      type: typeArgument ? getTypeInfo(typeArgument, checker, depth) : { kind: 'basic', typeName, type: 'void' }
    }
  }

  const signature = type.getCallSignatures()[0]
  if (signature) return {
    kind: 'function',
    typeName,
    returnType: getTypeInfo(checker.getReturnTypeOfSignature(signature), checker, depth),
    parameters: signature.parameters.map(symbol => {
      return { name: symbol.getName(), type: getTypeInfo(checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!), checker, depth + 1) }
    })
  }

  if (checker.isArrayType(type)) {
    const arrayType = checker.getTypeArguments(type as ts.TypeReference)[0]
    if (!arrayType) return {
      kind: 'array',
      typeName,
      elementType: { kind: 'basic', typeName, type: 'any' }
    }

    return {
      kind: 'array',
      typeName,
      elementType: getTypeInfo(arrayType, checker, depth + 1)
    }
  }

  if (type.isClassOrInterface() || (type.flags & ts.TypeFlags.Object)) {
    const publicProperties = type
      .getApparentProperties()
      .filter(isPublicProperty)
      .slice(0, maxProps)

    return {
      kind: 'object',
      typeName,
      properties: publicProperties.map(symbol => {
        const symbolType = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
        return {
          name: symbol.getName(),
          type: getTypeInfo(symbolType, checker, depth + 1) // Add depth to prevent infinite recursion
        }
      })
    }
  }

  return {
    kind: 'basic',
    typeName,
    type: checker.typeToString(type)
  }
}

export function getCompleteTypeInfoAtPosition (
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  position: number
): PrettifyResponse | undefined {
  try {
    const node = getDescendantAtRange(sourceFile, [position, position])

    if (!node || node === sourceFile || !node.parent) return undefined

    const symbol = typeChecker.getSymbolAtLocation(node)
    if (!symbol) return undefined

    let type = typeChecker.getTypeOfSymbolAtLocation(symbol, node)

    // If the symbol has a declared type, use that when available
    const declaredType = typeChecker.getDeclaredTypeOfSymbol(symbol)
    if (declaredType.flags !== ts.TypeFlags.Any) {
      type = declaredType
    }

    const declaration = symbol?.declarations?.[0]
    const syntaxKind = declaration?.kind ?? ts.SyntaxKind.ConstKeyword
    const name = symbol?.getName() ?? typeChecker.typeToString(type)

    const typeInfo = getTypeInfo(type, typeChecker)

    return {
      typeInfo,
      syntaxKind,
      name
    }
  } catch (e) {
    return undefined
  }
}
