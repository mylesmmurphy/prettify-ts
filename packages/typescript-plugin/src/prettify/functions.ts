import * as ts from 'typescript/lib/tsserverlibrary'

import type { PrettifyRequest, PrettifyResponse, TypeInfo } from './types'
import { getDescendantAtRange } from './node'

export function isPrettifyRequest (request: unknown): request is PrettifyRequest {
  return !!request && typeof request === 'object' && 'meta' in request && request['meta'] === 'prettify-request'
}

/**
 * Recursively get type information by building a TypeInfo object
 */
function getTypeInfo (type: ts.Type, checker: ts.TypeChecker, depth = 0, maxProps = 10): TypeInfo {
  const typeName = checker.typeToString(type)

  if (depth >= 2) return { kind: 'basic', typeName, type: typeName }

  if (type.isUnion()) return {
    kind: 'union',
    typeName,
    types: type.types.map(t => getTypeInfo(t, checker))
  }

  if (type.isIntersection()) return {
    kind: 'intersection',
    typeName,
    types: type.types.map(t => getTypeInfo(t, checker))
  }

  if (typeName.startsWith('Promise<')) {
    const typeArgument = checker.getTypeArguments(type as ts.TypeReference)[0]
    return {
      kind: 'promise',
      typeName,
      type: typeArgument ? getTypeInfo(typeArgument, checker) : { kind: 'basic', typeName, type: 'void' }
    }
  }

  const signature = type.getCallSignatures()[0]
  if (signature) return {
    kind: 'function',
    typeName,
    returnType: getTypeInfo(checker.getReturnTypeOfSignature(signature), checker),
    parameters: signature.parameters.map(symbol => {
      return { name: symbol.getName(), type: getTypeInfo(checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!), checker) }
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
      elementType: getTypeInfo(arrayType, checker)
    }
  }

  if (type.isClassOrInterface() || (type.flags & ts.TypeFlags.Object)) return {
    kind: 'object',
    typeName,
    properties: type.getApparentProperties().slice(0, maxProps).map(symbol => {
      const symbolType = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
      return {
        name: symbol.getName(),
        type: getTypeInfo(symbolType, checker, depth + 1) // Add depth to prevent infinite recursion
      }
    })
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
