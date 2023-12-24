import * as vscode from 'vscode';
import { Project, TypeAliasDeclaration } from 'ts-morph';
import { ulid } from 'ulid';
import { format } from 'prettier';

const EXTENSION_NAME = 'prettify-ts';

export function activate(context: vscode.ExtensionContext) {
  // Get the current configuration
  const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
  let enableHover = config.get('enableHover', true);

  // Register the toggleHover command
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_NAME}.toggleHover`, async () => {
      enableHover = !enableHover;
      await config.update('enableHover', enableHover, vscode.ConfigurationTarget.Global);
    })
  );

  // Check if enableHover is changed
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${EXTENSION_NAME}.enableHover`)) {
        enableHover = config.get('enableHover', true);
      }
    })
  );

  // Register the hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('typescript', {
      async provideHover(document, position, token) {
        // Return early if the hover is disabled
        if (!enableHover) {
          return;
        }

        // Create a new Project and type checker instance
        const project = new Project();
        const typeChecker = project.getTypeChecker();

        // Add the file to the project
        const sourceFile = project.addSourceFileAtPath(document.fileName);

        // Use the current document's text as the source file's text
        const content = document.getText();
        sourceFile.replaceWithText(content);

        // Get the offset of the position
        const offset = document.offsetAt(position);
      
        // Get the node at the offset
        const node = sourceFile.getDescendantAtPos(offset);
        if (!node) {
          return;
        }
        
        // Get the type of the node
        const type = typeChecker.getTypeAtLocation(node);
        const typeFullName = type.getText();
        const typeSymbol = type.getSymbol();

        if (!typeSymbol) {
          return;
        }

        // Get the name of the type
        let typeName = typeSymbol.getEscapedName();

        // Get what kind of type the type is, ex. 'class', 'interface', 'type alias', etc.
        const declaration = typeSymbol?.getDeclarations()[0];
        const typeKind = declaration?.getKindName();

        const parentNode = node.getParent();
        const parentNodeText = parentNode?.getText();

        // Check if the parent node is a type alias
        if (parentNode && TypeAliasDeclaration.isTypeAliasDeclaration(parentNode)) {
          typeName = parentNode.getName();
        }

        // Don't show the hover if the type is any or if the type kind is undefined
        if (typeName === 'any' || !typeKind || !typeName) {
          return;
        }
      
        // Generate a random ID for the Prettify type alias
        const prettifyId = ulid();

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
            : T;`,
        });

        // Add a new type alias that uses Prettify with the type of the node as the generic parameter
        sourceFile.addTypeAlias({
          name: `PrettifiedType_${prettifyId}`,
          isExported: false,
          type: `Prettify_${prettifyId}<${typeFullName}>`,
        });
      
        // Get the type of the PrettifiedType type alias and get the text of the new type node
        const prettifiedType = typeChecker.getTypeAtLocation(sourceFile.getTypeAliasOrThrow(`PrettifiedType_${prettifyId}`).getTypeNodeOrThrow());
        const prettifiedTypeString = prettifiedType.getText().replace(/\s+/g, '\n'); // Replace all whitespace with newlines which will be used for formatting

        // If the prettified type isn't an object, then return early
        if (prettifiedTypeString[0] !== '{') {
          return;
        }

        // Format the declaration string based on the kind of type
        let declarationString;
        switch (typeKind) {
          case 'FunctionDeclaration':
            return;
          case 'ClassDeclaration':
            declarationString = `class ${typeName} ${prettifiedTypeString}`;
            break;
          case 'InterfaceDeclaration':
            declarationString = `interface ${typeName} ${prettifiedTypeString}`;
            break;
          default:
            declarationString = `type ${typeName} = ${prettifiedTypeString}`;
            break;
        }
        
        const formattedTypeString = await format(declarationString, { parser: 'typescript' });

        // Check formattedTypeString with parentNodeText
        // if they're the same with the exception of whitespace and semicolons, then return early
        if (formattedTypeString.replace(/\s+/g, '').replace(/;/g, '') === parentNodeText?.replace(/\s+/g, '').replace(/;/g, '')) {
          return;
        }

        // Format the hover text with Markdown
        const hoverText = new vscode.MarkdownString();
        hoverText.appendCodeblock(formattedTypeString, 'typescript');
        
        return new vscode.Hover(hoverText);
      },
    })
  );
}