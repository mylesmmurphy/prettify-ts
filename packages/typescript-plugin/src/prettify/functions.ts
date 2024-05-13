import * as ts from 'typescript/lib/tsserverlibrary'

import type { PrettifyRequest, TypeInfo } from './types'
import { getDescendantAtRange } from './node'

export function isPrettifyRequest (request: unknown): request is PrettifyRequest {
  return !!request && typeof request === 'object' && 'meta' in request && request['meta'] === 'prettify-request'
}

function getTypeInfo (type: ts.Type, checker: ts.TypeChecker): TypeInfo {
  if (type.isUnion()) return {
    kind: 'union',
    types: type.types.map(t => getTypeInfo(t, checker))
  }

  if (type.isIntersection()) return {
    kind: 'intersection',
    types: type.types.map(t => getTypeInfo(t, checker))
  }

  // if (checker.typeToString(type).includes('Promise')) {
  //   const promiseType = checker.getTypeArguments(type as ts.TypeReference)[0]
  //   if (!promiseType) return { kind: 'promise', type: { kind: 'any' } }

  //   return { kind: 'promise', type: getTypeInfo(promiseType, checker) }
  // }

  // const signature = type.getCallSignatures()[0]
  // if (signature) return {
  //   kind: 'function',
  //   returnType: getTypeInfo(checker.getReturnTypeOfSignature(signature), checker),
  //   parameters: signature.parameters.map(symbol => {
  //     return { name: symbol.getName(), type: getTypeInfo(checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!), checker) }
  //   })
  // }

  // if (checker.isArrayType(type)) {
  //   const arrayType = checker.getTypeArguments(type as ts.TypeReference)[0]
  //   if (!arrayType) return { kind: 'array', elementType: { kind: 'any' } }

  //   return {
  //     kind: 'array',
  //     elementType: getTypeInfo(arrayType, checker)
  //   }
  // }

  if (type.isClassOrInterface() || (type.flags & ts.TypeFlags.Object)) return {
    kind: 'object',
    properties: checker.getPropertiesOfType(type).map(symbol => {
      return {
        name: symbol.getName(),
        type: getTypeInfo(checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!), checker)
      }
    })
  }

  return {
    kind: 'primitive',
    type: checker.typeToString(type)
  }
}

export function getCompleteTypeInfoAtPosition (
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  position: number
): TypeInfo | undefined {
  try {
    const node = getDescendantAtRange(sourceFile, [position, position])

    if (!node || node === sourceFile) return undefined

    const type = typeChecker.getTypeAtLocation(node)

    if (!node.parent) {
      return undefined
    }

    const result = getTypeInfo(type, typeChecker)

    return result
  } catch (e) {
    return undefined
  }
}
