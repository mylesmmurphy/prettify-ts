import * as vscode from 'vscode'
import type { TypeInfo } from './types'
import { prettyPrintTypeString, getSyntaxKindDeclaration, stringifyTypeTree } from './stringify-type-tree'

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

    const typeString = stringifyTypeTree(typeTree)
    let prettyTypeString = prettyPrintTypeString(typeString)
    const declaration = getSyntaxKindDeclaration(syntaxKind, name)

    if (prettyTypeString.length > 100000) {
      prettyTypeString = prettyTypeString.substring(0, 10000) + '...'
    }

    const hoverText = new vscode.MarkdownString()
    hoverText.appendCodeblock(`${declaration} ${prettyTypeString}`, document.languageId)
    return new vscode.Hover(hoverText)
  }

  context.subscriptions.push(vscode.languages.registerHoverProvider('typescript', { provideHover }))
  context.subscriptions.push(vscode.languages.registerHoverProvider('typescriptreact', { provideHover }))
}
