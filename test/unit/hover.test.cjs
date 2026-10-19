// Merged hovers: preview rendering, plugin settings and quick-info merging.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require(process.env.PRETTIFY_TEST_TYPESCRIPT_PATH || "typescript");
const api = require("../out-unit/entry");

const preview = {
  code: "const value: {\n    nested: string;\n}",
  declaration: "const value: ",
  type: "{\n    nested: string;\n}",
  limits: [],
};

test("code blocks stay closed when type text contains backticks, and notes are escaped", () => {
  const block = api.codeBlock('type T = "```";');
  assert.ok(block.startsWith("````typescript\n") && block.endsWith("\n````"), block);
  const note = api.previewMarkdown({ ...preview, note: "Expansion limited: analysis budget." });
  assert.match(note, /Expansion limited: analysis budget\\\.$/);
});

test("previews repeat nothing TypeScript already shows", () => {
  const info = {
    name: "Test",
    declaration: "type Test = ",
    typeTree: { kind: "object", typeName: "", excessProperties: 0, properties: [] },
  };
  const rendered = api.renderHoverPreview(
    {
      ...info,
      typeTree: {
        ...info.typeTree,
        properties: [{ name: "a", optional: false, readonly: false, type: { kind: "primitive", typeName: "string" } }],
      },
    },
    { indentation: 4, maxCharacters: 20000 },
  );
  assert.equal(api.isRedundant(rendered, "type Test = { a: string; }"), true);
  assert.equal(api.isRedundant(rendered, "type Test = Other"), false);
  assert.equal(api.isRedundant({ ...rendered, limits: ["analysis budget"] }, "type Test = { a: string; }"), false);
  assert.equal(api.isRedundant(rendered, undefined), false);
});

test("plugin settings resolve per language, with tsconfig defaults merging hovers", () => {
  assert.equal(api.languageOf("/a/b.tsx"), "typescriptreact");
  assert.equal(api.languageOf("/a/b.mts"), "typescript");
  assert.equal(api.languageOf("/a/b.cjs"), "javascript");
  assert.equal(api.languageOf("/a/b.vue"), "vue");
  const defaults = api.resolveHoverSettings({}, "/a/b.ts");
  assert.equal(defaults.mode, "merged");
  assert.equal(defaults.placement, "prettifiedFirst");
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.options.maxDepth, api.DEFAULT_OPTIONS.maxDepth);
  const configured = {
    maxDepth: 3,
    hoverPlacement: "nativeFirst",
    copy: true,
    languages: { javascript: { enabled: false, maxDepth: 1, hoverMode: "separate" } },
  };
  const typescript = api.resolveHoverSettings(configured, "/a/b.ts");
  assert.equal(typescript.options.maxDepth, 3);
  assert.equal(typescript.options.copy, false, "hovers never use copy output");
  assert.equal(typescript.placement, "nativeFirst");
  const javascript = api.resolveHoverSettings(configured, "/a/b.js");
  assert.deepEqual([javascript.enabled, javascript.mode, javascript.options.maxDepth], [false, "separate", 1]);
  assert.equal(api.resolveHoverSettings({ hoverMode: "bogus", hoverPlacement: 3 }, "/a/b.ts").mode, "merged");
});

test("plugin settings come from the deepest workspace folder containing the file", () => {
  const configuration = {
    maxDepth: 1,
    folders: [
      { path: "/work/one", enabled: false, maxDepth: 7, languages: { typescript: { enabled: false, maxDepth: 7 } } },
      { path: "/work/one/nested/", maxDepth: 4, languages: { typescript: { maxDepth: 5, hoverMode: "separate" } } },
      { path: "C:\\Work\\Two", maxDepth: 2 },
    ],
  };
  const one = api.resolveHoverSettings(configuration, "/work/one/index.ts");
  assert.deepEqual([one.enabled, one.options.maxDepth], [false, 7]);
  const nested = api.resolveHoverSettings(configuration, "/work/one/nested/deep/a.ts");
  assert.deepEqual([nested.enabled, nested.options.maxDepth, nested.mode], [true, 5, "separate"]);
  assert.equal(api.resolveHoverSettings(configuration, "/work/one/nested/a.js").options.maxDepth, 4);
  // A sibling whose name starts with a folder's name is outside that folder.
  assert.equal(api.resolveHoverSettings(configuration, "/work/one-more/a.ts").options.maxDepth, 1);
  assert.equal(api.resolveHoverSettings(configuration, "/elsewhere/a.ts").options.maxDepth, 1);
  // VS Code and TS Server spell Windows paths differently; case only matters on case-sensitive file systems.
  assert.equal(api.resolveHoverSettings(configuration, "c:/work/two/a.ts", false).options.maxDepth, 2);
  assert.equal(api.resolveHoverSettings(configuration, "c:/work/two/a.ts", true).options.maxDepth, 1);
});

