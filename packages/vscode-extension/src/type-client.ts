import * as vscode from "vscode";
import type { PrettifyOptions, PrettifyRequest } from "@prettify-ts/typescript-plugin/src/request";
import type { TypeInfo } from "@prettify-ts/typescript-plugin/src/type-tree/types";

export const supportedLanguages = ["typescript", "typescriptreact", "javascript", "javascriptreact", "vue"];
export type TypeClient = ReturnType<typeof createTypeClient>;

export function createTypeClient(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Prettify TS");
  context.subscriptions.push(output);
  function log(error: unknown) {
    output.appendLine(String(error));
  }
  function location(document: vscode.TextDocument, position: vscode.Position) {
    return { file: document.uri, line: position.line + 1, offset: position.character + 1 };
  }
  return {
    log,
    async request(
      document: vscode.TextDocument,
      position: vscode.Position,
      options: PrettifyOptions,
      token?: vscode.CancellationToken,
    ): Promise<TypeInfo | undefined> {
      if (token?.isCancellationRequested) return;
      const version = document.version;
      const request: PrettifyRequest = { meta: "prettify-type-info-request", options };
      try {
        const response = await vscode.commands.executeCommand<{ body?: { __prettifyResponse?: TypeInfo } }>(
          "typescript.tsserverRequest",
          "completionInfo",
          { ...location(document, position), triggerCharacter: request },
          { executionTarget: 0 }, // Semantic server: the syntax server can omit project type semantics.
          token,
        );
        if (token?.isCancellationRequested || document.version !== version) return;
        const info = response?.body?.__prettifyResponse;
        if (info && typeof info.declaration === "string" && typeof info.name === "string" && info.typeTree) return info;
      } catch (error) {
        if (!token?.isCancellationRequested) log(error);
      }
      return undefined;
    },
    async quickInfo(document: vscode.TextDocument, position: vscode.Position, token?: vscode.CancellationToken) {
      if (token?.isCancellationRequested) return undefined;
      try {
        const response = await vscode.commands.executeCommand<{ body?: { displayString?: string } }>(
          "typescript.tsserverRequest",
          "quickinfo",
          location(document, position),
          { executionTarget: 0 }, // Semantic server: the syntax server can omit project type semantics.
          token,
        );
        return response?.body?.displayString;
      } catch (error) {
        if (!token?.isCancellationRequested) log(error);
        return undefined;
      }
    },
  };
}

// Configured presentation limits are already marked inline (`/* ... N more */`, named references at Max Depth).
const inlineLimits = new Set([
  "object depth limit",
  "property limit",
  "union member limit",
  "function signature limit",
  "circular reference",
]);

/** Limits that output does not show inline, such as safety budgets and compiler truncation. */
export function reportedLimits(info: TypeInfo): string[] {
  return (info.truncationReasons ?? []).filter((reason) => !inlineLimits.has(reason));
}

export function limitPreview(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) + "..." : text;
}
