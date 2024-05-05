import * as vscode from 'vscode'

import { prettifyType } from '../prettify/prettify-type'
import { EXTENSION_ID, IS_DEV } from '../consts'

export class TypeProvider implements vscode.WebviewViewProvider {
  private readonly extensionContext: vscode.ExtensionContext

  constructor (context: vscode.ExtensionContext) {
    this.extensionContext = context
  }

  private getResourceUri (...pathSegments: string[]): vscode.Uri {
    const base = IS_DEV ? this.extensionContext.extensionUri : vscode.Uri.joinPath(this.extensionContext.extensionUri, 'out')
    return vscode.Uri.joinPath(base, ...pathSegments)
  }

  resolveWebviewView (webviewView: vscode.WebviewView): void {
    const prismCssUri = webviewView.webview.asWebviewUri(this.getResourceUri('src', 'prism', 'prism-vsc-dark-plus.css'))
    const prismJsUri = webviewView.webview.asWebviewUri(this.getResourceUri('src', 'prism', 'prism.js'))

    const updateWebview = (code: string, loading = false): void => {
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
            @keyframes move {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          </style>
        </head>
        <body>
          ${loading
              ? /* html */ `
                <div style="position: relative; height: 2px; overflow: hidden;">
                  <div style="position: absolute; height: 100%; width: 100%; background-color: #007acc; animation: move 2s linear infinite;"></div>
                </div>`
              : code.length > 0
                ? /* html */ `
                  <pre><code class="language-typescript">${code}</code></pre>
                  <script src="${prismJsUri.toString()}"></script>`
                : ''
          }
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

      updateWebview('', true)
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