/** A language service with the plugin attached, as TS Server attaches it. */
function pluginService(source, config, { fileName = "/virtual/test.ts", scriptKind } = {}) {
  const files = new Map([[fileName, source]]);
  const host = {
    // As TS Server configures projects with untitled files and JavaScript.
    getCompilationSettings: () => ({
      strict: true,
      target: ts.ScriptTarget.ESNext,
      allowJs: true,
      allowNonTsExtensions: true,
    }),
    ...(scriptKind === undefined ? {} : { getScriptKind: () => scriptKind }),
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => "1",
    getScriptSnapshot: (name) =>
      files.has(name)
        ? ts.ScriptSnapshot.fromString(files.get(name))
        : ts.sys.fileExists(name)
          ? ts.ScriptSnapshot.fromString(ts.sys.readFile(name))
          : undefined,
    getCurrentDirectory: () => "/virtual",
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (name) => files.has(name) || ts.sys.fileExists(name),
    readFile: (name) => files.get(name) ?? ts.sys.readFile(name),
  };
  const languageService = ts.createLanguageService(host);
  const plugin = api.init({ typescript: ts });
  const proxy = plugin.create({
    languageService,
    // TS Server's host knows the script kind VS Code opened each document with.
    languageServiceHost: scriptKind === undefined ? undefined : { getScriptKind: () => scriptKind },
    config: config ?? {},
    project: {
      projectService: { logger: { info() {} } },
      getCancellationToken: () => ({ isCancellationRequested: () => false }),
    },
  });
  return { proxy, plugin, fileName, position: (marker) => source.indexOf(marker) + 1 };
}

const display = (quickInfo) => ts.displayPartsToString(quickInfo.displayParts);
const documentation = (quickInfo) => ts.displayPartsToString(quickInfo.documentation);

