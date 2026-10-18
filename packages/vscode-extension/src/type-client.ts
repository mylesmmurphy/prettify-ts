import * as vscode from "vscode";
import type { PrettifyOptions } from "@prettify-ts/core/src/options";
import type { TypeInfo } from "@prettify-ts/core/src/types";
import type { PrettifyRequest } from "@prettify-ts/typescript-plugin/src/request";

/** Where type information comes from. TS Server, through the plugin, is the source for every document. */
export interface TypeSource {
  request(
    document: vscode.TextDocument,
    position: vscode.Position,
    options: PrettifyOptions,
    token?: vscode.CancellationToken,
  ): Promise<TypeInfo | undefined>;
  /** The signature TypeScript's own hover shows at the position, so a separate hover can avoid repeating it. */
  nativeSignature(
    document: vscode.TextDocument,
    position: vscode.Position,
    token?: vscode.CancellationToken,
  ): Promise<string | undefined>;
}

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
  async function quickInfo(
    document: vscode.TextDocument,
    position: vscode.Position,
    token?: vscode.CancellationToken,
  ): Promise<string | undefined> {
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
    quickInfo,
    nativeSignature: quickInfo,
  } satisfies TypeSource & Record<string, unknown>;
}
