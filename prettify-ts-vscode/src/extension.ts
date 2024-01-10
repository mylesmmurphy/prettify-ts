import type * as vscode from 'vscode'
import { registerWebViews } from './webviews'
import { registerCommands } from './commands'
import { registerHoverProvider } from './hover-provider'
import { registerProjectInitializer } from './project-initializer'

export function activate (context: vscode.ExtensionContext): void {
  registerProjectInitializer(context)
  registerCommands(context)
  registerHoverProvider(context)
  registerWebViews(context)
}
