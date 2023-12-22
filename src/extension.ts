import * as vscode from 'vscode';
import { Node, Project } from 'ts-morph';
import { ulid } from 'ulid';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('typescript', {
      provideHover(document, position, token) {
        // Create a new Project instance
        const project = new Project();
        const sourceFile = project.addSourceFileAtPath(document.fileName);
        const offset = document.offsetAt(position);
      
        // Get the node at the offset
        let node = sourceFile.getDescendantAtPos(offset);
        if (!node) {
          return;
        }
        
        // Get the type of the node
        const typeChecker = project.getTypeChecker();
        const type = typeChecker.getTypeAtLocation(node);
      
        // Get the name of the type
        const typeName = type.getText();

        // Don't show the hover if the type is any
        if (typeName === 'any') {
          return;
        }
      
        // Generate a random ID for the Prettify type alias
        const prettifyId = ulid();

        // Add the Prettify type alias
        sourceFile.addTypeAlias({
          name: `Prettify_${prettifyId}`,
          typeParameters: [{ name: 'T' }],
          isExported: false,
          type: `{
            [P in keyof T]: T[P] extends object ? Prettify_${prettifyId}<T[P]> : T[P];
          } & {}`,
        });
            
        // Add a new type alias that uses Prettify with the type of the node as the generic parameter
        sourceFile.addTypeAlias({
          name: `PrettifiedType_${prettifyId}`,
          isExported: false,
          type: `Prettify_${prettifyId}<${typeName}>`,
        });
      
        // Get the type of the PrettifiedType type alias and get the text of the type node
        const prettifiedType = typeChecker.getTypeAtLocation(sourceFile.getTypeAliasOrThrow(`PrettifiedType_${prettifyId}`).getTypeNodeOrThrow());
        let prettifiedTypeString = prettifiedType.getText();
        
        // Manually format the type string
        prettifiedTypeString = prettifiedTypeString.replace(/; /g, ';\n');

        // Get the parent of the node if the node is an identifier
        if (node.getKindName() === 'Identifier') {
          node = node.getParent();
        }

        if (!node) {
          return;
        }

        // Get the name and kind of the node
        const nodeName = Node.isNamed(node) ? node.getName() : '';
        const nodeKind = node.getKindName();

        // Format the declaration string based on the kind of the node
        let declarationString;
        switch (nodeKind) {
          case 'TypeAliasDeclaration':
            declarationString = `type ${nodeName} = ${prettifiedTypeString}`;
            break;
          case 'ClassDeclaration':
            declarationString = `class ${nodeName} ${prettifiedTypeString}`;
            break;
          case 'InterfaceDeclaration':
            declarationString = `interface ${nodeName} ${prettifiedTypeString}`;
            break;
          // Add more cases as needed
          default:
            return;
        }
        
        // Format the type string using the TypeScript formatter in a temporary file
        const formatFile = project.createSourceFile('temp.ts', declarationString);
        formatFile.formatText();
        const formattedTypeString = formatFile.getFullText();
        
        // Format the hover text with Markdown
        const hoverText = new vscode.MarkdownString();
        hoverText.appendCodeblock(formattedTypeString, 'typescript');
        
        return new vscode.Hover(hoverText);
      },
    })
  );
}