import * as vscode from 'vscode'
import type { PrettifyRequest, TypeInfo } from './types'
import { prettyPrintTypeString, getSyntaxKindDeclaration, stringifyTypeTree } from './stringify-type-tree'

export function registerHoverProvider (context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): void {
  async function provideHover (
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    outputChannel.appendLine(`hoverProvider: ${document.uri.fsPath} ${position.line + 1}:${position.character + 1}`)

    const config = vscode.workspace.getConfiguration('prettify-ts')
    const indentation = config.get('typeIndentation', 4)
    const maxCharacters = config.get('maxCharacters', 20000)

    const options = {
      maxDepth: config.get('maxDepth', 2),
      maxProperties: config.get('maxProperties', 100),
      maxSubProperties: config.get('maxSubProperties', 5),
      unwrapFunctions: config.get('unwrapFunctions', true),
      unwrapArrays: config.get('unwrapArrays', true),
      unwrapPromises: config.get('unwrapPromises', true),
      skippedTypeNames: config.get('skippedTypeNames', [])
    }

    outputChannel.appendLine(`options: ${JSON.stringify(options)}`)

    const request: PrettifyRequest = {
      meta: 'prettify-type-info-request',
      options
    }

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

    outputChannel.appendLine(`response: ${JSON.stringify(response)}`)

    const prettifyResponse: TypeInfo | undefined = response?.body?.__prettifyResponse
    if (!prettifyResponse) return

    const { typeTree, syntaxKind, name } = prettifyResponse

    const typeString = stringifyTypeTree(typeTree)
    let prettyTypeString = prettyPrintTypeString(typeString, indentation)
    const declaration = getSyntaxKindDeclaration(syntaxKind, name)

    if (prettyTypeString.length > maxCharacters) {
      prettyTypeString = prettyTypeString.substring(0, maxCharacters) + '...'
    }

    const hoverText = new vscode.MarkdownString()
    hoverText.appendCodeblock(`${declaration} ${prettyTypeString}`, document.languageId)
    return new vscode.Hover(hoverText)
  }

  context.subscriptions.push(vscode.languages.registerHoverProvider('typescript', { provideHover }))
  context.subscriptions.push(vscode.languages.registerHoverProvider('typescriptreact', { provideHover }))
}
