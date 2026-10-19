import * as vscode from "vscode";
import type {
  API,
  ExtensionAPI,
  Hover,
  LspMiddlewareContext,
  MarkedString,
  MarkupContent,
  Snapshot,
  TypeScriptSDK,
} from "@prettify-ts/core/src/tsgo/api-types";
import type { PrettifyOptions } from "@prettify-ts/core/src/options";
import type { TypeInfo } from "@prettify-ts/core/src/types";
import { codeBlock, composeMarkdown, SECTION_SEPARATOR, splitNativeMarkdown } from "@prettify-ts/core/src/compose";
import { isRedundant, renderHoverPreview } from "@prettify-ts/core/src/preview";
import { getTypeInfoFromProject } from "@prettify-ts/core/src/tsgo/backend";
import type { Ts7Modules } from "@prettify-ts/core/src/tsgo/backend";
import { readSettings, supportedLanguages } from "./configuration";
import type { TypeSource } from "./type-client";

export const TYPESCRIPT_7_EXTENSION = "TypeScriptTeam.native-preview";

/**
 * Whether VS Code runs TypeScript 7 (and turns TS Server features off), decided as the TypeScript 7 extension
 * decides it (`getUseTsgo` in its util.ts; keep in sync). Only explicitly set values count. Within a key,
 * language-specific values win; between `js/ts.experimental.useTsgo` and the legacy
 * `typescript.experimental.useTsgo`, the value set at the most specific scope wins, and `js/ts` wins at the same
 * scope. An explicit `false` is kept.
 */
export function isTsgoEnabled(): boolean {
  const { ConfigurationTarget } = vscode;
  const explicit = (section: string) => {
    const inspected = vscode.workspace.getConfiguration(section).inspect<boolean>("experimental.useTsgo");
    if (!inspected) return { value: undefined, target: undefined };
    const value = [
      inspected.workspaceFolderLanguageValue,
      inspected.workspaceLanguageValue,
      inspected.globalLanguageValue,
      inspected.workspaceFolderValue,
      inspected.workspaceValue,
      inspected.globalValue,
    ].find((candidate) => candidate !== undefined);
    const target =
      inspected.workspaceFolderValue !== undefined
        ? ConfigurationTarget.WorkspaceFolder
        : inspected.workspaceValue !== undefined
          ? ConfigurationTarget.Workspace
          : inspected.globalValue !== undefined
            ? ConfigurationTarget.Global
            : undefined;
    return { value, target };
  };
  const unified = explicit("js/ts");
  const legacy = explicit("typescript");
  if (unified.value === undefined && legacy.value === undefined) return false;
  const mostSpecific: vscode.ConfigurationTarget = Math.max(
    unified.target ?? ConfigurationTarget.Global,
    legacy.target ?? ConfigurationTarget.Global,
  );
  return (unified.target === mostSpecific ? unified.value : legacy.value) === true;
}

type SnapshotEntry = { snapshot: Snapshot; users: number };

type Connection = {
  modules: Ts7Modules;
  api: API<true>;
  latest?: SnapshotEntry;
};

export type TsgoClient = TypeSource & {
  /** TypeScript 7 serves this document, so requests go through its API instead of TS Server. */
  serves(document: vscode.TextDocument): boolean;
  start(): Promise<void>;
};

/**
 * The TypeScript 7 integration: an API connection to the running language server for type information, and LSP
 * middleware that merges the preview into TypeScript's own hover.
 */
