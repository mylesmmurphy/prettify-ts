import * as vscode from "vscode";
import { documentLanguages, pluginConfiguration } from "./configuration";

const PLUGIN_NAME = "@prettify-ts/typescript-plugin";

type TypeScriptExtensionApi = {
  getAPI?(version: 0): { configurePlugin(pluginId: string, configuration: unknown): void } | undefined;
};

/**
 * Merged hovers are built by the TypeScript plugin inside TS Server, so it needs the current settings.
 * VS Code's TypeScript extension re-sends the latest configuration whenever TS Server restarts.
 */
export function registerPluginConfiguration(context: vscode.ExtensionContext, log: (error: unknown) => void): void {
  async function send(): Promise<void> {
    try {
      const extension = vscode.extensions.getExtension<TypeScriptExtensionApi>("vscode.typescript-language-features");
      if (!extension) return;
      const exports = extension.isActive ? extension.exports : await extension.activate();
      exports?.getAPI?.(0)?.configurePlugin(PLUGIN_NAME, pluginConfiguration());
    } catch (error) {
      log(error);
    }
  }
  void send();
  // A language mode change closes and reopens the document; resend only when the reported languages change.
  let reported = JSON.stringify(documentLanguages());
  const documentsChanged = () => {
    const languages = JSON.stringify(documentLanguages());
    if (languages === reported) return;
    reported = languages;
    void send();
  };
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(documentsChanged),
    vscode.workspace.onDidCloseTextDocument(documentsChanged),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("prettify-ts")) void send();
    }),
    // Folder settings are sent per folder, so added and removed folders change the configuration too.
    vscode.workspace.onDidChangeWorkspaceFolders(() => void send()),
  );
}
