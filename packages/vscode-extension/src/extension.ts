import type * as vscode from "vscode";
import { registerHoverProvider } from "./hover-provider";
import { registerCommands } from "./commands-provider";
import { registerPluginConfiguration } from "./plugin-configuration";
import { createTypeClient } from "./type-client";

export function activate(context: vscode.ExtensionContext): void {
  const client = createTypeClient(context);
  registerPluginConfiguration(context, client.log);
  registerHoverProvider(context, client);
  registerCommands(context, client);
}
