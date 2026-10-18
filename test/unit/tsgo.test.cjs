// The same builder through the in-process compiler (TypeScript 5.9) and the TypeScript 7 API must agree.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const ts = require("typescript");
const api = require("../out-unit/entry");

const ts7Root = path.dirname(
  require.resolve("typescript-7/package.json", { paths: [path.join(__dirname, "../../packages/core")] }),
);
const compilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  target: "esnext",
  lib: ["esnext", "dom"],
  noEmit: true,
};
const options = {
  ...api.DEFAULT_OPTIONS,
  maxDepth: 5,
  maxProperties: 100,
  maxSubProperties: 100,
  skippedTypeNames: [],
};

/** [name, source, marker, option overrides]. Each source is its own module. */
const cases = [
  ["object", "type Test = { a: string; b?: number; readonly c: boolean };"],
  ["nested", "type Inner = { value: string }; type Test = { inner: Inner; list: Inner[] };"],
  ["depth limit", "type Test = { a: { b: { c: string } } };", "Test", { maxDepth: 1 }],
  ["mapped modifiers", "type Test = Readonly<Partial<{ a: string; b: number }>>;"],
  ["minus readonly", "type Test = { -readonly [K in keyof Readonly<{ a: string }>]: string };"],
  ["exact optional", "type Test = { a?: string | undefined; b?: string };"],
  ["getter", "class Test { get value() { return 1; } set other(v: number) {} }"],
  ["unions", "type Test = { a: boolean | null; b: string | number | undefined; c: 'x' | 'y' };"],
  ["readonly arrays", "type Test = { a: ReadonlyArray<string>; b: readonly number[][] };"],
  ["tuples", "type Test = [name: string, age?: number, ...rest: boolean[]];"],
  ["readonly tuple", "type Test = readonly [string, number];"],
  ["variadic tuple", "type Test<T extends unknown[]> = [string, ...T];"],
  ["overloads", "type Test = { fn: { (): string; (x: number): number } };"],
  ["generic function", "type Test = <const T extends readonly string[] = []>(x: T) => T;"],
  ["constraint keyof", "type Test = <T, K extends keyof T>(obj: T, key: K) => T[K];"],
  ["predicates", "type Test = { is: (x: unknown) => x is string; assert: (x: unknown) => asserts x is number };"],
  ["this parameter", "type Test = (this: { value: string }, x: number) => void;"],
  ["callable object", "type Test = { (x: number): string; prop: number; new (x: string): { value: string } };"],
  ["index signature", "type Test = { [key: string]: number; known: 1 };"],
  ["generic mapped", "type Test<T> = Partial<T>;"],
  ["template literal", "type Test = { id: `user-${number}` };"],
  ["enum", "enum Color { Red, Green } type Test = { color: Color.Red; any: Color };"],
  ["intersection", "type Test = { a: string } & { b: number };"],
  ["branded primitive", "type Test = { id: string & { __brand: 'id' } };"],
  ["class declaration", "class Test { value = 1; private hidden = 2; protected guarded = 3; #secret = 4; _under = 5; }"],
  ["class value", "class Example { constructor(public value: number) {} } const Test = new Example(1);", "Example(1)"],
  // Self-contained: the bundled lib declarations of iterators differ between compiler versions.
  [
    "symbol members",
    "class Test { [Symbol.toStringTag] = 'x'; [Symbol.iterator](): { next(): { done: boolean } } { return null!; } }",
  ],
  ["default parameters", "function Test(a = 1, b: string, c?: number, ...d: string[]) {}"],
  ["trailing default", "function Test(a: string, b = 1) {}"],
  [
    "destructured parameters",
    "function Test({ state, onRetry: retry = () => {}, ...rest }: { state: string; onRetry?: () => void; x: 1 }, [a, , b]: number[]) {}",
  ],
  ["let and var", "let Test = { a: 1 }; var other = 2;"],
  ["interface", "interface Test<T> { value: T; method(): void }"],
  ["promise argument", "declare const Test: Promise<{ value: string }>;", "Test", { unwrapGenericArgumentsTypeNames: ["Promise"] }],
  ["skipped names", "declare const Test: { m: Map<string, number>; a: Array<string> };", "Test", { skippedTypeNames: ["Map", "Array"] }],
  ["skipped annotation", "type Alias = { deep: string }; declare const Test: { x: Alias };", "Test", { skippedTypeNames: ["Alias"] }],
  ["hide private off", "class Test { private hidden = 1; _under = 2; }", "Test", { hidePrivateProperties: false }],
  ["underscore public", "class Test { _under = 2; private hidden = 1; }", "Test", { treatUnderscoreAsPrivate: false }],
  ["functions not unwrapped", "type Test = { fn: (x: { a: string }) => { b: number } };", "Test", { unwrapFunctions: false }],
  ["arrays not unwrapped", "type Test = { list: { a: string }[] };", "Test", { unwrapArrays: false }],
  ["union limit", "type Test = 'a' | 'b' | 'c' | 'd' | 'e';", "Test", { maxUnionMembers: 2 }],
  ["property limit", "type Test = { a: 1; b: 2; c: 3; d: 4 };", "Test", { maxProperties: 2 }],
  ["dom element", "declare const Test: { el: HTMLElement };", "Test", { maxDepth: 1 }],
  ["copy", "type Box<A, B> = { first: A; second: B }; type Test = { box: Box<string, Box<number, boolean>> };", "Test", { copy: true }],
  ["circular", "type Test = { self: Test; name: string };", "Test", { maxDepth: 3 }],
  ["non-ASCII text before marker", "const café = '☕'; type Test = { 名前: string; emoji: '😀' };"],
];

