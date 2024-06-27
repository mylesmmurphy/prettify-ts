import * as vscode from 'vscode'
import type { PrettifyRequest, TypeInfo } from './types'
import { prettyPrintTypeString, getSyntaxKindDeclaration, stringifyTypeTree, sanitizeString } from './stringify-type-tree'

export function registerHoverProvider (context: vscode.ExtensionContext): void {
  async function provideHover (
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const config = vscode.workspace.getConfiguration('prettify-ts')
    const indentation = config.get('typeIndentation', 4)
    const maxCharacters = config.get('maxCharacters', 20000)

    const options = {
      hidePrivateProperties: config.get('hidePrivateProperties', true),
      maxDepth: config.get('maxDepth', 2),
      maxProperties: config.get('maxProperties', 100),
      maxSubProperties: config.get('maxSubProperties', 5),
      maxUnionMembers: config.get('maxUnionMembers', 15),
      skippedTypeNames: config.get('skippedTypeNames', []),
      unwrapArrays: config.get('unwrapArrays', true),
      unwrapFunctions: config.get('unwrapFunctions', true),
      unwrapPromises: config.get('unwrapPromises', true)
    }

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

    const prettifyResponse: TypeInfo | undefined = response?.body?.__prettifyResponse
    if (!prettifyResponse) return

    const { typeTree, syntaxKind, name } = prettifyResponse

    const typeString = stringifyTypeTree(typeTree, false)
    let prettyTypeString = prettyPrintTypeString(typeString, indentation)
    const declaration = getSyntaxKindDeclaration(syntaxKind, name)

    if (prettyTypeString.length > maxCharacters) {
      prettyTypeString = prettyTypeString.substring(0, maxCharacters) + '...'
    }

    // Ignore hover if the type is already displayed from TS quick info
    if (declaration.startsWith('type') || declaration.startsWith('const') || declaration.startsWith('function')) {
      const quickInfo: any = await vscode.commands.executeCommand('typescript.tsserverRequest', 'quickinfo', location)
      const quickInfoDisplayString: string = quickInfo?.body?.displayString

      const washedQuickInfo = sanitizeString(quickInfoDisplayString)
      const washedType = sanitizeString(typeString.replace(/ } & { /g, ' '))

      if (washedQuickInfo.includes(washedType)) return
    }

    const hoverText = new vscode.MarkdownString()
    hoverText.appendCodeblock(`${declaration}${prettyTypeString}`, document.languageId)
    return new vscode.Hover(hoverText)
  }

  context.subscriptions.push(vscode.languages.registerHoverProvider('typescript', { provideHover }))
  context.subscriptions.push(vscode.languages.registerHoverProvider('typescriptreact', { provideHover }))
}
