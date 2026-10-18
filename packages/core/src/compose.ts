import type { HoverPreview } from "./preview";

/** How Prettify's preview appears: inside TypeScript's own hover, or as a hover of its own. */
export const HOVER_MODES = ["merged", "separate"] as const;
export type HoverMode = (typeof HOVER_MODES)[number];

/** Where the preview goes relative to TypeScript's own hover content. */
export const HOVER_PLACEMENTS = ["prettifiedFirst", "nativeFirst", "prettifiedOnly"] as const;
export type HoverPlacement = (typeof HOVER_PLACEMENTS)[number];

export const HOVER_DEFAULTS: { mode: HoverMode; placement: HoverPlacement } = {
  mode: "merged",
  placement: "prettifiedFirst",
};

export function hoverMode(value: unknown, fallback: HoverMode = HOVER_DEFAULTS.mode): HoverMode {
  return HOVER_MODES.includes(value as HoverMode) ? (value as HoverMode) : fallback;
}

export function hoverPlacement(value: unknown): HoverPlacement {
  return HOVER_PLACEMENTS.includes(value as HoverPlacement) ? (value as HoverPlacement) : HOVER_DEFAULTS.placement;
}

/** A code fence longer than any backtick run in the code, so type text cannot close it early. */
export function codeBlock(code: string, language = "typescript"): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return fence + language + "\n" + code + "\n" + fence;
}

/** Characters that markdown would interpret in a plain sentence. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!<>|~]/g, "\\$&");
}

/** The preview as markdown: a typescript code block, then the limits note. */
export function previewMarkdown(preview: HoverPreview): string {
  return codeBlock(preview.code) + (preview.note ? "\n\n" + escapeMarkdown(preview.note) : "");
}

/** Separates the preview from TypeScript's content, as separate hovers are separated. */
export const SECTION_SEPARATOR = "\n\n---\n\n";

const LEADING_CODE_BLOCK = /^\s*(`{3,})[^\n]*\n([\s\S]*?)\n\1[^\S\n]*(?:\n|$)/;

/** Split TypeScript's hover markdown into its leading signature code block and the documentation after it. */
export function splitNativeMarkdown(markdown: string): { signature?: string; documentation: string } {
  const match = LEADING_CODE_BLOCK.exec(markdown);
  if (!match) return { documentation: markdown };
  return { signature: match[2]!, documentation: markdown.slice(match[0].length).replace(/^\s*(?:---\s*)?/, "") };
}

/** Combine TypeScript's hover markdown with the preview (TypeScript 7 hovers are markdown). */
export function composeMarkdown(native: string, preview: HoverPreview, placement: HoverPlacement): string {
  const block = previewMarkdown(preview);
  if (placement === "nativeFirst") return native.trimEnd() + SECTION_SEPARATOR + block;
  if (placement === "prettifiedOnly") {
    const { documentation } = splitNativeMarkdown(native);
    return documentation.trim() ? block + SECTION_SEPARATOR + documentation.trim() : block;
  }
  return block + SECTION_SEPARATOR + native.trimStart();
}
