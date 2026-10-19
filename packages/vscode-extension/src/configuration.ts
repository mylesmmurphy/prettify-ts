import * as vscode from "vscode";
import type { PrettifyOptions } from "@prettify-ts/core/src/options";
import { DEFAULT_OPTIONS, DISPLAY_DEFAULTS, integerSetting, normalizeOptions } from "@prettify-ts/core/src/options";
import { HOVER_DEFAULTS, hoverMode, hoverPlacement } from "@prettify-ts/core/src/compose";
import { languageOf } from "@prettify-ts/typescript-plugin/src/settings";
import type { PluginConfiguration } from "@prettify-ts/typescript-plugin/src/settings";

export const supportedLanguages = ["typescript", "typescriptreact", "javascript", "javascriptreact", "vue"];

export function readSettings(document?: vscode.TextDocument, full = false, copy = false) {
  const config = vscode.workspace.getConfiguration("prettify-ts", document);
  const options: Partial<PrettifyOptions> = {};
  for (const key of Object.keys(DEFAULT_OPTIONS) as (keyof typeof DEFAULT_OPTIONS)[]) {
    Object.assign(options, { [key]: config.get(key, DEFAULT_OPTIONS[key]) });
  }
  options.fullExpansion = full;
  options.copy = copy || full;
  return {
    config,
    enabled: config.get("enabled", DISPLAY_DEFAULTS.enabled),
    indentation: integerSetting(config.get("typeIndentation"), DISPLAY_DEFAULTS.typeIndentation, 0),
    maxCharacters: integerSetting(config.get("maxCharacters"), DISPLAY_DEFAULTS.maxCharacters, 0, 99000),
    hoverMode: hoverMode(config.get("hoverMode", HOVER_DEFAULTS.mode)),
    hoverPlacement: hoverPlacement(config.get("hoverPlacement", HOVER_DEFAULTS.placement)),
    options: normalizeOptions(options),
  };
}

const pluginKeys = [
  "enabled",
  "typeIndentation",
  "maxCharacters",
  "hoverMode",
  "hoverPlacement",
  ...Object.keys(DEFAULT_OPTIONS),
] as const;

/**
 * Settings for the TypeScript plugin, which merges hovers itself and has no document to read them for. It gets
 * the settings without a resource, and each workspace folder's effective settings, every one with its
 * language-specific values; it matches a file to its folder.
 */
export function pluginConfiguration(): PluginConfiguration {
  const read = (scope?: vscode.ConfigurationScope) => {
    const config = vscode.workspace.getConfiguration("prettify-ts", scope);
    return Object.fromEntries(pluginKeys.map((key) => [key, config.get(key)])) as PluginConfiguration;
  };
  const withLanguages = (uri?: vscode.Uri): PluginConfiguration => ({
    ...read(uri),
    languages: Object.fromEntries(
      supportedLanguages.map((languageId) => [languageId, read(uri ? { uri, languageId } : { languageId })]),
    ),
  });
  return {
    ...withLanguages(),
    // TS Server sees files by file-system path, so only folders on the file system can match.
    folders: (vscode.workspace.workspaceFolders ?? [])
      .filter((folder) => folder.uri.scheme === "file")
      .map((folder) => ({ path: folder.uri.fsPath, ...withLanguages(folder.uri) })),
    documentLanguages: documentLanguages(),
  };
}

/**
 * Open files whose language mode differs from what their name implies (`files.associations`, a changed language
 * mode), by path. TS Server keeps the script kind of files it loaded before they were opened.
 */
export function documentLanguages(): Record<string, string> {
  return Object.fromEntries(
    vscode.workspace.textDocuments
      .filter(
        (document) =>
          document.uri.scheme === "file" &&
          supportedLanguages.includes(document.languageId) &&
          document.languageId !== languageOf(document.uri.fsPath),
      )
      .map((document) => [document.uri.fsPath, document.languageId]),
  );
}

export async function toggleEnabled(option?: boolean): Promise<void> {
  const document = vscode.window.activeTextEditor?.document;
  const { config, enabled } = readSettings(document);
  const inspected = config.inspect<boolean>("enabled");
  const value = typeof option === "boolean" ? option : !enabled;
  // Language overrides take precedence over ordinary settings at every target.
  for (const [key, target, language] of [
    ["workspaceFolderLanguageValue", vscode.ConfigurationTarget.WorkspaceFolder, true],
    ["workspaceLanguageValue", vscode.ConfigurationTarget.Workspace, true],
    ["globalLanguageValue", vscode.ConfigurationTarget.Global, true],
    ["workspaceFolderValue", vscode.ConfigurationTarget.WorkspaceFolder, false],
    ["workspaceValue", vscode.ConfigurationTarget.Workspace, false],
    ["globalValue", vscode.ConfigurationTarget.Global, false],
  ] as const) {
    if (inspected?.[key] !== undefined) {
      await config.update("enabled", value, target, language);
      return;
    }
  }
  await config.update("enabled", value, vscode.ConfigurationTarget.Global);
}
