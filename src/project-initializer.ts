import * as vscode from 'vscode'
import { getProject } from './project-cache'

export function registerProjectInitializer (context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => {
    if (document.languageId === 'typescript') {
      const fileName = document.fileName
      getProject(fileName)
    }
  }))
}
