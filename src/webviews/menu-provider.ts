import * as vscode from 'vscode'
import { EXTENSION_ID } from '../consts'
import { buttonCss } from './button-css'

export class MenuProvider implements vscode.WebviewViewProvider {
  private readonly extensionContext: vscode.ExtensionContext
  private enableHover: boolean
  private viewNestedTypes: boolean

  constructor (context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration(EXTENSION_ID)
    this.enableHover = config.get('enableHover', true)
    this.viewNestedTypes = config.get('viewNestedTypes', true)
    this.extensionContext = context
  }

  public resolveWebviewView (webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionContext.extensionUri]
    }

    const updateWebview = (): void => {
      webviewView.webview.html = /* html */ `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          ${buttonCss}
        </head>
        <body>
          <div class="button-container">
            <button class="vscode-button" onclick="handleEnableHoverClicked()">${this.enableHover ? 'Disable' : 'Enable'} Hover Type Preview</button>
            <button class="vscode-button" onclick="handleViewNestedTypesClicked()">${this.viewNestedTypes ? 'Hide' : 'Show'} Nested Types</button>
          </div>
          <script>
            const vscode = acquireVsCodeApi();
            function handleEnableHoverClicked() { vscode.postMessage({ command: 'enableHoverClicked' }); }
            function handleViewNestedTypesClicked() { vscode.postMessage({ command: 'viewNestedTypesClicked' }); }
          </script>
        </body>
        </html>`
    }

    updateWebview() // Initial render

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${EXTENSION_ID}.enableHover`) || event.affectsConfiguration(`${EXTENSION_ID}.viewNestedTypes`)) {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID)
        this.enableHover = config.get('enableHover', true)
        this.viewNestedTypes = config.get('viewNestedTypes', true)
        updateWebview()
      }
    })

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'enableHoverClicked':
          return await vscode.commands.executeCommand(`${EXTENSION_ID}.toggleHover`)
        case 'viewNestedTypesClicked':
          return await vscode.commands.executeCommand(`${EXTENSION_ID}.toggleViewNestedTypes`)
      }
    })
  }
}
