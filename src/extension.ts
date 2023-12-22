import * as vscode from 'vscode';
import { Project, TypeAliasDeclaration, MappedTypeNode } from 'ts-morph';
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
        let typeName = type.getText();
        const typeSymbol = type.getSymbol();
        // Get what kind of type the type is, ex. 'class', 'interface', 'type alias', etc.
        const declaration = typeSymbol?.getDeclarations()[0];
        const typeKind = declaration?.getKindName();

        // Get the parent of the identifier if the type is a type alias
        if (typeKind !== 'InterfaceDeclaration' && typeKind !== 'ClassDeclaration') {
          node = node.getParent();
          // Check if the parent node is a type alias
          if (node && TypeAliasDeclaration.isTypeAliasDeclaration(node)) {
            typeName = node.getName();
          }
        }

        // Don't show the hover if the type is any or if the type kind is undefined
        if (typeName === 'any' || !typeKind) {
          return;
        }
      
        // Generate a random ID for the Prettify type alias
        const prettifyId = ulid();

        // Add the Prettify type alias
        sourceFile.addTypeAlias({
          name: `Prettify_${prettifyId}`,
          typeParameters: [{ name: 'T' }],
          isExported: false,
          type: `T extends String | Number | Boolean | Date | RegExp | Function | Symbol | undefined | null | void
            ? T
            : T extends Array<infer U>
            ? Prettify<U>[]
            : T extends object
            ? { [P in keyof T]: Prettify<T[P]> } & unknown
            : T;`,
        });
            
        // Add a new type alias that uses Prettify with the type of the node as the generic parameter
        sourceFile.addTypeAlias({
          name: `PrettifiedType_${prettifyId}`,
          isExported: false,
          type: `Prettify_${prettifyId}<${typeName}>`,
        });
      
        // Get the type of the PrettifiedType type alias and get the text of the type node
        const prettifiedType = typeChecker.getTypeAtLocation(sourceFile.getTypeAliasOrThrow(`PrettifiedType_${prettifyId}`).getTypeNodeOrThrow());
        const prettifiedTypeString = prettifiedType.getText().replace(/; /g, ';\n'); // Add linebreaks which will get formatted later

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
        
        // Format the type string using the TypeScript formatter in a temporary file
        const formatFile = project.createSourceFile('temp.ts', declarationString);
        formatFile.formatText();
        const formattedTypeString = formatFile.getFullText();
        
        // Format the hover text with Markdown
        const hoverText = new vscode.MarkdownString();
        // Add a title
        hoverText.appendMarkdown(`**${typeName}**`);
        hoverText.appendCodeblock(formattedTypeString, 'typescript');
        
        return new vscode.Hover(hoverText);
      },
    })
  );
}