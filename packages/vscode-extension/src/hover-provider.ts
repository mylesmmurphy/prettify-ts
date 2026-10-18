import * as vscode from "vscode";
import { isRedundant, renderHoverPreview } from "@prettify-ts/core/src/preview";
import { readSettings, supportedLanguages } from "./configuration";
import type { TypeClient } from "./type-client";

/**
 * Separate hovers: Prettify's preview as a hover of its own. Merged hovers are built by the TypeScript plugin
 * inside TS Server instead, except in Vue files, whose hovers come from Vue's server.
 *
 * VS Code orders hovers by how specifically their providers match the document, then puts built-in providers last.
 * A provider for each language therefore appears above TypeScript's built-in hover; a provider for every language
 * (`*`) matches less specifically and appears below it, which serves the native-first placement.
 */
export function registerHoverProvider(context: vscode.ExtensionContext, client: TypeClient): void {
  function provider(below: boolean): vscode.HoverProvider {
    return {
      async provideHover(document, position, token) {
        if (!supportedLanguages.includes(document.languageId)) return;
        const settings = readSettings(document);
        if (!settings.enabled || token.isCancellationRequested) return;
        if (settings.hoverMode === "merged" && document.languageId !== "vue") return;
        if ((settings.hoverPlacement === "nativeFirst") !== below) return;
        const version = document.version;
        const info = await client.request(document, position, settings.options, token);
        if (!info || token.isCancellationRequested) return;
        if (settings.options.skippedTypeNames.includes(info.name)) return;
        try {
          const preview = renderHoverPreview(info, settings);
          const nativeSignature = await client.nativeSignature(document, position, token);
          if (token.isCancellationRequested || document.version !== version) return;
          // Skip the hover when TypeScript's own hover already shows the same type.
          if (isRedundant(preview, nativeSignature)) return;
          const markdown = new vscode.MarkdownString();
          markdown.appendCodeblock(preview.code, "typescript");
          if (preview.note) markdown.appendText("\n" + preview.note);
          return new vscode.Hover(markdown);
        } catch (error) {
          client.log(error);
          return undefined;
        }
      },
    };
  }
  for (const language of supportedLanguages) {
    context.subscriptions.push(vscode.languages.registerHoverProvider({ language }, provider(false)));
  }
  context.subscriptions.push(vscode.languages.registerHoverProvider("*", provider(true)));
}
