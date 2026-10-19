// The builder's driver contract: synchronous inside TS Server, and identical output when run asynchronously.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const v8 = require("node:v8");
const vm = require("node:vm");
const ts = require(process.env.PRETTIFY_TEST_TYPESCRIPT_PATH || "typescript");
const api = require("../out-unit/entry");

const file = path.join(__dirname, "backend-virtual.ts").split(path.sep).join("/");
const compilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  target: ts.ScriptTarget.ESNext,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
  noEmit: true,
};
const options = {
  ...api.DEFAULT_OPTIONS,
  maxDepth: 5,
  maxProperties: 100,
  maxSubProperties: 100,
  skippedTypeNames: [],
};

function compile(source) {
  const host = ts.createCompilerHost(compilerOptions);
  const original = host.getSourceFile;
  host.getSourceFile = (name, ...args) =>
    name === file ? ts.createSourceFile(name, source, compilerOptions.target, true) : original(name, ...args);
  const program = ts.createProgram([file], compilerOptions, host);
  return { program, checker: program.getTypeChecker(), sourceFile: program.getSourceFile(file) };
}

// Queries the builder reads synchronously from the objects it holds; every other query may be pending.
const accessors = new Set(["typeFacts", "intrinsicName", "stringLiteralValue", "name", "symbolFacts", "checkFacts"]);

/** The in-process compiler behind an asynchronous interface, as a backend in another process would be. */
function asynchronous(backend, overrides = {}) {
  const wrapped = { ...backend, batches: true };
  for (const [key, value] of Object.entries(backend)) {
    if (typeof value !== "function" || accessors.has(key)) continue;
    // Resolved in a later microtask: the builder suspends on every query, without the timing of real round trips.
    wrapped[key] = (...args) => Promise.resolve().then(() => value(...args));
  }
  return Object.assign(wrapped, overrides);
}

/**
 * [name, source, marker, option overrides]. Cases stay within the safety budgets: which budget stops an expansion
 * first (nodes or time) depends on query speed, so budget-bound output is covered by the synchronous suite.
 */
const cases = [
  ["object", "type Test = { a: string; b?: number; readonly c: boolean };"],
  ["nested and arrays", "type Inner = { value: string }; type Test = { inner: Inner; list: Inner[] };"],
  ["depth limit", "type Test = { a: { b: { c: string } } };", "Test", { maxDepth: 1 }],
  ["mapped modifiers", "type Test = Readonly<Partial<{ a: string; b: number }>>;"],
  ["minus readonly", "type Test = { -readonly [K in keyof Readonly<{ a: string }>]: string };"],
  ["exact optional", "type Test = { a?: string | undefined; b?: string };"],
  ["getter", "class Test { get value() { return 1; } set other(v: number) {} }"],
  ["unions", "type Test = { a: boolean | null; b: string | number | undefined; c: 'x' | 'y' };"],
  ["tuples", "type Test = [name: string, age?: number, ...rest: boolean[]];"],
  ["variadic tuple", "type Test<T extends unknown[]> = [string, ...T];"],
  ["overloads", "type Test = { fn: { (): string; (x: number): number } };"],
  ["generic function", "type Test = <const T extends readonly string[] = []>(x: T) => T;"],
  ["constraint keyof", "type Test = <T, K extends keyof T>(obj: T, key: K) => T[K];"],
  ["predicates", "type Test = { is: (x: unknown) => x is string; assert: (x: unknown) => asserts x is number };"],
  ["callable object", "type Test = { (x: number): string; prop: number; new (x: string): { value: string } };"],
  ["index signature", "type Test = { [key: string]: number; known: 1 };"],
  ["enum", "enum Color { Red, Green } type Test = { color: Color.Red; any: Color };"],
  [
    "class members",
    "class Test { value = 1; private hidden = 2; #secret = 4; _under = 5; [Symbol.iterator]() { return [][Symbol.iterator](); } }",
    "Test",
    { maxDepth: 1 },
  ],
  ["class value", "class Example { constructor(public value: number) {} } const Test = new Example(1);", "Example(1)"],
  ["parameters", "function Test({ a, ...rest }: { a: string; b: number }, [x, , y]: number[], c = 1, d?: string) {}"],
  [
    "skipped names",
    "type Alias = { deep: string }; declare const Test: { m: Map<string, number>; x: Alias };",
    "Test",
    { skippedTypeNames: ["Map", "Alias"] },
  ],
  [
    "unwrap settings",
    "type Test = { fn: (x: { a: string }) => { b: number }; list: { a: string }[] };",
    "Test",
    { unwrapFunctions: false, unwrapArrays: false },
  ],
  [
    "limits",
    "type Test = { u: 'a' | 'b' | 'c' | 'd'; a: 1; b: 2; c: 3 };",
    "Test",
    { maxUnionMembers: 2, maxProperties: 3 },
  ],
  ["dom element", "declare const Test: { el: HTMLElement };", "Test", { maxDepth: 1 }],
  [
    "copy",
    "type Box<A, B> = { first: A; second: B }; type Test = { box: Box<string, Box<number, boolean>> };",
    "Test",
    { copy: true },
  ],
  ["circular", "type Test = { self: Test; name: string };", "Test", { maxDepth: 3 }],
];

