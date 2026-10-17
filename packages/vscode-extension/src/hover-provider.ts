import * as vscode from "vscode";
import { renderTypeInfo, sanitizeString } from "./stringify-type-tree";
import { readSettings } from "./configuration";
import { limitPreview, supportedLanguages } from "./type-client";
import type { TypeClient } from "./type-client";

export function registerHoverProvider(context: vscode.ExtensionContext, client: TypeClient): void {
  async function provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    const settings = readSettings(document);
    if (!settings.enabled || token.isCancellationRequested) return;
    const version = document.version;
    const info = await client.request(document, position, settings.options, token);
    if (!info || token.isCancellationRequested) return;
    if (settings.options.skippedTypeNames.includes(info.name)) return;
    try {
      const text = renderTypeInfo(info, settings.indentation);
      const quickInfo = await client.quickInfo(document, position, token);
      if (token.isCancellationRequested || document.version !== version) return;
      if (quickInfo && !info.truncationReasons?.length && sanitizeString(quickInfo) === sanitizeString(text)) return;
      const markdown = new vscode.MarkdownString();
      markdown.appendCodeblock(limitPreview(text, settings.maxCharacters), "typescript");
      if (info.truncationReasons?.length)
        markdown.appendText("\nExpansion limited: " + info.truncationReasons.join(", ") + ".");
      return new vscode.Hover(markdown);
    } catch (error) {
      client.log(error);
      return undefined;
    }
  }
  for (const language of supportedLanguages) {
    context.subscriptions.push(vscode.languages.registerHoverProvider({ language }, { provideHover }));
  }
}
