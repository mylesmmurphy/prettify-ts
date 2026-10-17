import * as vscode from "vscode";
import { hoverMarkers, renderTypeParts, sanitizeString } from "./stringify-type-tree";
import { readSettings } from "./configuration";
import { limitPreview, reportedLimits, supportedLanguages } from "./type-client";
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
      const parts = renderTypeParts(info, settings.indentation);
      const declaration = parts.declaration;
      const type = hoverMarkers(parts.type);
      const text = declaration + type;
      const limits = reportedLimits(info);
      const quickInfo = await client.quickInfo(document, position, token);
      if (token.isCancellationRequested || document.version !== version) return;
      // Skip the hover when TypeScript's own hover already shows the same type.
      if (
        quickInfo &&
        !limits.length &&
        /^(?:type|const|let|var|function)\b/.test(declaration) &&
        sanitizeString(quickInfo).includes(sanitizeString(type))
      )
        return;
      const markdown = new vscode.MarkdownString();
      markdown.appendCodeblock(limitPreview(text, settings.maxCharacters), "typescript");
      if (limits.length) markdown.appendText("\nExpansion limited: " + limits.join(", ") + ".");
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
