import * as vscode from 'vscode'
import { EXTENSION_ID } from './consts'

export function registerCommands (context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.toggleHover`, async (option?: boolean) => {
      const config = vscode.workspace.getConfiguration(EXTENSION_ID)
      if (option === true || option === false) {
        await config.update('enableHover', option, vscode.ConfigurationTarget.Global)
        return
      }

      await config.update('enableHover', !config.get('enableHover', true), vscode.ConfigurationTarget.Global)
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.toggleViewNestedTypes`, async (option?: boolean) => {
      const config = vscode.workspace.getConfiguration(EXTENSION_ID)
      if (option === true || option === false) {
        await config.update('viewNestedTypes', option, vscode.ConfigurationTarget.Global)
        return
      }

      await config.update('viewNestedTypes', !config.get('viewNestedTypes', false), vscode.ConfigurationTarget.Global)
    })
  )
}
