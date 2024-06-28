import type * as ts from 'typescript'

import type { TypeFunctionSignature, TypeInfo, TypeProperty, TypeTree } from './types'
import { getDescendantAtRange } from './get-ast-node'
import type { PrettifyOptions } from '../request'

let typescript: typeof ts
let checker: ts.TypeChecker

let options: PrettifyOptions = {
  hidePrivateProperties: true,
  maxDepth: 2,
  maxProperties: 100,
  maxSubProperties: 5,
  maxUnionMembers: 15,
  skippedTypeNames: [],
  unwrapArrays: true,
  unwrapFunctions: true,
  unwrapPromises: true
}

// Tracks the properties processed so far
let propertiesCount = 0

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
    propertiesCount = 0

    const node = getDescendantAtRange(typescript, sourceFile, [position, position])
    if (!node || node === sourceFile || !node.parent) return undefined

    const symbol = typeChecker.getSymbolAtLocation(node)
    if (!symbol) return undefined

    let type = typeChecker.getTypeOfSymbolAtLocation(symbol, node)

    // If the symbol has a declared type, use that when available
    // Don't use declared type for variable declarations
    const shouldUseDeclaredType = symbol.declarations?.every(d => d.kind !== typescript.SyntaxKind.VariableDeclaration)
    const declaredType = typeChecker.getDeclaredTypeOfSymbol(symbol)
    if (declaredType.flags !== typescript.TypeFlags.Any && shouldUseDeclaredType) {
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
 * Recursively get type information by building a TypeTree object from the given type
 */
function getTypeTree (type: ts.Type, depth: number, visited: Set<ts.Type>): TypeTree {
  const typeName = checker.typeToString(type, undefined, typescript.TypeFormatFlags.NoTruncation)
  const apparentType = checker.getApparentType(type)

  if (depth >= options.maxDepth || isPrimitiveType(type) || options.skippedTypeNames.includes(typeName)) return {
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
    excessMembers: Math.max(0, type.types.length - options.maxUnionMembers),
    types: type.types.slice(0, options.maxUnionMembers).sort(sortUnionTypes).map(t => getTypeTree(t, depth, new Set(visited)))
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

  const callSignatures = apparentType.getCallSignatures()
  if (callSignatures.length > 0) {
    if (!options.unwrapFunctions) {
      depth = options.maxDepth
    }

    const signatures: TypeFunctionSignature[] = callSignatures.map(signature => {
      const returnType = getTypeTree(checker.getReturnTypeOfSignature(signature), depth, new Set(visited))
      const parameters = signature.parameters.map(symbol => {
        const declaration = symbol.declarations?.[0]
        const isRestParameter = Boolean(declaration && typescript.isParameter(declaration) && !!declaration.dotDotDotToken)

        return {
          name: symbol.getName(),
          isRestParameter,
          type: getTypeTree(checker.getTypeOfSymbol(symbol), depth, new Set(visited))
        }
      })

      return { returnType, parameters }
    })

    return {
      kind: 'function',
      typeName,
      signatures
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
    if (propertiesCount >= options.maxProperties) return { kind: 'basic', typeName }

    // Resolve how many properties to show based on the maxProperties option
    const remainingProperties = options.maxProperties - propertiesCount
    const depthMaxProps = depth >= 1 ? options.maxSubProperties : options.maxProperties
    const allowedPropertiesCount = Math.min(depthMaxProps, remainingProperties)

    let typeProperties = apparentType.getProperties()
    if (options.hidePrivateProperties) {
      typeProperties = typeProperties.filter((symbol) => isPublicProperty(symbol))
    }

    const publicProperties = typeProperties.slice(0, allowedPropertiesCount)

    propertiesCount += publicProperties.length
    const excessProperties = Math.max(typeProperties.length - publicProperties.length, 0)

    const properties: TypeProperty[] = publicProperties.map(symbol => {
      const symbolType = checker.getTypeOfSymbol(symbol)
      return {
        name: symbol.getName(),
        readonly: isReadOnly(symbol),
        type: getTypeTree(symbolType, depth + 1, new Set(visited)) // Add depth for sub-properties
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
      properties,
      excessProperties
    }
  }

  return {
    kind: 'basic',
    typeName
  }
}

function isPrimitiveType (type: ts.Type): boolean {
  const typeFlags = type.flags

  if (typeFlags & typescript.TypeFlags.EnumLike) return false

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
    typeFlags & typescript.TypeFlags.BigInt ||
    typeFlags & typescript.TypeFlags.BigIntLiteral ||
    typeFlags & typescript.TypeFlags.ESSymbol ||
    typeFlags & typescript.TypeFlags.UniqueESSymbol ||
    typeFlags & typescript.TypeFlags.Never ||
    typeFlags & typescript.TypeFlags.Unknown ||
    typeFlags & typescript.TypeFlags.Any
  )
}

function isIntrinsicType (type: ts.Type): type is ts.IntrinsicType {
  return (type.flags & typescript.TypeFlags.Intrinsic) !== 0
}

/**
 * Sort union types by intrinsic types order, following ts quick info order
 * Ex.
 * string, number, bigint, { a: string }, null, undefined
 */
function sortUnionTypes (a: ts.Type, b: ts.Type): number {
  const primitiveTypesOrder = ['string', 'number', 'bigint', 'boolean', 'symbol']
  const falsyTypesOrder = ['null', 'undefined']

  const aIntrinsicName = isIntrinsicType(a) ? a.intrinsicName : ''
  const bIntrinsicName = isIntrinsicType(b) ? b.intrinsicName : ''

  const aPrimitiveIndex = primitiveTypesOrder.indexOf(aIntrinsicName)
  const bPrimitiveIndex = primitiveTypesOrder.indexOf(bIntrinsicName)
  const aFalsyIndex = falsyTypesOrder.indexOf(aIntrinsicName)
  const bFalsyIndex = falsyTypesOrder.indexOf(bIntrinsicName)

  // If both types are primitive, sort based on the order in primitiveTypesOrder
  if (aPrimitiveIndex !== -1 && bPrimitiveIndex !== -1) {
    return aPrimitiveIndex - bPrimitiveIndex
  }

  // If one type is primitive and the other is not, the primitive type should come first
  if (aPrimitiveIndex !== -1) {
    return -1
  }

  if (bPrimitiveIndex !== -1) {
    return 1
  }

  // If both types are falsy, sort based on the order in falsyTypesOrder
  if (aFalsyIndex !== -1 && bFalsyIndex !== -1) {
    return aFalsyIndex - bFalsyIndex
  }

  // If one type is falsy and the other is not, the falsy type should come last
  if (aFalsyIndex !== -1) {
    return 1
  }
  if (bFalsyIndex !== -1) {
    return -1
  }

  // If neither type is primitive or falsy, maintain the original order
  return 0
}

function isPublicProperty (symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations()
  if (!declarations) return true

  const name = symbol.getName()
  if (name.startsWith('_') || name.startsWith('#')) return false

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

function isReadOnly (symbol: ts.Symbol | undefined): boolean {
  if (!symbol) return false

  const declarations = symbol.getDeclarations()
  if (!declarations) return false

  return declarations.some(declaration => (
    (
      typescript.isPropertyDeclaration(declaration) ||
      typescript.isMethodDeclaration(declaration)
    ) &&
    declaration.modifiers?.some(modifier => modifier.kind === typescript.SyntaxKind.ReadonlyKeyword)))
}
