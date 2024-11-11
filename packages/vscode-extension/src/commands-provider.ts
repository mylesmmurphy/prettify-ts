import * as vscode from 'vscode'

export function registerCommands (context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('prettify-ts.toggle', async (option?: boolean) => {
      const config = vscode.workspace.getConfiguration('prettify-ts')
      if (option === true || option === false) {
        await config.update('enabled', option, vscode.ConfigurationTarget.Global)
        return
      }

      await config.update('enabled', !config.get('enabled', true), vscode.ConfigurationTarget.Global)
    })
  )
}
