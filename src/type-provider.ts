import * as vscode from 'vscode'

import { prettifyType } from './prettify-type'
import { EXTENSION_ID } from './consts'

export class TypeProvider implements vscode.WebviewViewProvider {
  private readonly extensionContext: vscode.ExtensionContext

  constructor (context: vscode.ExtensionContext) {
    this.extensionContext = context
  }

  resolveWebviewView (webviewView: vscode.WebviewView): void {
    const prismCssUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionContext.extensionUri, 'src', 'prism', 'prism-vsc-dark-plus.css'))
    const prismJsUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionContext.extensionUri, 'src', 'prism', 'prism.js'))

    const updateWebview = (code: string): void => {
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [this.extensionContext.extensionUri]
      }

      webviewView.webview.html = /* html */ `
        <head>
          <link href="${prismCssUri.toString()}" rel="stylesheet" />
          <style>
            body, pre {
              font-family: "Monaco", "Consolas", "Droid Sans Mono", "Courier", monospace;
            }
            code {
              background: none;
            }
          </style>
        </head>
        <body>
        <pre><code class="language-typescript">${code}</code></pre>
        <script src="${prismJsUri.toString()}"></script>
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

      const formattedTypeString = await prettifyType(fileName, content, offset) ?? ''
      updateWebview(formattedTypeString)
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
