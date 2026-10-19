import * as vscode from "vscode";
import { registerHoverProvider } from "./hover-provider";
import { registerCommands } from "./commands-provider";
import { registerPluginConfiguration } from "./plugin-configuration";
import { createTypeClient } from "./type-client";
import { createTsgoClient, isTsgoEnabled } from "./tsgo-client";

export function activate(context: vscode.ExtensionContext): void {
  const client = createTypeClient(context);
  const tsgo = createTsgoClient(context, client.log);
  registerPluginConfiguration(context, client.log);
  registerHoverProvider(context, client, tsgo);
  registerCommands(context, client, tsgo);
  // Connect only when VS Code runs TypeScript 7, so its extension is not activated otherwise.
  if (isTsgoEnabled()) void tsgo.start();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      const changed =
        event.affectsConfiguration("js/ts.experimental.useTsgo") ||
        event.affectsConfiguration("typescript.experimental.useTsgo");
      if (changed && isTsgoEnabled()) void tsgo.start();
    }),
  );
}
