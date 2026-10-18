const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
let handler, values, scoped, folders, inspected, updates, logs, providers, commands, clipboard;
const token = { isCancellationRequested: false, onCancellationRequested() {} };
const document = { uri: { scheme: "untitled", path: "Test" }, version: 1, languageId: "typescript" };
const mock = {
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  ProgressLocation: { Notification: 15 },
  workspace: {
    get workspaceFolders() {
      return folders;
    },
    getConfiguration(section, scope) {
      assert.equal(section, "prettify-ts");
      // Like VS Code: folder values override workspace values, and language values override both.
      const uri = scope?.fsPath !== undefined ? scope : scope?.uri;
      const resolved = {
        ...values,
        ...scoped[uri?.fsPath],
        ...scoped[(uri?.fsPath ?? "") + "|" + scope?.languageId],
      };
      return {
        get(key, fallback) {
          return resolved[key] ?? fallback;
        },
        inspect() {
          return inspected;
        },
        async update(key, value, target, language) {
          updates.push({ key, value, target, language });
          values[key] = value;
        },
      };
    },
  },
  commands: {
    async executeCommand(...args) {
      return handler(...args);
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
    activeTextEditor: { document, selection: { active: { line: 0, character: 3 } } },
    createOutputChannel() {
      return {
        appendLine(line) {
          logs.push(line);
        },
        dispose() {},
      };
    },
    async showInformationMessage() {},
    async showErrorMessage() {},
    async withProgress(options, callback) {
      return callback({}, token);
    },
  },
  env: {
    clipboard: {
      async writeText(text) {
        clipboard = text;
      },
    },
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
const info = {
  name: "Test",
  declaration: "type Test = ",
  typeTree: {
    kind: "object",
    typeName: "",
    excessProperties: 0,
    properties: [{ name: "value", optional: false, readonly: false, type: { kind: "primitive", typeName: "string" } }],
  },
};
beforeEach(() => {
  // The separate hover provider is under test here; merged hovers are built by the plugin or middleware.
  values = { hoverMode: "separate" };
  scoped = {};
  folders = undefined;
  inspected = {};
  updates = [];
  logs = [];
  providers = new Map();
  commands = new Map();
  clipboard = "";
  token.isCancellationRequested = false;
  document.version = 1;
  handler = async (command, method) =>
    method === "completionInfo" ? { body: { __prettifyResponse: info } } : undefined;
});
function client() {
  return api.createTypeClient({ subscriptions: [] });
}
test("requests preserve URI and cancellation token", async () => {
  handler = async (command, method, args, config, cancellation) => {
    assert.equal(args.file, document.uri);
    assert.equal(config.executionTarget, 0);
    assert.equal(cancellation, token);
    return { body: { __prettifyResponse: info } };
  };
  assert.equal(await client().request(document, { line: 0, character: 1 }, {}, token), info);
});
test("cancelled and outdated requests do not produce results", async () => {
  const c = client();
  token.isCancellationRequested = true;
  assert.equal(await c.request(document, { line: 0, character: 1 }, {}, token), undefined);
  token.isCancellationRequested = false;
  handler = async () => {
    document.version++;
    return { body: { __prettifyResponse: info } };
  };
  assert.equal(await c.request(document, { line: 0, character: 1 }, {}, token), undefined);
});
test("missing or failed quickinfo preserves valid hover and logs failures", async () => {
  api.registerHoverProvider({ subscriptions: [] }, client());
  assert.deepEqual([...providers.keys()], [...api.supportedLanguages, "*"]);
  let hover = await providers.get("typescript").provideHover(document, { line: 0, character: 1 }, token);
  assert.match(hover.contents.value, /value: string/);
  handler = async (command, method) => {
    if (method === "quickinfo") throw new Error("No quickinfo");
    return { body: { __prettifyResponse: info } };
  };
  hover = await providers.get("typescript").provideHover(document, { line: 0, character: 1 }, token);
  assert.match(hover.contents.value, /value: string/);
  assert.match(logs[0], /No quickinfo/);
});
test("merged hovers leave TypeScript and JavaScript to the plugin; Vue keeps the separate hover", async () => {
  values.hoverMode = "merged";
  api.registerHoverProvider({ subscriptions: [] }, client());
  assert.equal(await providers.get("typescript").provideHover(document, { line: 0, character: 1 }, token), undefined);
  const vue = { ...document, languageId: "vue" };
  const hover = await providers.get("vue").provideHover(vue, { line: 0, character: 1 }, token);
  assert.match(hover.contents.value, /value: string/);
});
test("native-first separate hovers come from the less specific provider, which VS Code orders after TypeScript's", async () => {
  api.registerHoverProvider({ subscriptions: [] }, client());
  assert.ok(await providers.get("typescript").provideHover(document, { line: 0, character: 1 }, token));
  assert.equal(await providers.get("*").provideHover(document, { line: 0, character: 1 }, token), undefined);
  values.hoverPlacement = "nativeFirst";
  assert.equal(await providers.get("typescript").provideHover(document, { line: 0, character: 1 }, token), undefined);
  assert.match(
    (await providers.get("*").provideHover(document, { line: 0, character: 1 }, token)).contents.value,
    /value: string/,
  );
  const plaintext = { ...document, languageId: "plaintext" };
  assert.equal(await providers.get("*").provideHover(plaintext, { line: 0, character: 1 }, token), undefined);
});
test("plugin configuration carries each workspace folder's effective settings, with language values", () => {
  values = { maxDepth: 3 };
  scoped = {
    "|javascript": { maxDepth: 2 },
    "/one": { enabled: false, maxDepth: 7 },
    "/two|typescript": { hoverMode: "separate" },
  };
  folders = [
    { uri: { scheme: "file", fsPath: "/one" } },
    { uri: { scheme: "file", fsPath: "/two" } },
    { uri: { scheme: "vscode-vfs", fsPath: "/virtual" } },
  ];
  const configuration = api.pluginConfiguration();
  assert.equal(configuration.maxDepth, 3);
  assert.equal(configuration.languages.javascript.maxDepth, 2);
  assert.deepEqual(
    configuration.folders.map((folder) => folder.path),
    ["/one", "/two"],
    "TS Server only sees file-system folders",
  );
  const [one, two] = configuration.folders;
  assert.deepEqual(
    [one.enabled, one.maxDepth, one.languages.typescript.enabled, one.languages.typescript.maxDepth],
    [false, 7, false, 7],
  );
  assert.deepEqual(
    [two.hoverMode, two.languages.typescript.hoverMode, two.languages.javascript.hoverMode],
    [undefined, "separate", undefined],
  );
});
test("toggle writes the highest effective workspace or language override", async () => {
  values.enabled = false;
  inspected.workspaceValue = false;
  await api.toggleEnabled(true);
  assert.deepEqual(updates[0], { key: "enabled", value: true, target: 2, language: false });
  inspected.workspaceLanguageValue = false;
  updates = [];
  await api.toggleEnabled(false);
  assert.equal(updates[0].target, 2);
  assert.equal(updates[0].language, true);
});
test("copies ignore Max Characters as before; full copy expands everything and preserves private choices", async () => {
  values.maxCharacters = 5;
  values.hidePrivateProperties = false;
  const seen = [];
  handler = async (command, method, args) => {
    seen.push(args.triggerCharacter.options);
    return { body: { __prettifyResponse: info } };
  };
  api.registerCommands({ subscriptions: [] }, client());
  await commands.get("prettify-ts.copyPrettifiedType")();
  assert.equal(clipboard, "type Test = {\n    value: string;\n}\n");
  await commands.get("prettify-ts.fullCopyPrettifiedType")();
  assert.match(clipboard, /value: string/);
  assert.equal(seen[0].copy, true);
  assert.equal(seen[0].fullExpansion, false);
  assert.equal(seen[1].fullExpansion, true);
  assert.equal(seen[1].copy, true);
  assert.equal(seen[1].hidePrivateProperties, false);
});
test("hover shows earlier markers and hides duplicates of TypeScript's own hover", async () => {
  api.registerHoverProvider({ subscriptions: [] }, client());
  const collapsed = {
    ...info,
    typeTree: {
      ...info.typeTree,
      properties: [
        {
          name: "nested",
          optional: false,
          readonly: false,
          type: { kind: "object", typeName: "", properties: [], excessProperties: 2 },
        },
      ],
    },
  };
  handler = async (command, method) =>
    method === "completionInfo"
      ? { body: { __prettifyResponse: collapsed } }
      : { body: { displayString: "type Test = Other" } };
  let hover = await providers.get("typescript").provideHover(document, { line: 0, character: 1 }, token);
  assert.equal(hover.contents.value, "type Test = {\n    nested: { ... 2 more };\n}");
  handler = async (command, method) =>
    method === "completionInfo"
      ? { body: { __prettifyResponse: info } }
      : { body: { displayString: "type Test = {\n  value: string;\n}" } };
  hover = await providers.get("typescript").provideHover(document, { line: 0, character: 1 }, token);
  assert.equal(hover, undefined);
});
test("inline presentation limits do not add hover footers; invisible safety limits do", async () => {
  api.registerHoverProvider({ subscriptions: [] }, client());
  for (const [reasons, footer] of [
    [["object depth limit", "property limit"], false],
    [["object depth limit", "analysis budget"], true],
  ]) {
    handler = async (command, method) =>
      method === "completionInfo"
        ? { body: { __prettifyResponse: { ...info, truncationReasons: reasons } } }
        : undefined;
    const hover = await providers.get("typescript").provideHover(document, { line: 0, character: 1 }, token);
    assert.equal(/Expansion limited/.test(hover.contents.value), footer, reasons.join());
    if (footer) assert.doesNotMatch(hover.contents.value, /object depth limit/);
  }
});
