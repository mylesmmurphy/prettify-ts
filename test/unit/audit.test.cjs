const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ts = require(process.env.PRETTIFY_TEST_TYPESCRIPT_PATH || "typescript");
const api = require("../out-unit/entry");
const file = path.join(__dirname, "virtual.ts").split(path.sep).join("/");
function programFor(source, exact = true) {
  const options = { strict: true, exactOptionalPropertyTypes: exact, target: ts.ScriptTarget.ESNext, noEmit: true };
  const host = ts.createCompilerHost(options),
    original = host.getSourceFile;
  host.getSourceFile = (name, ...args) =>
    name === file ? ts.createSourceFile(name, source, options.target, true) : original(name, ...args);
  const program = ts.createProgram([file], options, host);
  return { program, checker: program.getTypeChecker(), sourceFile: program.getSourceFile(file) };
}
function inspect(source, marker = "Test", overrides = {}, exact = true) {
  const { program, checker, sourceFile } = programFor(source, exact),
    errors = [];
  assert.ok(source.indexOf(marker) >= 0);
  const info = api.getTypeInfoAtPosition(
    ts,
    checker,
    sourceFile,
    source.indexOf(marker) + 1,
    {
      ...api.DEFAULT_OPTIONS,
      maxDepth: 5,
      maxProperties: 100,
      maxSubProperties: 100,
      skippedTypeNames: [],
      ...overrides,
    },
    undefined,
    { compilerOptions: program.getCompilerOptions(), onError: (error) => errors.push(error) },
  );
  assert.deepEqual(errors, []);
  assert.ok(info, "Expected plugin type info");
  return { info, text: api.renderTypeInfo(info, 0), checker, sourceFile };
}
function parses(text) {
  const file = ts.createSourceFile("rendered.ts", text, ts.ScriptTarget.Latest, true);
  assert.deepEqual(
    file.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")),
    [],
    text,
  );
}
function equivalent(source, marker = "Test", overrides = {}, exact = true) {
  const { text } = inspect(source, marker, overrides, exact);
  parses(text);
  const actual = text.replace(new RegExp("type " + marker + "\\b"), "type Actual");
  const { program, checker, sourceFile } = programFor(source + "\n" + actual, exact);
  const aliases = sourceFile.statements.filter(ts.isTypeAliasDeclaration);
  const left = checker.getTypeAtLocation(aliases.find((n) => n.name.text === marker));
  const right = checker.getTypeAtLocation(aliases.find((n) => n.name.text === "Actual"));
  assert.ok(checker.isTypeAssignableTo(left, right), text);
  assert.ok(checker.isTypeAssignableTo(right, left), text);
  assert.deepEqual(
    program.getSemanticDiagnostics(sourceFile).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")),
    [],
    text,
  );
  return text;
}
test("root functions and overload objects use valid syntax", () => {
  equivalent("type Test = () => string;");
  const { text } = inspect("declare const Test: () => string;");
  assert.match(text, /const Test: \(\) => string/);
  parses(text);
  equivalent("type Test = { fn: { (): string; (x: number): number } };");
});
test("generic binders, predicates, assertions and this are preserved", () => {
  equivalent('type Test = <T extends string = "x">(x: T) => T;');
  equivalent("type Test = <T extends { value: string }>(x: T) => T;");
  assert.match(equivalent("type Test = <const T extends readonly string[]>(x: T) => T;"), /<const T/);
  equivalent("type Test = (x: unknown) => x is string;");
  equivalent("type Test = (x: unknown) => asserts x is string;");
  equivalent("type Test = (this: { value: string }, x: number) => void;");
});
test("mapped optional/readonly modifiers and getter-only properties are correct", () => {
  assert.match(equivalent("type Test = Partial<{ a: string }>;"), /a\?: string/);
  assert.match(equivalent("type Test = Required<{ a?: string }>;"), /a: string/);
  assert.match(equivalent("type Test = Readonly<{ a: string }>;"), /readonly a: string/);
  assert.doesNotMatch(
    equivalent("type Test = { -readonly [K in keyof Readonly<{ a: string }>]: string };"),
    /readonly a/,
  );
  assert.match(equivalent('type Test = { readonly [K in "a"]: string };'), /readonly a/);
  assert.match(equivalent("type Test = { method?(): void };"), /method\?/);
  assert.match(inspect("class Test { get value() { return 1; } }").text, /readonly value: number/);
});
test("callable objects retain properties, constructors and index signatures", () => {
  equivalent("type Test = { (x: number): string; prop: number; new (x: string): { value: string } };");
  equivalent("type Test = { new (x: number): { value: number } };");
  equivalent("type Test = { (): string; [key: string]: unknown };");
});
test("union and readonly-array precedence preserves semantics", () => {
  equivalent("type Test = (() => string) | number;");
  assert.match(equivalent("type Test = Array<ReadonlyArray<string>>;"), /\(readonly string\[\]\)\[\]/);
  assert.match(equivalent("type Test = ReadonlyArray<ReadonlyArray<string>>;"), /readonly \(readonly string\[\]\)\[\]/);
  assert.match(equivalent("type Test = Array<readonly [string, number]>;"), /\(readonly \[string, number\]\)\[\]/);
});
test("exact optional types preserve explicit undefined", () => {
  assert.match(equivalent("type Test = { a?: string | undefined };"), /undefined/);
  assert.doesNotMatch(equivalent("type Test = { a?: string };"), /undefined/);
  assert.match(equivalent("type Test = [a?: string | undefined];"), /undefined/);
  equivalent("type Test = { a?: string | undefined };", "Test", {}, false);
  equivalent("type Test = [a?: string | null];");
});
test("rendering does not mutate input", () => {
  const { info } = inspect("type Test = { a?: string | undefined; fn: (a?: string) => void };"),
    before = JSON.stringify(info);
  api.renderTypeInfo(info, 4);
  api.renderTypeInfo(info, 0);
  assert.equal(JSON.stringify(info), before);
});
test("default parameters retain actual cardinality", () => {
  const normal = inspect("function Test(a = 1) { return a; }").text;
  assert.match(normal, /a\?: number/);
  parses(normal);
  const beforeRequired = inspect("function Test(a = 1, b: string) { return a; }").text;
  assert.match(beforeRequired, /a: number \| undefined, b: string/);
  parses(beforeRequired);
});
test("constructors select resolved overloads and inference; extends shows instances", () => {
  const text = inspect(
    "class Example { constructor(value: string); constructor(value: number); constructor(value: unknown) {} } new Example(1);",
    "Example(1)",
  ).text;
  assert.match(text, /value: number/);
  parses(text);
  const generic = inspect('class Box<T> { constructor(public value: T) {} } new Box("text");', 'Box("text")').text;
  assert.match(generic, /value: string/);
  assert.match(generic, /Box<string>/);
  parses(generic);
  const heritage = inspect("class Parent { value = 1; } class Child extends Parent {}", "Parent {}").text;
  assert.match(heritage, /value: number/);
  assert.doesNotMatch(heritage, /new /);
});
test("numeric-looking property keys retain exact names", () => {
  const text = equivalent('type Test = { "01": string; "9007199254740993": number };');
  assert.match(text, /"01"/);
  assert.match(text, /"9007199254740993"/);
});
test("formatting preserves intersections and template literal contents", () => {
  assert.match(api.prettyPrintTypeString("function f(x: { a: string; } & { a: number; }): void", 4), /&/);
  const q = String.fromCharCode(96),
    literal = q + 'typeof import("/x/node_modules/foo")' + "$" + "{string}" + q;
  assert.ok(api.prettyPrintTypeString("{ value: " + literal + "; }", 4).includes(literal));
  parses(api.prettyPrintTypeString("type X = { nested: { a: string; }; };", 4));
});
test("native completions preserve receiver and all arguments", () => {
  let observed;
  const service = {
    getCompletionsAtPosition(...args) {
      assert.equal(this, service);
      observed = args;
    },
  };
  const proxy = api
    .init({ typescript: ts })
    .create({ languageService: service, project: { projectService: { logger: { info() {} } } } });
  const format = { indentSize: 2 };
  proxy.getCompletionsAtPosition("file.ts", 1, {}, format);
  assert.equal(observed[3], format);
});
test("Promise override works and Array/Map/Set defaults are consistent", () => {
  assert.ok(["Array", "Map", "Set"].every((n) => !api.DEFAULT_OPTIONS.skippedTypeNames.includes(n)));
  assert.equal(
    inspect("declare const Test: Promise<{ value: string }>;", "Test", { unwrapPromises: false }).info.typeTree.kind,
    "reference",
  );
  const map = inspect("declare const Test: Map<string, { value: string }>;").text;
  assert.match(map, /Map<string, \{/);
  assert.match(map, /value: string/);
});
test("configured generic aliases retain wrapper and expand arguments", () => {
  const text = inspect("type Wrap<T> = { v: T }; declare const Test: Wrap<{ value: string }>;", "Test", {
    unwrapGenericArgumentsTypeNames: ["Wrap"],
  }).text;
  assert.match(text, /Wrap<\{ value: string;/);
});
test("total property budgets apply across nested objects", () => {
  const { info } = inspect("type Test = { a: { x: string; y: string }; b: { x: string; y: string } };", "Test", {
    maxProperties: 2,
  });
  function count(t) {
    return t.kind === "object"
      ? t.properties.length + t.properties.reduce((n, p) => n + count(p.type), 0)
      : t.kind === "union"
        ? t.types.reduce((n, t) => n + count(t), 0)
        : 0;
  }
  assert.ok(count(info.typeTree) <= 2);
  assert.ok(info.truncationReasons.includes("property limit"));
});
test("one retained overload still reports omissions", () => {
  const { info, text } = inspect("type Test = { (x: string): string; (x: number): number };", "Test", {
    maxFunctionSignatures: 1,
  });
  assert.match(text, /1 more signatures/);
  assert.ok(info.truncationReasons.includes("function signature limit"));
});
test("numeric settings and full copy stay finite and bounded", () => {
  const o = api.normalizeOptions({ maxDepth: Infinity, maxProperties: -3, maxUnionMembers: 1.5 });
  assert.equal(o.maxDepth, api.DEFAULT_OPTIONS.maxDepth);
  assert.equal(o.maxProperties, 1);
  assert.equal(o.maxUnionMembers, 1);
  const full = api.normalizeOptions({ fullExpansion: true });
  assert.equal(full.maxProperties, api.MAX_ANALYSIS_NODES);
  assert.ok(full.maxDepth < 100);
});
test("recursive generics terminate even with full copy", () => {
  for (const source of [
    "type Chain<T> = () => Chain<T[]>; type Test = Chain<number>;",
    "type Chain<T> = { next: Chain<T[]> }; type Test = Chain<number>;",
  ]) {
    const { info } = inspect(source, "Test", { fullExpansion: true });
    assert.ok(info.truncationReasons.length);
    assert.ok(JSON.stringify(info).length < 99000);
  }
});
test("collapsed wide types do not carry hidden complete strings", () => {
  const source =
    "declare const Test: { " + Array.from({ length: 10000 }, (_, i) => "p" + i + ": string").join(";") + " };";
  const { info } = inspect(source, "Test", { maxProperties: 1, maxDepth: 1 });
  assert.ok(JSON.stringify(info).length < 3000);
});
test("AST lookup prunes irrelevant branches", () => {
  const sf = ts.createSourceFile(
    "lookup.ts",
    "type First = { a: string }; type Second = { b: number };",
    ts.ScriptTarget.Latest,
    true,
  );
  sf.statements[1].forEachChild = () => {
    throw new Error("Visited irrelevant subtree");
  };
  assert.equal(api.getDescendantAtRange(ts, sf, [6, 6]).getText(), "First");
});
test("Vue generated offset zero is valid", () => {
  const code = {},
    script = {
      generated: {
        root: { languageId: "vue" },
        languagePlugin: {
          typescript: {
            getServiceScript: () => ({ code, preventLeadingOffset: true }),
          },
        },
      },
    };
  const language = {
    scripts: { get: () => script },
    maps: {
      get: () => ({
        *toGeneratedLocation() {
          yield [0];
        },
      }),
    },
  };
  assert.equal(api.getPositionForVue(language, "test.vue", 12), 0);
});
test("manifest defaults agree with shared options", () => {
  const manifest = require("../../packages/vscode-extension/package.json"),
    properties = manifest.contributes.configuration.properties;
  for (const [key, value] of Object.entries(api.DEFAULT_OPTIONS))
    assert.deepEqual(properties["prettify-ts." + key].default, value, key);
  for (const v of Object.values(properties)) {
    if (v.type === "integer") assert.ok(v.maximum !== undefined);
    assert.equal(v.scope, "language-overridable");
  }
  assert.equal(manifest.engines.vscode, "^1.100.0");
  assert.ok(!manifest.activationEvents.includes("onStartupFinished"));
});

test("object-constrained generic parameters and const inference remain bound", () => {
  equivalent("type Test = <T extends { value: string }>(x: T) => T;");
  assert.match(equivalent("type Test = <const T extends readonly string[]>(x: T) => T;"), /<const T/);
  assert.match(equivalent("type Test = { a?: string | undefined };", "Test", {}, false), /undefined/);
});

test("generic type declarations retain outer parameter binders", () => {
  const text = inspect("type Test<T extends unknown[]> = { value: [first: string, ...rest: T] };").text;
  assert.match(text, /type Test<T extends unknown\[\]>/);
  parses(text);
});
test("cancelled compiler analysis exits without a response", () => {
  const { checker, sourceFile } = programFor("type Test = { a: string };");
  const info = api.getTypeInfoAtPosition(ts, checker, sourceFile, 6, api.DEFAULT_OPTIONS, undefined, {
    isCancellationRequested: () => true,
  });
  assert.equal(info, undefined);
});

test("opaque reference expressions group safely and primitive brands remain intersections", () => {
  const conditional = inspect("type Test<T> = (T extends string ? number : boolean)[];").text;
  parses(conditional);
  assert.match(conditional, /\(T extends string \? number : boolean\)\[\]/);
  const branded = inspect("type Test = string & { readonly brand: unique symbol };").text;
  assert.match(branded, /string &/);
});
