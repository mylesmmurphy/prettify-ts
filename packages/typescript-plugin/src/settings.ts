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
  /**
   * Each workspace folder's effective settings, with its own `languages`. A file uses the deepest folder that
   * contains it; files outside every folder use the top-level settings.
   */
  folders?: (PluginConfiguration & { path?: unknown })[];
  /**
   * The VS Code language of open files whose language mode differs from what their name implies, by path. TS Server
   * keeps the script kind of a file it loaded before the editor opened it, so it cannot tell these apart.
   */
  documentLanguages?: Record<string, unknown>;
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

/** The VS Code language id a file name suggests, for files whose script kind TS Server does not know. */
export function languageOf(fileName: string): string | undefined {
  let language: string | undefined;
  for (const [pattern, id] of extensionLanguages) if (pattern.test(fileName)) language = id;
  return language;
}

function normalizePath(path: string, caseSensitive: boolean): string {
  const slashes = path.replace(/\\/g, "/");
  return caseSensitive ? slashes : slashes.toLowerCase();
}

/** The language the editor reports for an open file, when it differs from what the file's name implies. */
export function documentLanguageOf(
  configuration: PluginConfiguration,
  fileName: string,
  caseSensitive = true,
): string | undefined {
  const file = normalizePath(fileName, caseSensitive);
  for (const [path, language] of Object.entries(configuration.documentLanguages ?? {})) {
    if (typeof language === "string" && normalizePath(path, caseSensitive) === file) return language;
  }
  return undefined;
}

/** The settings scope of a file: its workspace folder's settings, or the top-level ones. */
function scopeOf(configuration: PluginConfiguration, fileName: string, caseSensitive: boolean): PluginConfiguration {
  const normalize = (path: string) => normalizePath(path, caseSensitive);
  const file = normalize(fileName);
  let best: { folder: PluginConfiguration; length: number } | undefined;
  for (const folder of configuration.folders ?? []) {
    if (typeof folder.path !== "string" || !folder.path) continue;
    const path = normalize(folder.path);
    const prefix = path.endsWith("/") ? path : path + "/";
    if (file.startsWith(prefix) && (!best || prefix.length > best.length)) best = { folder, length: prefix.length };
  }
  return best?.folder ?? configuration;
}

/**
 * A file's hover settings. `language` is the VS Code language id of the document, which language-specific settings
 * are keyed by; it defaults to the one the file name suggests.
 */
export function resolveHoverSettings(
  configuration: PluginConfiguration,
  fileName: string,
  caseSensitive = true,
  language = languageOf(fileName),
): HoverSettings {
  const scope = scopeOf(configuration, fileName, caseSensitive);
  const merged: PluginConfiguration = { ...scope, ...(language ? scope.languages?.[language] : {}) };
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
