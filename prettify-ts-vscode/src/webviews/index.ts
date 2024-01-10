import * as vscode from 'vscode'
import { MenuProvider } from './menu-provider'
import { TypeProvider } from './type-provider'
import { EXTENSION_ID } from '../consts'

export function registerWebViews (context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(`${EXTENSION_ID}-type-view`, new TypeProvider(context)))
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(`${EXTENSION_ID}-menu`, new MenuProvider(context)))
}
