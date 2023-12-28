import * as vscode from 'vscode'

import { EXTENSION_ID } from './consts'
import { MenuProvider } from './menu-provider'
import { TypeProvider } from './type-provider'
import { registerCommands } from './commands'
import { registerHoverProvider } from './hover-provider'

export function activate (context: vscode.ExtensionContext): void {
  registerCommands(context)
  registerHoverProvider(context)
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(`${EXTENSION_ID}-type-view`, new TypeProvider()))
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(`${EXTENSION_ID}-menu`, new MenuProvider(context)))
}
