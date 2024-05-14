import type * as ts from 'typescript'

/**
 * https://github.com/dsherret/ts-ast-viewer/blob/b4be8f2234a1c3c099296bf5d0ad6cc14107367c/site/src/compiler/getDescendantAtRange.ts
 * https://github.com/mxsdev/ts-type-explorer/blob/main/packages/api/src/util.ts#L763
 */
export function getDescendantAtRange (
  typescript: typeof ts,
  sourceFile: ts.SourceFile,
  range: [number, number]
): ts.Node | undefined {
  let bestMatch: { node: ts.Node, start: number } = {
    node: sourceFile,
    start: sourceFile.getStart(sourceFile)
  }

  searchDescendants(sourceFile)
  return bestMatch.node

  function searchDescendants (node: ts.Node): ts.Node | undefined {
    const children: ts.Node[] = []
    node.forEachChild((child) => {
      children.push(child)
      return undefined
    })

    for (const child of children) {
      if (child.kind !== typescript.SyntaxKind.SyntaxList) {
        if (isBeforeRange(child.end)) {
          continue
        }

        const childStart = child.getStart(sourceFile)

        if (isAfterRange(childStart)) {
          return
        }

        const isEndOfFileToken = child.kind === typescript.SyntaxKind.EndOfFileToken
        const hasSameStart = bestMatch.start === childStart && range[0] === childStart

        if (!isEndOfFileToken && !hasSameStart) {
          bestMatch = { node: child, start: childStart }
        }
      }

      searchDescendants(child)
    }
  }

  function isBeforeRange (pos: number): boolean {
    return pos < range[0]
  }

  function isAfterRange (nodeEnd: number): boolean {
    return nodeEnd >= range[0] && nodeEnd > range[1]
  }
}
