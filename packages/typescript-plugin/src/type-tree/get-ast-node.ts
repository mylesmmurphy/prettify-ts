import type * as ts from "typescript";

/**
 * https://github.com/dsherret/ts-ast-viewer/blob/b4be8f2234a1c3c099296bf5d0ad6cc14107367c/site/src/compiler/getDescendantAtRange.ts
 * https://github.com/mxsdev/ts-type-explorer/blob/main/packages/api/src/util.ts#L763
 */
export function getDescendantAtRange(
  typescript: typeof ts,
  sourceFile: ts.SourceFile,
  range: [number, number],
): ts.Node | undefined {
  let bestMatch: { node: ts.Node; start: number; end: number } = {
    node: sourceFile,
    start: sourceFile.getStart(sourceFile),
    end: sourceFile.getEnd(),
  };

  searchDescendants(sourceFile);
  return bestMatch.node;

  function searchDescendants(node: ts.Node): void {
    const start = node.getStart(sourceFile);
    const end = node.getEnd();

    if (start <= range[0] && end >= range[1]) {
      if (start >= bestMatch.start && end <= bestMatch.end) {
        bestMatch = { node, start, end };
      }
    }

    node.forEachChild((child) => {
      searchDescendants(child);
    });
  }
}