test("the plugin merges the preview into TypeScript's quick info", () => {
  const source =
    "/** The probe. */\nconst probe: Probe = { nested: { value: '' } };\ntype Probe = { nested: { value: string } };";
  const { proxy, plugin, fileName, position } = pluginService(source);
  plugin.onConfigurationChanged({ maxDepth: 3 });
  const first = proxy.getQuickInfoAtPosition(fileName, position("probe:"));
  assert.match(display(first), /const probe: \{\n {4}nested: \{\n {8}value: string;/);
  assert.match(documentation(first), /^```typescript\nconst probe: Probe\n```\n\nThe probe\.$/);
  assert.ok(first.textSpan, "keeps TypeScript's range");

  plugin.onConfigurationChanged({ maxDepth: 3, hoverPlacement: "nativeFirst" });
  const nativeFirst = proxy.getQuickInfoAtPosition(fileName, position("probe:"));
  assert.equal(display(nativeFirst), "const probe: Probe");
  assert.match(documentation(nativeFirst), /^The probe\.\n\n```typescript\nconst probe: \{/);

  plugin.onConfigurationChanged({ maxDepth: 3, hoverPlacement: "prettifiedOnly" });
  const only = proxy.getQuickInfoAtPosition(fileName, position("probe:"));
  assert.match(display(only), /nested/);
  assert.equal(documentation(only), "The probe.");
});

test("the plugin leaves quick info alone when disabled, separate, skipped or redundant", () => {
  const source = "const probe: Probe = { value: '' };\ntype Probe = { value: string };\nconst plain = 1;";
  const { proxy, plugin, fileName, position } = pluginService(source);
  const nativeText = "const probe: Probe";
  for (const config of [
    { enabled: false },
    { hoverMode: "separate" },
    { languages: { typescript: { enabled: false } } },
    { skippedTypeNames: ["probe"] },
  ]) {
    plugin.onConfigurationChanged(config);
    assert.equal(
      display(proxy.getQuickInfoAtPosition(fileName, position("probe:"))),
      nativeText,
      JSON.stringify(config),
    );
  }
  plugin.onConfigurationChanged({});
  assert.equal(display(proxy.getQuickInfoAtPosition(fileName, position("plain"))), "const plain: 1");
});

test("folder settings decide whether the plugin merges a file's quick info", () => {
  const source = "const probe: Probe = { value: '' };\ntype Probe = { value: string };";
  const { proxy, plugin, fileName, position } = pluginService(source);
  plugin.onConfigurationChanged({ folders: [{ path: "/virtual", enabled: false }] });
  const disabled = proxy.getQuickInfoAtPosition(fileName, position("probe:"));
  assert.equal(display(disabled), "const probe: Probe");
  plugin.onConfigurationChanged({ enabled: false, folders: [{ path: "/virtual", enabled: true, typeIndentation: 2 }] });
  const merged = proxy.getQuickInfoAtPosition(fileName, position("probe:"));
  assert.equal(display(merged), "const probe: {\n  value: string;\n}");
  assert.equal(typeof merged.then, "undefined", "quick info stays synchronous");
});

test("language settings follow the document's script kind, not only its file name", () => {
  const source = "const probe: Probe = { value: '' };\ntype Probe = { value: string };";
  const languages = { typescript: { enabled: false }, javascriptreact: { enabled: false } };
  // An untitled TypeScript document: TS Server knows it as TS, though its name has no extension.
  const untitled = pluginService(
    source,
    { languages },
    {
      fileName: "^/untitled/ts-nul-authority/Untitled-1",
      scriptKind: ts.ScriptKind.TS,
    },
  );
  assert.equal(
    display(untitled.proxy.getQuickInfoAtPosition(untitled.fileName, untitled.position("probe:"))),
    "const probe: Probe",
  );
  // A .js file VS Code opened as JavaScript React gets that language's settings.
  const associated = pluginService(
    source,
    { languages },
    { fileName: "/virtual/probe.js", scriptKind: ts.ScriptKind.JSX },
  );
  assert.equal(
    display(associated.proxy.getQuickInfoAtPosition(associated.fileName, associated.position("probe:"))),
    "const probe: Probe",
  );
  // TS Server keeps the JS script kind of a project file it loaded before the editor opened it as JavaScript React;
  // the language the extension reports for that open file decides.
  const loaded = pluginService(
    source,
    { languages, documentLanguages: { "/virtual/probe.js": "javascriptreact" } },
    { fileName: "/virtual/probe.js", scriptKind: ts.ScriptKind.JS },
  );
  assert.equal(
    display(loaded.proxy.getQuickInfoAtPosition(loaded.fileName, loaded.position("probe:"))),
    "const probe: Probe",
  );
  // Control: the same file as plain JavaScript keeps the preview.
  const plain = pluginService(source, { languages }, { fileName: "/virtual/probe.js", scriptKind: ts.ScriptKind.JS });
  assert.match(display(plain.proxy.getQuickInfoAtPosition(plain.fileName, plain.position("probe:"))), /value: string/);
  // Without a script kind, the file name decides.
  assert.equal(api.resolveHoverSettings({ languages }, "/virtual/a.ts").enabled, false);
  assert.equal(api.resolveHoverSettings({ languages }, "/virtual/a.js").enabled, true);
  assert.equal(api.resolveHoverSettings({ languages }, "/virtual/a.js", true, "javascriptreact").enabled, false);
});

test("tsconfig plugin settings configure hovers in other editors", () => {
  const source = "const probe: Probe = { nested: { value: '' } };\ntype Probe = { nested: { value: string } };";
  const { proxy, fileName, position } = pluginService(source, { name: "@prettify-ts/typescript-plugin", maxDepth: 1 });
  assert.equal(
    display(proxy.getQuickInfoAtPosition(fileName, position("probe:"))),
    "const probe: {\n    nested: { ... 1 more };\n}",
  );
});
