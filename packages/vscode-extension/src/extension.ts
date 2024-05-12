import type * as vscode from 'vscode'
import { registerHoverProvider } from './hover-provider'

export function activate (context: vscode.ExtensionContext): void {
  registerHoverProvider(context)
}
