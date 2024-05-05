import * as vscode from 'vscode'
import { SyntaxKind } from 'ts-morph'
import { ulid } from 'ulid'

import { EXTENSION_ID } from '../consts'
import { buildDeclarationString, getPrettifyType, formatDeclarationString } from './prettify-functions'
import { getProject } from '../project-cache'

export async function prettifyType (fileName: string, content: string, offset: number): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration(EXTENSION_ID)
  const viewNestedTypes = config.get('viewNestedTypes', false)
  const typeIndentation: number = config.get('typeIndentation', 4)

  const { project, ignoredTypes } = getProject(fileName)

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

  const nodeText = node.getText()

  const typeChecker = project.getTypeChecker()
  const type = typeChecker.getTypeAtLocation(node)

  const fullTypeText = type.getText()

  if (fullTypeText === 'any') return

  // Issue: Remove typeof prefix from type text?
  const typeText = fullTypeText.replace(/^typeof /, '')

  const prettifyId = ulid()

  sourceFile.addTypeAlias({
    name: `Prettify_${prettifyId}`,
    typeParameters: [{ name: 'T' }],
    isExported: false,
    type: getPrettifyType(prettifyId, viewNestedTypes, ignoredTypes)
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

  // Issue: Prettify doesn't always work for functions or complex types
  if (prettifiedTypeString === 'any') return

  const declarationString = buildDeclarationString(parentNodeKind, nodeText, prettifiedTypeString)
  const typeString = formatDeclarationString(declarationString, typeIndentation)

  return typeString
}
