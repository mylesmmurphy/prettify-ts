import * as vscode from 'vscode'
import { registerHoverProvider } from './hover-provider'
import { registerCommands } from './commands-provider'

const expectedConfigKeys = [
  'enabled',
  'typeIndentation',
  'maxDepth',
  'maxProperties',
  'maxSubProperties',
  'maxUnionMembers',
  'hidePrivateProperties',
  'unwrapFunctions',
  'unwrapArrays',
  'unwrapPromises',
  'skippedTypeNames',
  'maxCharacters'
] as const;

async function validateConfigKeys (): Promise<void> {
  const config = vscode.workspace.getConfiguration('prettify-ts');
  const validConfig = expectedConfigKeys.every(key => config.has(key));
  if (validConfig) return;

  const selection = await vscode.window.showInformationMessage('Prettify TS configuration has been updated. Please reload the window to apply the changes.', 'Reload')
  if (selection === 'Reload') {
    vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

export function activate (context: vscode.ExtensionContext): void {
  validateConfigKeys().catch(console.error)
  registerHoverProvider(context)
  registerCommands(context)
}
