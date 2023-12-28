import * as vscode from 'vscode'

import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'

import { prettifyType } from './prettify-type'

hljs.registerLanguage('typescript', typescript)

export class TypeProvider implements vscode.WebviewViewProvider {
  private readonly extensionContext: vscode.ExtensionContext
  private highlightedCode: string = ''

  constructor (context: vscode.ExtensionContext) {
    this.extensionContext = context
  }

  resolveWebviewView (webviewView: vscode.WebviewView): void {
    const updateWebview = (): void => {
      webviewView.webview.html = /* html */ `
        <head>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css">
        </head>
        <body>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/typescript.min.js"></script>
          <pre>${this.highlightedCode}</pre>
        </body>
      `
    }

    updateWebview()

    vscode.window.onDidChangeTextEditorSelection(async (e) => {
      const editor = vscode.window.activeTextEditor
      if (editor === undefined) return

      const document = editor.document
      const fileName = document.fileName
      const content = document.getText()

      const position = e.selections[0].active
      const adjustedPosition = position.with(position.line, position.character + 1)
      const offset = document.offsetAt(adjustedPosition)

      const formattedTypeString = await prettifyType(fileName, content, offset)
      this.highlightedCode = hljs.highlight(formattedTypeString ?? '', { language: 'typescript' }).value
      updateWebview()
    })
  }
}
