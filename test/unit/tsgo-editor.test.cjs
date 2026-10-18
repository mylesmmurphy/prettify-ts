// The TypeScript 7 editor integration against a real TypeScript 7 server, with VS Code and its extension mocked.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { pathToFileURL } = require("node:url");

const ts7Root = path.dirname(
  require.resolve("typescript-7/package.json", { paths: [path.join(__dirname, "../../packages/core")] }),
);
let values, providers, commands, middleware, initialized, warnings, clipboard, extension, documents;
const token = { isCancellationRequested: false, onCancellationRequested() {} };
const mock = {
  ProgressLocation: { Notification: 15 },
  workspace: {
    get textDocuments() {
      return documents;
    },
    getConfiguration(section) {
      return {
        get(key, fallback) {
          if (section === "js/ts" && key === "experimental.useTsgo") return values.useTsgo;
          if (section !== "prettify-ts") return fallback;
          return values[key] ?? fallback;
        },
        inspect: () => ({}),
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
      throw new Error(message);
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

let directory, server, snapshot, document;
const source = "/** The probe. */\nconst probe: Probe = { nested: { value: '' } };\ntype Probe = { nested: { value: string } };\n";

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
      source.split("\n").slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.character,
  };
  // The language server's snapshots come from the real server; the extension never disposes these.
  const lspApi = {
    getCurrentLanguageServerSnapshot: async () => ({
      getDefaultProjectForFile: (identifier) => snapshot.getDefaultProjectForFile(identifier),
      isDisposed: () => false,
      dispose: async () => {},
    }),
    close: async () => {},
  };
  const sdk = {
    version: "7.1.0-test",
    initializeAPIConnection: async () => "test-pipe",
    async importModule(exportPath) {
      const module = await load({ "typescript/async": "dist/api/async/api.js", "typescript/ast": "dist/ast/index.js", "typescript/ast/scanner": "dist/ast/scanner.js" }[exportPath]);
      return exportPath === "typescript/async"
        ? { ...module, API: { fromLSPConnection: async ({ pipe }) => (assert.equal(pipe, "test-pipe"), lspApi) } }
        : module;
    },
  };
  initialized = (listener) => {
    listener(sdk);
    return { dispose() {} };
  };
});

after(async () => {
  await snapshot?.dispose();
  await server?.close();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  values = { useTsgo: true, maxDepth: 3 };
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
const params = (line = 1, character = 7) => ({ textDocument: { uri: document.uri.toString() }, position: { line, character } });

async function started() {
  const client = api.createTypeClient({ subscriptions: [] });
  const tsgo = api.createTsgoClient({ subscriptions: [] }, client.log);
  await tsgo.start();
  return { client, tsgo };
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
    values = { useTsgo: true, maxDepth: 3 };
  }
  assert.equal(await middleware(null, { params: params() }), null);
  const typeAlias = { ...nativeHover, contents: { kind: "markdown", value: "```typescript\ntype Probe = { nested: { value: string; }; }\n```" } };
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
  const typeAlias = { contents: { kind: "markdown", value: "```typescript\ntype Probe = { nested: { value: string; }; }\n```" } };
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
