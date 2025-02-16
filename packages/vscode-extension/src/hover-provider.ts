import * as vscode from 'vscode'

export function registerHoverProvider (context: vscode.ExtensionContext): void {
  async function provideHover (
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    console.log('test');

    const location = {
      file: document.uri.fsPath,
      line: position.line + 1,
      offset: position.character + 1
    }

    const quickInfo: any = await vscode.commands.executeCommand('typescript.tsserverRequest', 'quickinfo', location)


    if (!quickInfo) {
      return
    }
    return;
  }

  context.subscriptions.push(vscode.languages.registerHoverProvider('typescript', { provideHover }))
  context.subscriptions.push(vscode.languages.registerHoverProvider('typescriptreact', { provideHover }))
}
