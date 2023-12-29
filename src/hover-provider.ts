import * as vscode from 'vscode'
import { prettifyType } from './prettify-type'
import { EXTENSION_ID, MARKDOWN_MAX_LENGTH } from './consts'

export function registerHoverProvider (context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('typescript', {
      async provideHover (document, position, token) {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID)
        const enableHover = config.get('enableHover', true)

        if (!enableHover) return

        const content = document.getText()
        const offset = document.offsetAt(position)

        let typeString = await prettifyType(document.fileName, content, offset)

        if (typeString === undefined) return

        if (typeString.length > MARKDOWN_MAX_LENGTH) {
          typeString = typeString.substring(0, MARKDOWN_MAX_LENGTH) + '...'
        }

        const hoverText = new vscode.MarkdownString()
        hoverText.appendCodeblock(typeString, 'typescript')
        return new vscode.Hover(hoverText)
      }
    })
  )
}
