"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const ts_morph_1 = require("ts-morph");
const ulid_1 = require("ulid");
function activate(context) {
    context.subscriptions.push(vscode.languages.registerHoverProvider('typescript', {
        provideHover(document, position, token) {
            // Create a new Project instance
            const project = new ts_morph_1.Project();
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
            const prettifyId = (0, ulid_1.ulid)();
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
            const nodeName = ts_morph_1.Node.isNamed(node) ? node.getName() : '';
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
    }));
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map