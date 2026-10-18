import * as vscode from "vscode";
import type { PrettifyOptions } from "@prettify-ts/core/src/options";
import { DEFAULT_OPTIONS, DISPLAY_DEFAULTS, integerSetting, normalizeOptions } from "@prettify-ts/core/src/options";
import { HOVER_DEFAULTS, hoverMode, hoverPlacement } from "@prettify-ts/core/src/compose";
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

/** Settings for the TypeScript plugin, which merges hovers itself: the defaults plus each language's own values. */
export function pluginConfiguration(): PluginConfiguration {
  const read = (config: vscode.WorkspaceConfiguration) =>
    Object.fromEntries(pluginKeys.map((key) => [key, config.get(key)])) as PluginConfiguration;
  return {
    ...read(vscode.workspace.getConfiguration("prettify-ts")),
    languages: Object.fromEntries(
      supportedLanguages.map((languageId) => [
        languageId,
        read(vscode.workspace.getConfiguration("prettify-ts", { languageId })),
      ]),
    ),
  };
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
