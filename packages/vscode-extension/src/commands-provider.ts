import * as vscode from "vscode";
import { toggleEnabled, readSettings } from "./configuration";
import { renderTypeInfo } from "./stringify-type-tree";
import { limitPreview, supportedLanguages } from "./type-client";
import type { TypeClient } from "./type-client";

export function registerCommands(context: vscode.ExtensionContext, client: TypeClient): void {
  async function copyType(full: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !supportedLanguages.includes(editor.document.languageId)) {
      void vscode.window.showInformationMessage("Open a TypeScript, JavaScript, or Vue document to copy its type.");
      return;
    }
    const document = editor.document;
    const position = editor.selection.active;
    const settings = readSettings(document, full);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: full ? "Expanding type" : "Copying type",
        cancellable: true,
      },
      async (_, token) => {
        const info = await client.request(document, position, settings.options, token);
        if (token.isCancellationRequested) return;
        if (!info) {
          void vscode.window.showErrorMessage(
            "No type information found. See the Prettify TS output for request errors.",
          );
          return;
        }
        const rendered = renderTypeInfo(info, settings.indentation);
        const text = full ? rendered : limitPreview(rendered, settings.maxCharacters);
        const truncated = text !== rendered || !!info.truncationReasons?.length;
        await vscode.env.clipboard.writeText(
          text +
            (info.truncationReasons?.length
              ? "\n/* Expansion limited: " + info.truncationReasons.join(", ") + " */"
              : ""),
        );
        void vscode.window.showInformationMessage(
          truncated ? "Type copied with expansion limits." : "Type copied to clipboard",
        );
      },
    );
  }
  for (const [command, full] of [
    ["prettify-ts.copyPrettifiedType", false],
    ["prettify-ts.fullCopyPrettifiedType", true],
  ] as const) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, () =>
        copyType(full).catch((error: unknown) => {
          client.log(error);
          void vscode.window.showErrorMessage("Failed to copy type. See the Prettify TS output for details.");
        }),
      ),
    );
  }
  context.subscriptions.push(vscode.commands.registerCommand("prettify-ts.toggle", toggleEnabled));
}
