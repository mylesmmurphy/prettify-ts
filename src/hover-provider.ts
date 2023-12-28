import * as vscode from 'vscode'
import { prettifyType } from './prettify-type'
import { EXTENSION_ID } from './consts'

export function registerHoverProvider (context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('typescript', {
      async provideHover (document, position, token) {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID)
        const enableHover = config.get('enableHover', true)

        if (!enableHover) return

        const content = document.getText()
        const offset = document.offsetAt(position)

        const formattedTypeString = await prettifyType(document.fileName, content, offset)

        if (formattedTypeString === undefined) {
          return
        }

        const hoverText = new vscode.MarkdownString()
        hoverText.appendCodeblock(formattedTypeString, 'typescript')
        return new vscode.Hover(hoverText)
      }
    })
  )
}