export function createTsgoClient(context: vscode.ExtensionContext, log: (error: unknown) => void): TsgoClient {
  let connection: Promise<Connection | undefined> | undefined;
  let supported: boolean | undefined;
  let warned = false;
  const nativeHovers = createNativeHoverLog();

  async function connect(sdk: TypeScriptSDK): Promise<Connection | undefined> {
    try {
      // The API client must match the server, so it comes from the server's own installation.
      const [pipe, api, ast, scanner] = await Promise.all([
        sdk.initializeAPIConnection(),
        sdk.importModule("typescript/async"),
        sdk.importModule("typescript/ast"),
        sdk.importModule("typescript/ast/scanner"),
      ]);
      return {
        modules: { api, ast, scanner, version: sdk.version },
        api: await api.API.fromLSPConnection({ pipe }),
      };
    } catch (error) {
      log("Prettify TS could not connect to TypeScript 7: " + String(error));
      return undefined;
    }
  }

  /** The language server's current snapshot, reusing unchanged files from the previous one. */
  async function withSnapshot<R>(current: Connection, use: (snapshot: Snapshot) => Promise<R>): Promise<R> {
    const base = current.latest && !current.latest.snapshot.isDisposed() ? current.latest.snapshot : undefined;
    const entry: SnapshotEntry = {
      snapshot: await current.api.getCurrentLanguageServerSnapshot(undefined, base),
      users: 1,
    };
    const previous = current.latest;
    current.latest = entry;
    if (previous && previous.users === 0) void previous.snapshot.dispose();
    try {
      return await use(entry.snapshot);
    } finally {
      entry.users--;
      if (current.latest !== entry && entry.users === 0) void entry.snapshot.dispose();
    }
  }

  async function request(
    document: vscode.TextDocument,
    position: vscode.Position,
    options: PrettifyOptions,
    token?: vscode.CancellationToken,
  ): Promise<TypeInfo | undefined> {
    const current = await connection;
    if (!current || token?.isCancellationRequested) return undefined;
    const version = document.version;
    try {
      const info = await withSnapshot(current, async (snapshot) => {
        const file = { uri: document.uri.toString() };
        const project = await snapshot.getDefaultProjectForFile(file);
        if (!project) return undefined;
        return getTypeInfoFromProject(current.modules, project, file, document.offsetAt(position), options, {
          isCancellationRequested: () => !!token?.isCancellationRequested,
          onError: log,
        });
      });
      return token?.isCancellationRequested || document.version !== version ? undefined : info;
    } catch (error) {
      if (!token?.isCancellationRequested) log(error);
      return undefined;
    }
  }

  /** Merged hovers: add the preview to TypeScript 7's own hover. */
  async function transformHover(
    hover: Hover | null,
    context: LspMiddlewareContext<"textDocument/hover">,
  ): Promise<Hover | null> {
    const { textDocument, position } = context.params;
    const markdown = hover ? hoverMarkdown(hover.contents) : undefined;
    nativeHovers.record(textDocument.uri, position, markdown);
    if (!hover || markdown === undefined) return hover;
    const document = vscode.workspace.textDocuments.find(
      (candidate) => candidate.uri.toString() === vscode.Uri.parse(textDocument.uri).toString(),
    );
    if (!document || !supportedLanguages.includes(document.languageId)) return hover;
    const settings = readSettings(document);
    if (!settings.enabled || settings.hoverMode !== "merged") return hover;
    const info = await request(document, new vscode.Position(position.line, position.character), settings.options);
    if (!info || settings.options.skippedTypeNames.includes(info.name)) return hover;
    const preview = renderHoverPreview(info, settings);
    if (isRedundant(preview, splitNativeMarkdown(markdown).signature)) return hover;
    const contents: MarkupContent = {
      kind: "markdown",
      value: composeMarkdown(markdown, preview, settings.hoverPlacement),
    };
    return { ...hover, contents };
  }

  return {
    serves: (document) => isTsgoEnabled() && document.languageId !== "vue",
    request,
    async nativeSignature(document, position, token) {
      const markdown = await nativeHovers.waitFor(document.uri.toString(), position, token);
      return markdown === undefined ? undefined : splitNativeMarkdown(markdown).signature;
    },
    async start() {
      if (supported !== undefined) return;
      const extension = vscode.extensions.getExtension<Partial<ExtensionAPI>>(TYPESCRIPT_7_EXTENSION);
      if (!extension) return;
      try {
        const exports = extension.isActive ? extension.exports : await extension.activate();
        supported =
          typeof exports?.onLanguageServerInitialized === "function" &&
          typeof exports.registerLspMiddleware === "function";
        if (!supported) {
          const version = (extension.packageJSON as { version?: string }).version ?? "unknown";
          log(
            "The TypeScript 7 extension (" +
              version +
              ") does not provide the API Prettify TS uses. Update it to a release for TypeScript 7.1 or later.",
          );
          if (isTsgoEnabled() && !warned) {
            warned = true;
            void vscode.window.showWarningMessage(
              "Prettify TS needs a newer TypeScript 7 extension to show previews while TypeScript 7 is enabled.",
            );
          }
          return;
        }
        const api = exports as ExtensionAPI;
        context.subscriptions.push(
          // Fires after each language server start; earlier connections must be replaced.
          api.onLanguageServerInitialized((sdk) => {
            const previous = connection;
            connection = connect(sdk);
            void previous?.then((stale) => stale?.api.close());
          }),
          api.registerLspMiddleware("textDocument/hover", transformHover),
          { dispose: () => void connection?.then((current) => current?.api.close()) },
        );
      } catch (error) {
        log(error);
      }
    },
  };
}

/** Markdown of an LSP hover's contents. */
export function hoverMarkdown(contents: MarkupContent | MarkedString | MarkedString[]): string | undefined {
  const marked = (value: MarkedString) => (typeof value === "string" ? value : codeBlock(value.value, value.language));
  if (Array.isArray(contents)) return contents.map(marked).join(SECTION_SEPARATOR);
  if (typeof contents === "object" && "kind" in contents) {
    return contents.kind === "markdown" ? contents.value : codeBlock(contents.value, "");
  }
  return marked(contents);
}

/**
 * TypeScript 7's hover at recent positions, observed through the middleware. A separate Prettify hover runs in
 * parallel with TypeScript's own, so it waits briefly for TypeScript's result before deciding whether to repeat it.
 */
function createNativeHoverLog() {
  const recent = new Map<string, { markdown: string | undefined; time: number }>();
  const waiting = new Map<string, ((markdown: string | undefined) => void)[]>();
  const key = (uri: string, position: { line: number; character: number }) =>
    vscode.Uri.parse(uri).toString() + ":" + position.line + ":" + position.character;
  return {
    record(uri: string, position: { line: number; character: number }, markdown: string | undefined) {
      const id = key(uri, position);
      recent.delete(id);
      recent.set(id, { markdown, time: Date.now() });
      if (recent.size > 20) recent.delete(recent.keys().next().value!);
      for (const finish of waiting.get(id) ?? []) finish(markdown);
    },
    waitFor(uri: string, position: vscode.Position, token?: vscode.CancellationToken): Promise<string | undefined> {
      const id = key(uri, position);
      const entry = recent.get(id);
      if (entry && Date.now() - entry.time < 2000) return Promise.resolve(entry.markdown);
      return new Promise((resolve) => {
        const finish = (markdown: string | undefined) => {
          clearTimeout(timer);
          const list = waiting.get(id)?.filter((waiter) => waiter !== finish);
          if (list?.length) waiting.set(id, list);
          else waiting.delete(id);
          resolve(markdown);
        };
        const timer = setTimeout(() => finish(undefined), 1000);
        waiting.set(id, [...(waiting.get(id) ?? []), finish]);
        token?.onCancellationRequested(() => finish(undefined));
      });
    },
  };
}