for (const [name, source, marker = "Test", overrides = {}] of cases) {
  test("the builder gives identical results when run asynchronously: " + name, async () => {
    const { checker, sourceFile } = compile(source);
    const position = source.indexOf(marker) + 1;
    const control = { compilerOptions };
    const expected = api.getTypeInfoAtPosition(
      ts,
      checker,
      sourceFile,
      position,
      { ...options, ...overrides },
      undefined,
      control,
    );
    assert.ok(expected, "synchronous result");
    const errors = [];
    const actual = await api.runAsync(
      api.getTypeInfo(
        asynchronous(api.createCompilerBackend(ts, checker, sourceFile)),
        sourceFile,
        position,
        {
          ...options,
          ...overrides,
        },
        { ...control, onError: (error) => errors.push(error) },
      ),
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(actual, expected);
  });
}

test("the synchronous driver rejects a pending query instead of returning it", () => {
  const source = "type Test = { a: string };";
  const { checker, sourceFile } = compile(source);
  const backend = asynchronous(api.createCompilerBackend(ts, checker, sourceFile));
  assert.throws(
    () => api.runSync(api.getTypeInfo(backend, sourceFile, source.indexOf("Test") + 1, options)),
    /A synchronous backend returned a promise/,
  );
  assert.throws(() => api.runSync(api.step(Promise.resolve(1))), /A synchronous backend returned a promise/);
  assert.equal(api.runSync(api.step(1)), 1);
});

test("rejected queries reach the builder's error handling", async () => {
  const source = "type Test = { a: string };";
  const { checker, sourceFile } = compile(source);
  const failure = new Error("query failed");
  const errors = [];
  const backend = asynchronous(api.createCompilerBackend(ts, checker, sourceFile), {
    properties: () => Promise.reject(failure),
  });
  const info = await api.runAsync(
    api.getTypeInfo(backend, sourceFile, source.indexOf("Test") + 1, options, {
      onError: (error) => errors.push(error),
    }),
  );
  assert.equal(info, undefined);
  assert.deepEqual(errors, [failure]);
  // The same holds for a synchronous backend that throws.
  const throwing = {
    ...api.createCompilerBackend(ts, checker, sourceFile),
    properties: () => {
      throw failure;
    },
  };
  errors.length = 0;
  assert.equal(
    api.runSync(
      api.getTypeInfo(throwing, sourceFile, source.indexOf("Test") + 1, options, {
        onError: (error) => errors.push(error),
      }),
    ),
    undefined,
  );
  assert.deepEqual(errors, [failure]);
});

test("analysis releases the compiler objects of the request once it finishes", async () => {
  v8.setFlagsFromString("--expose-gc");
  const gc = vm.runInNewContext("gc");
  const kept = [];
  /** Analyze in a scope of its own and return only weak references to the compiler objects. */
  function analyze(keep) {
    const source = "type Test = { d: Date };";
    const { program, checker, sourceFile } = compile(source);
    const info = api.getTypeInfoAtPosition(
      ts,
      checker,
      sourceFile,
      source.indexOf("Test") + 1,
      api.DEFAULT_OPTIONS,
      undefined,
      {
        compilerOptions,
      },
    );
    assert.ok(info);
    if (keep) kept.push(checker);
    return { program: new WeakRef(program), checker: new WeakRef(checker), file: new WeakRef(sourceFile) };
  }
  async function alive(references) {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setImmediate(resolve));
      gc();
    }
    return Object.fromEntries(
      Object.entries(references).map(([name, reference]) => [name, reference.deref() !== undefined]),
    );
  }
  // Control: a reference held elsewhere keeps the program alive, so the probe detects retention.
  assert.deepEqual(await alive(analyze(true)), { program: true, checker: true, file: true });
  kept.length = 0;
  assert.deepEqual(await alive(analyze(false)), { program: false, checker: false, file: false });
});
