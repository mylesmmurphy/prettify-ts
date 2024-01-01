import * as vscode from 'vscode'
import * as ts from 'typescript'
import { prettifyType } from './prettify-type'
import { EXTENSION_ID, MARKDOWN_MAX_LENGTH } from './consts'
import { getProject } from './project-cache'
import { washString } from './helpers'

export function registerHoverProvider (context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('typescript', {
      async provideHover (document, position, token) {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID)
        const enableHover = config.get('enableHover', true)

        if (!enableHover) return

        const content = document.getText()
        const offset = document.offsetAt(position)
        const fileName = document.fileName

        let typeString = await prettifyType(fileName, content, offset)
        if (typeString === undefined) return

        // Ignore hover if the type is already displayed from TS quick info
        if (typeString.startsWith('type') || typeString.startsWith('const')) {
          const project = getProject(fileName)
          const languageService = project.getLanguageService().compilerObject
          const quickInfo = languageService.getQuickInfoAtPosition(fileName, offset)
          const quickInfoText = ts.displayPartsToString(quickInfo?.displayParts)

          if (washString(quickInfoText).includes(washString(typeString))) {
            return
          }
        }

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
