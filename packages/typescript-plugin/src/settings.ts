import type { PrettifyOptions } from "@prettify-ts/core/src/options";
import { DEFAULT_OPTIONS, DISPLAY_DEFAULTS, integerSetting, normalizeOptions } from "@prettify-ts/core/src/options";
import { hoverMode, hoverPlacement } from "@prettify-ts/core/src/compose";
import type { HoverMode, HoverPlacement } from "@prettify-ts/core/src/compose";

/**
 * Settings sent by the VS Code extension (`configurePlugin`) or written in a tsconfig `plugins` entry.
 * Names match the `prettify-ts.*` settings; `languages` holds per-language overrides by VS Code language id.
 */
export type PluginConfiguration = { [K in keyof PrettifyOptions]?: unknown } & {
  enabled?: unknown;
  typeIndentation?: unknown;
  maxCharacters?: unknown;
  hoverMode?: unknown;
  hoverPlacement?: unknown;
  languages?: Record<string, PluginConfiguration | undefined>;
};

export type HoverSettings = {
  enabled: boolean;
  mode: HoverMode;
  placement: HoverPlacement;
  indentation: number;
  maxCharacters: number;
  options: PrettifyOptions;
};

const extensionLanguages: [RegExp, string][] = [
  [/\.[cm]?tsx?$/i, "typescript"],
  [/\.tsx$/i, "typescriptreact"],
  [/\.[cm]?js$/i, "javascript"],
  [/\.jsx$/i, "javascriptreact"],
  [/\.vue$/i, "vue"],
];

/** The VS Code language id of a file, for language-specific settings. */
export function languageOf(fileName: string): string | undefined {
  let language: string | undefined;
  for (const [pattern, id] of extensionLanguages) if (pattern.test(fileName)) language = id;
  return language;
}

export function resolveHoverSettings(configuration: PluginConfiguration, fileName: string): HoverSettings {
  const language = languageOf(fileName);
  const merged: PluginConfiguration = { ...configuration, ...(language ? configuration.languages?.[language] : {}) };
  const options: Partial<PrettifyOptions> = {};
  for (const key of Object.keys(DEFAULT_OPTIONS) as (keyof PrettifyOptions)[]) {
    if (merged[key] !== undefined) Object.assign(options, { [key]: merged[key] });
  }
  return {
    enabled: merged.enabled !== false,
    // Outside VS Code the plugin is the only integration, so hovers are merged unless configured otherwise.
    mode: hoverMode(merged.hoverMode),
    placement: hoverPlacement(merged.hoverPlacement),
    indentation: integerSetting(merged.typeIndentation, DISPLAY_DEFAULTS.typeIndentation, 0),
    maxCharacters: integerSetting(merged.maxCharacters, DISPLAY_DEFAULTS.maxCharacters, 0, 99000),
    options: normalizeOptions({ ...options, fullExpansion: false, copy: false }),
  };
}
