import type * as vscode from "vscode";
import { registerHoverProvider } from "./hover-provider";
import { registerCommands } from "./commands-provider";
import { createTypeClient } from "./type-client";

export function activate(context: vscode.ExtensionContext): void {
  const client = createTypeClient(context);
  registerHoverProvider(context, client);
  registerCommands(context, client);
}
