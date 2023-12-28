import * as vscode from 'vscode'
import { Project, IndentationText, SyntaxKind } from 'ts-morph'
import { ulid } from 'ulid'

import { MARKDOWN_MAX_LENGTH, EXTENSION_ID } from './consts'
import { hasType, buildDeclarationString, getPrettifyType, formatDeclarationString } from './helpers'

export async function prettifyType (fileName: string, content: string, offset: number): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration(EXTENSION_ID)
  const viewNestedTypes = config.get('viewNestedTypes', false)
  const ignoredNestedTypes: string[] = config.get('ignoredNestedTypes', [])

  const project = new Project({ manipulationSettings: { indentationText: IndentationText.TwoSpaces } })
  const sourceFile = project.addSourceFileAtPath(fileName)

  // Use the current document's text as the source file's text, supports unsaved changes
  sourceFile.replaceWithText(content)

  const node = sourceFile.getDescendantAtPos(offset)
  if (node === undefined) return

  const nodeKind = node.getKind()
  if (nodeKind !== SyntaxKind.Identifier) return

  const parentNode = node.getParent()
  if (parentNode === undefined) return

  const parentNodeKind = parentNode.getKind()
  if (!hasType(parentNodeKind)) return

  const nodeText = node.getText()

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
  if (prettifiedTypeString[0] !== '{') return

  const declarationString = buildDeclarationString(parentNodeKind, nodeText, prettifiedTypeString)

  let formattedTypeString = formatDeclarationString(declarationString)
  if (formattedTypeString.length > MARKDOWN_MAX_LENGTH) {
    formattedTypeString = formattedTypeString.substring(0, MARKDOWN_MAX_LENGTH) + '...'
  }

  return formattedTypeString
}
