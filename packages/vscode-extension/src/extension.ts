import type * as vscode from 'vscode'
import { registerHoverProvider } from './hover-provider'
import { registerCommands } from './commands-provider'

export function activate (context: vscode.ExtensionContext): void {
  registerHoverProvider(context)
  registerCommands(context)
}
