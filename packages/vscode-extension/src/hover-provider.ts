import * as vscode from 'vscode'
import type { TypeInfo } from './types'
import { formatTypeString, getTypeString } from './functions'

export function registerHoverProvider (context: vscode.ExtensionContext): void {
  async function provideHover (
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const request = { meta: 'prettify-request' }
    const location = {
      file: document.uri.fsPath,
      line: position.line + 1,
      offset: position.character + 1
    }

    const response: any = await vscode.commands.executeCommand(
      'typescript.tsserverRequest',
      'completionInfo',
      {
        ...location,
        triggerCharacter: request
      }
    )

    const typeInfo: TypeInfo = response?.body?.__prettifyResponse?.typeInfo

    const typeString = getTypeString(typeInfo)
    const formattedTypeString = formatTypeString(typeString)

    const hoverText = new vscode.MarkdownString()
    hoverText.appendCodeblock(`type test = ${formattedTypeString}`, document.languageId)
    return new vscode.Hover(hoverText)
  }

  context.subscriptions.push(vscode.languages.registerHoverProvider('typescript', { provideHover }))
  context.subscriptions.push(vscode.languages.registerHoverProvider('typescriptreact', { provideHover }))
}
