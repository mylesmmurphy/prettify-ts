import * as vscode from 'vscode'
import { registerHoverProvider } from './hover-provider'

const outputChannel = vscode.window.createOutputChannel('Prettify-TS')

export function activate (context: vscode.ExtensionContext): void {
  outputChannel.show()
  registerHoverProvider(context, outputChannel)
}

export function deactivate (): void {
  outputChannel.dispose()
}
