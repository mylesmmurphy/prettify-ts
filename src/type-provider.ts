import * as vscode from 'vscode'

import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'

import { prettifyType } from './prettify-type'
import { EXTENSION_ID } from './consts'

hljs.registerLanguage('typescript', typescript)

export class TypeProvider implements vscode.WebviewViewProvider {
  resolveWebviewView (webviewView: vscode.WebviewView): void {
    const updateWebview = (highlightedCode: string): void => {
      webviewView.webview.html = /* html */ `
        <head>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css">
          <style>
            body, pre {
                font-family: "Monaco", "Consolas", "Droid Sans Mono", "Courier", monospace;
            }
          </style>
        </head>
        <body>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/typescript.min.js"></script>
          <pre>${highlightedCode}</pre>
        </body>
      `
    }

    updateWebview('')

    const updateTypePreview = async (): Promise<void> => {
      if (!webviewView.visible) return

      const editor = vscode.window.activeTextEditor
      if (editor === undefined) return

      const document = editor.document
      const fileName = document.fileName
      const content = document.getText()

      const selection = editor.selection
      const position = selection.active
      const offset = document.offsetAt(position)

      const formattedTypeString = await prettifyType(fileName, content, offset)
      const highlightedCode = hljs.highlight(formattedTypeString ?? '', { language: 'typescript' }).value
      updateWebview(highlightedCode)
    }

    vscode.window.onDidChangeTextEditorSelection(async (e) => {
      await updateTypePreview()
    })

    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration(`${EXTENSION_ID}.viewNestedTypes`)) {
        await updateTypePreview()
      }
    })
  }
}
