import * as vscode from "vscode";
import type { PrettifyOptions } from "@prettify-ts/typescript-plugin/src/request";
import {
  DEFAULT_OPTIONS,
  DISPLAY_DEFAULTS,
  integerSetting,
  normalizeOptions,
} from "@prettify-ts/typescript-plugin/src/options";

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
    options: normalizeOptions(options),
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
