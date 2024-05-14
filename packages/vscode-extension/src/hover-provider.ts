import * as vscode from 'vscode'
import type { TypeInfo } from './types'
import { formatTypeString, getDeclaration, getTypeString } from './type-tree-stringify'

export function registerHoverProvider (context: vscode.ExtensionContext): void {
  async function provideHover (
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const request = { meta: 'prettify-type-info-request' }
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

    const prettifyResponse: TypeInfo | undefined = response?.body?.__prettifyResponse
    if (!prettifyResponse) return

    const { typeTree, syntaxKind, name } = prettifyResponse

    const typeString = getTypeString(typeTree)
    const formattedTypeString = formatTypeString(typeString)
    const declaration = getDeclaration(syntaxKind, name)

    const hoverText = new vscode.MarkdownString()
    hoverText.appendCodeblock(`${declaration} ${formattedTypeString}`, document.languageId)
    return new vscode.Hover(hoverText)
  }

  context.subscriptions.push(vscode.languages.registerHoverProvider('typescript', { provideHover }))
  context.subscriptions.push(vscode.languages.registerHoverProvider('typescriptreact', { provideHover }))
}