let ts7, apiInstance, snapshot, project, directory;
const files = new Map();

before(async () => {
  const load = (relative) => import(pathToFileURL(path.join(ts7Root, relative)).href);
  const [asyncApi, ast, scanner] = await Promise.all([
    load("dist/api/async/api.js"),
    load("dist/ast/index.js"),
    load("dist/ast/scanner.js"),
  ]);
  const version = JSON.parse(fs.readFileSync(path.join(ts7Root, "package.json"), "utf8")).version;
  ts7 = { api: asyncApi, ast, scanner, version };
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "prettify-ts7-"));
  fs.writeFileSync(path.join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions, include: ["*.ts"] }));
  cases.forEach(([name, source], index) => {
    const file = path.join(directory, "case" + index + ".ts");
    fs.writeFileSync(file, source + "\nexport {};\n");
    files.set(name, file);
  });
  apiInstance = new asyncApi.API({ cwd: directory });
  snapshot = await apiInstance.createSnapshot({
    openProjects: [path.join(directory, "tsconfig.json")],
    openFiles: [...files.values()],
  });
  project = await snapshot.getDefaultProjectForFile([...files.values()][0]);
});

after(async () => {
  await snapshot?.dispose();
  await apiInstance?.close();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

function compiler5(file, position, overrides) {
  const parsed = ts.convertCompilerOptionsFromJson(compilerOptions, directory).options;
  const program = ts.createProgram([file], parsed);
  const errors = [];
  const info = api.getTypeInfoAtPosition(
    ts,
    program.getTypeChecker(),
    program.getSourceFile(file),
    position,
    { ...options, ...overrides },
    undefined,
    { compilerOptions: parsed, onError: (error) => errors.push(error) },
  );
  assert.deepEqual(errors, []);
  return info;
}

for (const [name, , marker = "Test", overrides = {}] of cases) {
  test("TypeScript 7 matches the in-process compiler: " + name, async () => {
    const file = files.get(name);
    const text = fs.readFileSync(file, "utf8");
    const position = text.indexOf(marker) + 1;
    const errors = [];
    const actual = await api.getTypeInfoFromProject(ts7, project, file, position, { ...options, ...overrides }, {
      onError: (error) => errors.push(error),
    });
    assert.deepEqual(errors, []);
    const expected = compiler5(file, position, overrides);
    assert.ok(expected, "in-process compiler result");
    assert.ok(actual, "TypeScript 7 result");
    assert.equal(api.renderTypeInfo(actual, 4), api.renderTypeInfo(expected, 4));
    assert.deepEqual(actual.truncationReasons, expected.truncationReasons);
  });
}
