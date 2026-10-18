import type * as ts from "typescript";
import { codeBlock, escapeMarkdown, previewMarkdown } from "@prettify-ts/core/src/compose";
import type { HoverPlacement } from "@prettify-ts/core/src/compose";
import { isRedundant } from "@prettify-ts/core/src/preview";
import type { HoverPreview } from "@prettify-ts/core/src/preview";

/**
 * Editors show the display parts as a typescript code block and the documentation as markdown, so a single text
 * part holds the preview, and code blocks in the documentation hold anything moved out of the signature.
 */
export function mergeQuickInfo(
  typescript: typeof ts,
  quickInfo: ts.QuickInfo,
  preview: HoverPreview,
  placement: HoverPlacement,
): ts.QuickInfo {
  const text = (value: string): ts.SymbolDisplayPart => ({ kind: "text", text: value });
  const signature = typescript.displayPartsToString(quickInfo.displayParts);
  if (isRedundant(preview, signature)) return quickInfo;
  const documentation = quickInfo.documentation ?? [];
  const gap = documentation.length ? "\n\n" : "";
  const note = preview.note ? [text(escapeMarkdown(preview.note) + "\n\n")] : [];
  if (placement === "nativeFirst")
    return { ...quickInfo, documentation: [...documentation, text(gap + previewMarkdown(preview))] };
  if (placement === "prettifiedOnly")
    return { ...quickInfo, displayParts: [text(preview.code)], documentation: [...note, ...documentation] };
  return {
    ...quickInfo,
    displayParts: [text(preview.code)],
    documentation: signature
      ? [...note, text(codeBlock(signature) + gap), ...documentation]
      : [...note, ...documentation],
  };
}
