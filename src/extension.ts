import * as vscode from 'vscode'
import { Project, IndentationText, SyntaxKind } from 'ts-morph'
import { ulid } from 'ulid'

import { MARKDOWN_MAX_LENGTH, EXTENSION_ID, DEFAULT_IGNORED_TYPES } from './consts'
import { hasType, buildDeclarationString, getPrettifyType, formatDeclarationString, washString } from './helpers'

export function activate (context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration(EXTENSION_ID)
  let enableHover = config.get('enableHover', true)
  let viewNestedTypes = config.get('viewNestedTypes', false)
  let ignoredNestedTypes: string[] = config.get('ignoredNestedTypes', [])

  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.toggleHover`, async (option?: boolean) => {
      if (option === true || option === false) {
        await config.update('enableHover', option, vscode.ConfigurationTarget.Global)
        return
      }

      await config.update('enableHover', !enableHover, vscode.ConfigurationTarget.Global)
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.toggleViewNestedTypes`, async (option?: boolean) => {
      if (option === true || option === false) {
        await config.update('viewNestedTypes', option, vscode.ConfigurationTarget.Global)
        return
      }

      await config.update('viewNestedTypes', !viewNestedTypes, vscode.ConfigurationTarget.Global)
    })
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(`${EXTENSION_ID}.enableHover`)) {
        enableHover = vscode.workspace.getConfiguration(EXTENSION_ID).get('enableHover', true)
      }

      if (event.affectsConfiguration(`${EXTENSION_ID}.viewNestedTypes`)) {
        viewNestedTypes = vscode.workspace.getConfiguration(EXTENSION_ID).get('viewNestedTypes', false)
      }

      if (event.affectsConfiguration(`${EXTENSION_ID}.ignoredNestedTypes`)) {
        ignoredNestedTypes = vscode.workspace.getConfiguration(EXTENSION_ID).get('ignoredNestedTypes', DEFAULT_IGNORED_TYPES)
      }
    })
  )

  // Register the hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('typescript', {
      async provideHover (document, position, token) {
        const project = new Project({ manipulationSettings: { indentationText: IndentationText.TwoSpaces } })
        const sourceFile = project.addSourceFileAtPath(document.fileName)

        // Use the current document's text as the source file's text, supports unsaved changes
        const content = document.getText()
        sourceFile.replaceWithText(content)
        const offset = document.offsetAt(position)

        const node = sourceFile.getDescendantAtPos(offset)
        if (node === undefined) return

        const nodeKind = node.getKind()
        if (nodeKind !== SyntaxKind.Identifier) return

        const parentNode = node.getParent()
        if (parentNode === undefined) return

        const parentNodeKind = parentNode.getKind()
        if (!hasType(parentNodeKind)) return

        const nodeText = node.getText()
        const parentNodeText = parentNode.getText()

        const hoverText = new vscode.MarkdownString()
        hoverText.isTrusted = true

        if (!enableHover) {
          hoverText.appendMarkdown(`*Prettify \\([Show](command:${EXTENSION_ID}.toggleHover?${encodeURIComponent(JSON.stringify([true]))})\\)*`)
          return new vscode.Hover(hoverText)
        }

        hoverText.appendMarkdown(`*Prettify \\([Hide](command:${EXTENSION_ID}.toggleHover?${encodeURIComponent(JSON.stringify([false]))})\\) |* `)
        if (viewNestedTypes) {
          hoverText.appendMarkdown(`*[Hide Nested](command:${EXTENSION_ID}.toggleViewNestedTypes?${encodeURIComponent(JSON.stringify([false]))})*`)
        } else {
          hoverText.appendMarkdown(`*[View Nested](command:${EXTENSION_ID}.toggleViewNestedTypes?${encodeURIComponent(JSON.stringify([true]))})*`)
        }

        const typeChecker = project.getTypeChecker()
        const type = typeChecker.getTypeAtLocation(node)

        const fullTypeText = type.getText()
        const typeText = fullTypeText.replace(/^typeof /, '')

        const prettifyId = ulid()

        sourceFile.addTypeAlias({
          name: `Prettify_${prettifyId}`,
          typeParameters: [{ name: 'T' }],
          isExported: false,
          type: getPrettifyType(prettifyId, viewNestedTypes, ignoredNestedTypes)
        })

        sourceFile.addTypeAlias({
          name: `PrettifiedType_${prettifyId}`,
          isExported: false,
          type: `Prettify_${prettifyId}<${typeText}>`
        })

        const prettifiedTypeAlias = sourceFile.getTypeAliasOrThrow(`PrettifiedType_${prettifyId}`).getTypeNodeOrThrow()
        const prettifiedType = typeChecker.getTypeAtLocation(prettifiedTypeAlias)

        let prettifiedTypeString = prettifiedType.getText()

        if (prettifiedType.isUnion()) {
          const unionTypes = prettifiedType.getUnionTypes()
          const unionTypeNames = unionTypes.map(unionType => unionType.getText())
          prettifiedTypeString = unionTypeNames.join(' | ')
        }

        // Issue: Remove import statements from the prettified type string
        prettifiedTypeString = prettifiedTypeString.replace(/import\(.*?\)\./g, '')

        // If the prettified type isn't an object, then return early
        if (prettifiedTypeString[0] !== '{') return new vscode.Hover(hoverText)

        const declarationString = buildDeclarationString(parentNodeKind, nodeText, prettifiedTypeString)

        if (parentNodeText.startsWith('type') && washString(parentNodeText) === washString(declarationString)) {
          return new vscode.Hover(hoverText)
        }

        let formattedTypeString = formatDeclarationString(declarationString)
        if (formattedTypeString.length > MARKDOWN_MAX_LENGTH) {
          formattedTypeString = formattedTypeString.substring(0, MARKDOWN_MAX_LENGTH) + '...'
        }

        hoverText.appendCodeblock(formattedTypeString, 'typescript')
        return new vscode.Hover(hoverText)
      }
    })
  )
}
