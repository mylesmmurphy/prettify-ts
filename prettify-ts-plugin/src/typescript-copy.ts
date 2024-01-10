import type {
  Node,
  SourceFile,
  Program,
  TypeChecker,
  Symbol
} from 'typescript'
import type _ts from 'typescript'

// Quick info depends on several completely unexported functions in TypeScript source code.
// Internal functions are accessed through `ts-expose-internals` but these functions are not exported at all, even internally.
// To get identical behavior as TypeScript does, the rest of this file is copied from the TypeScript source code and lightly edited.
// Unless otherwise noted, the only change is formatting, adding `ts` as a parameter where needed, and making necessary functions exported.

// Copied from https://github.com/microsoft/TypeScript/blob/f57e5104a3e21e82cafb818b531c8ec54ec0baa0/src/services/services.ts#L2092-L2106
export function getNodeForQuickInfo (ts: typeof _ts, node: Node): Node {
  if (ts.isNewExpression(node.parent) && node.pos === node.parent.pos) {
    return node.parent.expression
  }
  if (ts.isNamedTupleMember(node.parent) && node.pos === node.parent.pos) {
    return node.parent
  }
  if (ts.isImportMeta(node.parent) && node.parent.name === node) {
    return node.parent
  }
  if (ts.isJsxNamespacedName(node.parent)) {
    return node.parent
  }
  return node
}

// Copied from https://github.com/microsoft/TypeScript/blob/f57e5104a3e21e82cafb818b531c8ec54ec0baa0/src/services/services.ts#L1608-L1620
// NOTE: Edited to include program as a parameter (rather than implicitly using it from the scope).
export function getValidSourceFile (program: Program, fileName: string): SourceFile {
  const sourceFile = program.getSourceFile(fileName)

  // NOTE: Edited to comply with standard's lint, from `!sourceFile` to `sourceFile === undefined`.
  if (sourceFile === undefined) {
    const error: Error & _ts.PossibleProgramFileInfo = new Error(`Could not find source file: '${fileName}'.`)

    // We've been having trouble debugging this, so attach sidecar data for the tsserver log.
    // See https://github.com/microsoft/TypeScript/issues/30180.
    error.ProgramFiles = program.getSourceFiles().map(f => f.fileName)

    throw error
  }
  return sourceFile
}

// Copied from https://github.com/microsoft/TypeScript/blob/f57e5104a3e21e82cafb818b531c8ec54ec0baa0/src/services/services.ts#L3260-L3270
// NOTE: Edited to comply with standard's lint about undefined
// eslint-disable-next-line @typescript-eslint/ban-types
export function getSymbolAtLocationForQuickInfo (ts: typeof _ts, node: Node, checker: TypeChecker): Symbol | undefined {
  const object = ts.getContainingObjectLiteralElement(node)
  if (object !== undefined) {
    const contextualType = checker.getContextualType(object.parent)
    const properties = contextualType !== undefined ? ts.getPropertySymbolsFromContextualType(object, checker, contextualType, /* unionSymbolOk */ false) : undefined
    if (properties !== undefined && properties.length === 1) {
      return ts.first(properties)
    }
  }
  return checker.getSymbolAtLocation(node)
}

// Copied from https://github.com/microsoft/TypeScript/blob/f57e5104a3e21e82cafb818b531c8ec54ec0baa0/src/services/services.ts#L2108-L2126
export function shouldGetType (ts: typeof _ts, sourceFile: SourceFile, node: Node, position: number): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.Identifier:
      return !ts.isLabelName(node) && !ts.isTagName(node) && !ts.isConstTypeReference(node.parent)
    case ts.SyntaxKind.PropertyAccessExpression:
    case ts.SyntaxKind.QualifiedName:
      // Edited to comply with standard's lint about undefined
      // Don't return quickInfo if inside the comment in `a/**/.b`
      return ts.isInComment(sourceFile, position) !== undefined
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.ThisType:
    case ts.SyntaxKind.SuperKeyword:
    case ts.SyntaxKind.NamedTupleMember:
      return true
    case ts.SyntaxKind.MetaProperty:
      return ts.isImportMeta(node)
    default:
      return false
  }
}

// Copied from https://github.com/microsoft/TypeScript/blob/f57e5104a3e21e82cafb818b531c8ec54ec0baa0/src/services/services.ts#L1467-L1481
export class CancellationTokenObject implements _ts.CancellationToken {
  // NOTE: Added ts to the constructor for `throwIfCancellationRequested`.
  constructor (private readonly ts: typeof _ts, private readonly cancellationToken: _ts.HostCancellationToken) {
  }

  public isCancellationRequested (): boolean {
    return this.cancellationToken.isCancellationRequested()
  }

  public throwIfCancellationRequested (): void {
    if (this.isCancellationRequested()) {
      this.ts.tracing?.instant(this.ts.tracing.Phase.Session, 'cancellationThrown', { kind: 'CancellationTokenObject' })

      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw new this.ts.OperationCanceledException()
    }
  }
}
