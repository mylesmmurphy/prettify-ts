// The TypeScript 7 editor integration against a real TypeScript 7 server, with VS Code and its extension mocked.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { pathToFileURL } = require("node:url");

// PRETTIFY_TEST_TS7_PATH selects another TypeScript 7 installation, such as the latest nightly.
const ts7Root =
  process.env.PRETTIFY_TEST_TS7_PATH ||
  path.dirname(require.resolve("typescript-7/package.json", { paths: [path.join(__dirname, "../../packages/core")] }));
let values,
  tsgoSettings,
  providers,
  commands,
  middleware,
  initialized,
  warnings,
  errors,
  clipboard,
  extension,
  documents;
const token = { isCancellationRequested: false, onCancellationRequested() {} };
const mock = {
  ProgressLocation: { Notification: 15 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  workspace: {
    get textDocuments() {
      return documents;
    },
    getConfiguration(section) {
      return {
        get(key, fallback) {
          if (section !== "prettify-ts") return fallback;
          return values[key] ?? fallback;
        },
        // useTsgo is read as the TypeScript 7 extension reads it: explicit values by scope.
        inspect: (key) => (key === "experimental.useTsgo" ? (tsgoSettings[section] ?? {}) : {}),
      };
    },
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
  extensions: { getExtension: (id) => (id === "TypeScriptTeam.native-preview" ? extension : undefined) },
  commands: {
    async executeCommand() {
      throw new Error("TS Server is not running while TypeScript 7 is enabled");
    },
    registerCommand(name, callback) {
      commands.set(name, callback);
      return { dispose() {} };
    },
  },
  languages: {
    registerHoverProvider(selector, provider) {
      providers.set(typeof selector === "string" ? selector : selector.language, provider);
      return { dispose() {} };
    },
  },
  window: {
    activeTextEditor: undefined,
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    async showInformationMessage() {},
    async showErrorMessage(message) {
      errors.push(message);
    },
    async showWarningMessage(message) {
      warnings.push(message);
    },
    async withProgress(options, callback) {
      return callback({}, token);
    },
  },
  env: { clipboard: { writeText: async (text) => void (clipboard = text) } },
  Uri: { parse: (value) => ({ toString: () => value }) },
  Position: class {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  MarkdownString: class {
    value = "";
    appendCodeblock(text) {
      this.value += text;
    }
    appendText(text) {
      this.value += text;
    }
  },
  Hover: class {
    constructor(contents) {
      this.contents = contents;
    }
  },
};
const original = Module._load;
Module._load = function (name, ...args) {
  return name === "vscode" ? mock : original.call(this, name, ...args);
};
const api = require("../out-unit/editor-entry");
Module._load = original;

let directory, server, snapshot, document, connect, current, serverListener;
const source =
  "/** The probe. */\nconst probe: Probe = { nested: { value: '' } };\ntype Probe = { nested: { value: string } };\n";

before(async () => {
  const load = (relative) => import(pathToFileURL(path.join(ts7Root, relative)).href);
  const asyncApi = await load("dist/api/async/api.js");
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "prettify-ts7-editor-"));
  fs.writeFileSync(path.join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
  const file = path.join(directory, "index.ts");
  fs.writeFileSync(file, source);
  server = new asyncApi.API({ cwd: directory });
  snapshot = await server.createSnapshot({ openProjects: [path.join(directory, "tsconfig.json")], openFiles: [file] });
  const uri = pathToFileURL(file).href;
  document = {
    uri: { toString: () => uri },
    version: 1,
    languageId: "typescript",
    offsetAt: (position) =>
      source
        .split("\n")
        .slice(0, position.line)
        .reduce((sum, line) => sum + line.length + 1, 0) + position.character,
  };
  connect = (options = {}) => {
    const connection = { closed: 0, snapshots: 0 };
    // The language server's snapshots come from the real server; the extension never disposes these.
    const lspApi = {
      async getCurrentLanguageServerSnapshot() {
        connection.snapshots++;
        await options.onSnapshot?.();
        return {
          getDefaultProjectForFile: (identifier) => snapshot.getDefaultProjectForFile(identifier),
          isDisposed: () => false,
          dispose: async () => {},
        };
      },
      close: async () => void connection.closed++,
    };
    connection.sdk = {
      version: "7.1.0-test",
      initializeAPIConnection: async () => {
        if (options.unavailable) throw new Error("API session unavailable");
        return "test-pipe";
      },
      async importModule(exportPath) {
        const module = await load(
          {
            "typescript/async": "dist/api/async/api.js",
            "typescript/ast": "dist/ast/index.js",
            "typescript/ast/scanner": "dist/ast/scanner.js",
          }[exportPath],
        );
        return exportPath === "typescript/async"
          ? { ...module, API: { fromLSPConnection: async ({ pipe }) => (assert.equal(pipe, "test-pipe"), lspApi) } }
          : module;
      },
    };
    return connection;
  };
});

after(async () => {
  await snapshot?.dispose();
  await server?.close();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  values = { maxDepth: 3 };
  tsgoSettings = { "js/ts": { globalValue: true } };
  errors = [];
  document.version = 1;
  token.isCancellationRequested = false;
  current = connect();
  // The TypeScript 7 extension calls new listeners at once when its server is running.
  initialized = (listener) => {
    serverListener = listener;
    listener(current.sdk);
    return { dispose() {} };
  };
  providers = new Map();
  commands = new Map();
  warnings = [];
  documents = [document];
  middleware = undefined;
  extension = {
    isActive: true,
    packageJSON: { version: "1.1.0" },
    exports: {
      onLanguageServerInitialized: (listener) => initialized(listener),
      registerLspMiddleware(method, transformer) {
        assert.equal(method, "textDocument/hover");
        middleware = transformer;
        return { dispose() {} };
      },
    },
  };
});

const nativeHover = {
  contents: { kind: "markdown", value: "```typescript\nconst probe: Probe\n```\nThe probe." },
  range: { start: { line: 1, character: 6 }, end: { line: 1, character: 11 } },
};
const params = (line = 1, character = 7) => ({
  textDocument: { uri: document.uri.toString() },
  position: { line, character },
});

async function started() {
  const context = { subscriptions: [] };
  const client = api.createTypeClient(context);
  const tsgo = api.createTsgoClient(context, client.log);
  await tsgo.start();
  return { client, tsgo, context };
}

test("TypeScript 7 hovers merge the preview through the extension's middleware", async () => {
  await started();
  assert.ok(middleware, "middleware registered");
  const merged = await middleware(structuredClone(nativeHover), { params: params() });
  assert.deepEqual(merged.range, nativeHover.range);
  assert.equal(merged.contents.kind, "markdown");
  const value = merged.contents.value;
  assert.match(value, /^```typescript\nconst probe: \{\n {4}nested: \{\n {8}value: string;/);
  assert.match(value, /---\n\n```typescript\nconst probe: Probe\n```\nThe probe\.$/);

  values.hoverPlacement = "nativeFirst";
  const nativeFirst = (await middleware(structuredClone(nativeHover), { params: params() })).contents.value;
  assert.ok(nativeFirst.startsWith(nativeHover.contents.value), nativeFirst);
  assert.match(nativeFirst, /The probe\.\n\n---\n\n```typescript\nconst probe: \{/);

  values.hoverPlacement = "prettifiedOnly";
  const only = (await middleware(structuredClone(nativeHover), { params: params() })).contents.value;
  assert.doesNotMatch(only, /const probe: Probe/);
  assert.match(only, /value: string;[\s\S]*The probe\.$/);
});

test("TypeScript 7 hovers stay unchanged when disabled, separate, empty, redundant or outside open documents", async () => {
  await started();
  for (const setting of [{ enabled: false }, { hoverMode: "separate" }]) {
    Object.assign(values, setting);
    assert.deepEqual(await middleware(structuredClone(nativeHover), { params: params() }), nativeHover);
    values = { maxDepth: 3 };
  }
  assert.equal(await middleware(null, { params: params() }), null);
  const typeAlias = {
    ...nativeHover,
    contents: { kind: "markdown", value: "```typescript\ntype Probe = { nested: { value: string; }; }\n```" },
  };
  assert.deepEqual(await middleware(structuredClone(typeAlias), { params: params(2, 6) }), typeAlias);
  documents = [];
  assert.deepEqual(await middleware(structuredClone(nativeHover), { params: params() }), nativeHover);
});

test("separate hovers use the TypeScript 7 API and skip what TypeScript's hover already shows", async () => {
  const { client, tsgo } = await started();
  values.hoverMode = "separate";
  api.registerHoverProvider({ subscriptions: [] }, client, tsgo);
  const provider = providers.get("typescript");
  const position = new mock.Position(1, 7);
  const pending = provider.provideHover(document, position, token);
  // TypeScript's own hover arrives through the middleware while Prettify's is computed.
  await middleware(structuredClone(nativeHover), { params: params() });
  assert.match((await pending).contents.value, /nested: \{\n {8}value: string;/);
  const typeAlias = {
    contents: { kind: "markdown", value: "```typescript\ntype Probe = { nested: { value: string; }; }\n```" },
  };
  await middleware(typeAlias, { params: params(2, 6) });
  assert.equal(await provider.provideHover(document, new mock.Position(2, 6), token), undefined);
});

test("copy commands use the TypeScript 7 API", async () => {
  const { client, tsgo } = await started();
  api.registerCommands({ subscriptions: [] }, client, tsgo);
  mock.window.activeTextEditor = { document, selection: { active: new mock.Position(1, 7) } };
  try {
    await commands.get("prettify-ts.copyPrettifiedType")();
    assert.equal(clipboard, "const probe: {\n    nested: {\n        value: string;\n    };\n}\n");
  } finally {
    mock.window.activeTextEditor = undefined;
  }
});

test("a TypeScript 7 extension without the API is reported once", async () => {
  extension.exports = {};
  extension.packageJSON = { version: "1.0.1" };
  await started();
  assert.equal(middleware, undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /newer TypeScript 7 extension/);
});

test("TypeScript 7 serves documents only when its setting wins as in the TypeScript 7 extension", async () => {
  const { client, tsgo } = await started();
  const cases = [
    // [js/ts.experimental.useTsgo, typescript.experimental.useTsgo, TypeScript 7 serves the document]
    [{ globalValue: true }, undefined, true],
    [{ workspaceValue: false }, { globalValue: true }, false], // a more specific explicit false wins
    [{ globalValue: true }, { workspaceValue: false }, false],
    [{ globalValue: false }, { workspaceValue: true }, true],
    [{ globalValue: false }, { globalValue: true }, false], // js/ts wins at the same scope
    [{ workspaceValue: true }, { workspaceValue: false }, true],
    [{ workspaceFolderValue: false }, { workspaceValue: true }, false],
    [{ globalLanguageValue: true, globalValue: false }, undefined, true], // language values win within a key
    [undefined, { globalValue: true }, true],
    [undefined, undefined, false],
  ];
  for (const [unified, legacy, expected] of cases) {
    tsgoSettings = { "js/ts": unified, typescript: legacy };
    const label = JSON.stringify({ unified, legacy });
    assert.equal(api.isTsgoEnabled(), expected, label);
    assert.equal(api.sourceFor(document, client, tsgo), expected ? tsgo : client, label);
  }
  tsgoSettings = { "js/ts": { globalValue: true } };
  assert.equal(api.sourceFor({ ...document, languageId: "vue" }, client, tsgo), client, "Vue keeps TS Server");
});

test("a TypeScript 7 server restart replaces the API connection, and disposal closes it", async () => {
  const { tsgo, context } = await started();
  const first = current;
  const position = new mock.Position(1, 7);
  assert.ok(await tsgo.request(document, position, { ...api.readSettings(document).options }));
  assert.equal(first.snapshots, 1);
  current = connect();
  serverListener(current.sdk);
  assert.ok(await tsgo.request(document, position, { ...api.readSettings(document).options }));
  assert.equal(first.closed, 1, "the previous connection is closed");
  assert.deepEqual([first.snapshots, current.snapshots], [1, 1], "requests use the new connection");
  for (const subscription of context.subscriptions) subscription.dispose();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(current.closed, 1, "disposing the extension closes the connection");
});

test("cancelled requests and edits during a request discard the result", async () => {
  const { tsgo } = await started();
  const position = new mock.Position(1, 7);
  const options = api.readSettings(document).options;
  token.isCancellationRequested = true;
  assert.equal(await tsgo.request(document, position, options, token), undefined);
  token.isCancellationRequested = false;
  current = connect({ onSnapshot: () => void document.version++ });
  serverListener(current.sdk);
  assert.equal(await tsgo.request(document, position, options, token), undefined, "stale document");
});

test("without an API connection, TypeScript 7's own hover is unchanged and copying reports no type", async () => {
  current = connect({ unavailable: true });
  const { client, tsgo } = await started();
  assert.deepEqual(await middleware(structuredClone(nativeHover), { params: params() }), nativeHover);
  api.registerCommands({ subscriptions: [] }, client, tsgo);
  mock.window.activeTextEditor = { document, selection: { active: new mock.Position(1, 7) } };
  try {
    await commands.get("prettify-ts.copyPrettifiedType")();
    assert.match(errors[0], /No type information found/);
  } finally {
    mock.window.activeTextEditor = undefined;
  }
});
