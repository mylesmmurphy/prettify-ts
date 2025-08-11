import * as ts from "typescript/lib/tsserverlibrary";
import type { TypeTree } from "./types";

/**
 * Converts a TypeTree to an array of SymbolDisplayParts for semantic syntax highlighting.
 *
 * This function extracts the pre-generated displayParts from the TypeTree if available,
 * or provides a fallback to ensure the function always returns valid display parts.
 * The displayParts enable proper syntax highlighting in TypeScript-aware editors by
 * providing semantic token information for each part of the type.
 *
 * @param tree - The TypeTree to convert to display parts
 * @returns Array of SymbolDisplayParts with semantic token information
 *
 * @example
 * ```typescript
 * const typeTree = getTypeTree(type, 0, new Set(), { generateDisplayParts: true });
 * const displayParts = typeTreeToDisplayParts(typeTree);
 * // displayParts will contain semantic tokens like:
 * // [{ text: "string", kind: "keyword" }, { text: "[]", kind: "punctuation" }]
 * ```
 *
 * @remarks
 * - If the TypeTree was generated without the `generateDisplayParts` flag, this function
 *   will return a simple text representation as a fallback.
 * - The function maintains backward compatibility by always returning valid display parts.
 * - Display parts are used by editors to provide syntax highlighting in hover tooltips.
 */
export function typeTreeToDisplayParts(tree: TypeTree): ts.SymbolDisplayPart[] {
  if (tree.displayParts && tree.displayParts.length > 0) {
    return tree.displayParts;
  }

  // If displayParts are missing, return simple fallback
  // This maintains backward compatibility and handles cases where
  // generateDisplayParts flag was false during tree generation
  return [
    {
      text: tree.typeName,
      kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.text],
    },
  ];
}

/**
 * Checks if a TypeTree has display parts generated.
 *
 * @param tree The TypeTree to check
 * @returns true if display parts are available, false otherwise
 */
export function hasDisplayParts(tree: TypeTree): boolean {
  return Boolean(tree.displayParts && tree.displayParts.length > 0);
}
