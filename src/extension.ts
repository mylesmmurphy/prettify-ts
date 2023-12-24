import * as vscode from 'vscode'
import { Project } from 'ts-morph'
import { ulid } from 'ulid'
import { format } from 'prettier'

const MAX_LENGTH = 99000
const EXTENSION_NAME = 'prettify-ts'

export function activate (context: vscode.ExtensionContext): void {
  // Get the current configuration
  const config = vscode.workspace.getConfiguration(EXTENSION_NAME)
  let enableHover = config.get('enableHover', true)

  // Register the toggleHover command
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_NAME}.toggleHover`, async () => {
      enableHover = !enableHover
      await config.update('enableHover', enableHover, vscode.ConfigurationTarget.Global)
    })
  )

  // Register the hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('typescript', {
      async provideHover (document, position, token) {
        // Return early if the hover is disabled
        if (!enableHover) {
          return
        }

        // Create a new Project and type checker instance
        const project = new Project()
        const typeChecker = project.getTypeChecker()

        // Add the file to the project
        const sourceFile = project.addSourceFileAtPath(document.fileName)

        // Use the current document's text as the source file's text
        const content = document.getText()
        sourceFile.replaceWithText(content)

        // Get the offset of the position
        const offset = document.offsetAt(position)

        // Get the node at the offset
        const node = sourceFile.getDescendantAtPos(offset)
        if (node === undefined) {
          return
        }

        // Get the type of the node
        const type = typeChecker.getTypeAtLocation(node)
        const typeFullName = type.getText()
        const typeSymbol = type.getSymbol() ?? type.getAliasSymbol()

        if (typeSymbol === undefined) {
          return
        }

        // Get what kind of type the type is, ex. 'class', 'interface', 'type alias', etc.
        const typeDeclaration = typeSymbol.getDeclarations()[0]
        const typeKind = typeDeclaration.getKindName()

        const parentNode = node.getParent()
        const parentNodeText = parentNode?.getText() ?? ''

        // Get the name of the type without the namespace
        let typeName = typeFullName.split('.').pop()

        // Check if the node is a property signature or assignment
        // If it is, then get the name of the property
        const nodeSymbol = node.getSymbol()
        const nodeKind = nodeSymbol?.getDeclarations()[0]?.getKindName()

        if (nodeSymbol !== undefined && (nodeKind === 'PropertySignature' || nodeKind === 'PropertyAssignment')) {
          typeName = nodeSymbol.getName()
        }

        // Generate a random ID for the Prettify type alias
        const prettifyId = ulid()

        // Add the Prettify type alias
        sourceFile.addTypeAlias({
          name: `Prettify_${prettifyId}`,
          typeParameters: [{ name: 'T' }],
          isExported: false,
          type: `T extends String | Number | Boolean | Date | RegExp | Function | Symbol
            ? T
            : T extends Array<infer U>
            ? Prettify_${prettifyId}<U>[]
            : T extends object
            ? { [P in keyof T]: Prettify_${prettifyId}<T[P]> } & unknown
            : T;`
        })

        // Add a new type alias that uses Prettify with the type of the node as the generic parameter
        sourceFile.addTypeAlias({
          name: `PrettifiedType_${prettifyId}`,
          isExported: false,
          type: `Prettify_${prettifyId}<${typeFullName}>`
        })

        // Get the type of the PrettifiedType type alias and get the text of the new type node
        const prettiefiedTypeAlias = sourceFile.getTypeAliasOrThrow(`PrettifiedType_${prettifyId}`)
        const prettifiedTypeNode = prettiefiedTypeAlias.getTypeNodeOrThrow()
        const prettifiedType = typeChecker.getTypeAtLocation(prettifiedTypeNode)

        let prettifiedTypeString = prettifiedType.getText()

        // If the prettified type is a union, then get the union types and join them with a pipe
        if (prettifiedType.isUnion()) {
          const unionTypes = prettifiedType.getUnionTypes()
          const unionTypeNames = unionTypes.map(unionType => unionType.getText())
          prettifiedTypeString = unionTypeNames.join(' | ')
        }

        // Replace all whitespace with newlines which will be used for formatting
        prettifiedTypeString = prettifiedTypeString.replace(/\s+/g, '\n')

        // If the prettified type isn't an object, then return early
        if (prettifiedTypeString[0] !== '{') {
          return
        }

        // Format the declaration string based on the kind of type
        let declarationString
        switch (typeKind) {
          case 'FunctionDeclaration':
            return
          case 'ClassDeclaration':
            declarationString = `class ${typeName} ${prettifiedTypeString}`
            break
          case 'InterfaceDeclaration':
            declarationString = `interface ${typeName} ${prettifiedTypeString}`
            break
          default:
            declarationString = `type ${typeName} = ${prettifiedTypeString}`
            break
        }

        let formattedTypeString = await format(declarationString, { parser: 'typescript' })

        // Anonymous function that removes all whitespace and semicolons
        const washTypeString = (str: string): string => str.replace(/\s+/g, '').replace(/;/g, '')

        // Check formattedTypeString with parentNodeText
        // if they're the same with the exception of whitespace and semicolons, then return early
        // this prevents the hover from displaying the same information as it would without the extension
        if (declarationString.startsWith('type') && washTypeString(formattedTypeString) === washTypeString(parentNodeText)) {
          return
        }

        if (formattedTypeString.length > MAX_LENGTH) {
          formattedTypeString = formattedTypeString.substring(0, MAX_LENGTH) + '...'
        }

        // Format the hover text with Markdown
        const hoverText = new vscode.MarkdownString()
        hoverText.appendMarkdown(`\`${typeName}\` - *${EXTENSION_NAME}*`)
        hoverText.appendCodeblock(formattedTypeString, 'typescript')

        return new vscode.Hover(hoverText)
      }
    })
  )
}
