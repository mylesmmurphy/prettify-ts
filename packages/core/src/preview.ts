import type { TypeInfo } from "./types";
import { hoverMarkers, renderTypeParts, sanitizeString } from "./stringify";

// Configured presentation limits are already marked inline (`/* ... N more */`, named references at Max Depth).
const inlineLimits = new Set([
  "object depth limit",
  "property limit",
  "union member limit",
  "function signature limit",
  "circular reference",
]);

/** Limits that output does not show inline, such as safety budgets and compiler truncation. */
export function reportedLimits(info: TypeInfo): string[] {
  return (info.truncationReasons ?? []).filter((reason) => !inlineLimits.has(reason));
}

export function limitPreview(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) + "..." : text;
}

/** The prettified type as a hover shows it. */
export type HoverPreview = {
  /** Declaration and type, cut at Max Characters, for a typescript code block. */
  code: string;
  /** Limits not marked inline, as a sentence. */
  note?: string;
  declaration: string;
  type: string;
  limits: string[];
};

export function renderHoverPreview(
  info: TypeInfo,
  settings: { indentation: number; maxCharacters: number },
): HoverPreview {
  const parts = renderTypeParts(info, settings.indentation);
  const type = hoverMarkers(parts.type);
  const limits = reportedLimits(info);
  return {
    code: limitPreview((parts.declaration + type).trimEnd(), settings.maxCharacters),
    ...(limits.length ? { note: "Expansion limited: " + limits.join(", ") + "." } : {}),
    declaration: parts.declaration,
    type,
    limits,
  };
}

/** TypeScript's own hover already shows the same type, so the preview would only repeat it. */
export function isRedundant(preview: HoverPreview, nativeSignature: string | undefined): boolean {
  return (
    !!nativeSignature &&
    !preview.limits.length &&
    /^(?:type|const|let|var|function)\b/.test(preview.declaration) &&
    sanitizeString(nativeSignature).includes(sanitizeString(preview.type))
  );
}
