/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type TypeInfo } from '@prettify-ts/typescript-plugin/src/type-tree/types'
import * as vscode from 'vscode'
import { stringifyTypeTree, prettyPrintTypeString, getSyntaxKindDeclaration } from './stringify-type-tree'
import { type PrettifyRequest } from './types'

const MAX_SETTINGS = 999999999999

export function registerCommands (context: vscode.ExtensionContext): void {
  const toggleCommand = vscode.commands.registerCommand('prettify-ts.toggle', async (option?: boolean) => {
    const config = vscode.workspace.getConfiguration('prettify-ts')
    if (option === true || option === false) {
      await config.update('enabled', option, vscode.ConfigurationTarget.Global)
      return
    }

    await config.update('enabled', !config.get('enabled', true), vscode.ConfigurationTarget.Global)
  })

  async function copyType (full = false): Promise<void> {
    const config = vscode.workspace.getConfiguration('prettify-ts')
    const editor = vscode.window.activeTextEditor
    if (!editor) return

    const indentation = config.get('typeIndentation', 4)
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

    if (full) {
      options.maxDepth = MAX_SETTINGS
      options.maxProperties = MAX_SETTINGS
      options.maxSubProperties = MAX_SETTINGS
      options.maxUnionMembers = MAX_SETTINGS
      options.unwrapArrays = true
      options.unwrapFunctions = true
      options.unwrapPromises = true
    }

    const request: PrettifyRequest = {
      meta: 'prettify-type-info-request',
      options
    }

    const cursorPosition = editor.selection.active
    const location = {
      file: editor.document.uri.fsPath,
      line: cursorPosition.line + 1,
      offset: cursorPosition.character + 1
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
    if (!prettifyResponse || !prettifyResponse.typeTree) {
      await vscode.window.showErrorMessage('No type information found at cursor position')
      return
    }

    const { typeTree, syntaxKind, name } = prettifyResponse

    const typeString = stringifyTypeTree(typeTree, false)
    const prettyTypeString = prettyPrintTypeString(typeString, indentation)
    const declaration = getSyntaxKindDeclaration(syntaxKind, name)

    await vscode.env.clipboard.writeText(declaration + prettyTypeString)
    await vscode.window.showInformationMessage('Type copied to clipboard')
  }

  const copyFunction = async () => await copyType().catch(() => vscode.window.showErrorMessage('Failed to copy prettified type'))
  const fullCopyFunction = async () => await copyType(true).catch(() => vscode.window.showErrorMessage('Failed to copy fully prettified type'))

  const copyCommand = vscode.commands.registerCommand('prettify-ts.copyPrettifiedType', copyFunction)
  const fullCopyCommand = vscode.commands.registerCommand('prettify-ts.fullCopyPrettifiedType', fullCopyFunction)

  context.subscriptions.push(toggleCommand)
  context.subscriptions.push(copyCommand)
  context.subscriptions.push(fullCopyCommand)
}
