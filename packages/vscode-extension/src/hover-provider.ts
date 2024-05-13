import * as vscode from 'vscode'
import type { PrettifyResponse } from './types'
import { formatTypeString, getDeclaration, getTypeString } from './functions'

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

    const prettifyResponse: PrettifyResponse | undefined = response?.body?.__prettifyResponse
    if (!prettifyResponse) return

    const { typeInfo, syntaxKind, name } = prettifyResponse

    const typeString = getTypeString(typeInfo)
    const formattedTypeString = formatTypeString(typeString)
    const declaration = getDeclaration(syntaxKind, name)

    const hoverText = new vscode.MarkdownString()
    hoverText.appendCodeblock(`${declaration} ${formattedTypeString}`, document.languageId)
    return new vscode.Hover(hoverText)
  }

  context.subscriptions.push(vscode.languages.registerHoverProvider('typescript', { provideHover }))
  context.subscriptions.push(vscode.languages.registerHoverProvider('typescriptreact', { provideHover }))
}
