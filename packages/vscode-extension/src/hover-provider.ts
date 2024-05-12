import * as vscode from 'vscode'

export function registerHoverProvider (context: vscode.ExtensionContext): void {
  async function provideHover (
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const location = {
      file: document.uri.fsPath,
      line: position.line + 1,
      offset: position.character + 1
    }

    const test = await vscode.commands.executeCommand('typescript.tsserverRequest', 'quickinfo-full', location)
    const test2 = await vscode.commands.executeCommand('typescript.tsserverRequest', 'completionInfo', location)

    console.log(test)
    console.log(test2)

    return undefined
  }

  context.subscriptions.push(vscode.languages.registerHoverProvider('typescript', { provideHover }))
  context.subscriptions.push(vscode.languages.registerHoverProvider('typescriptreact', { provideHover }))
}
