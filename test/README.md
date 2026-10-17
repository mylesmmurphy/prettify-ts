# Extension Test Suite – Prettify TS

This folder contains the integration test suite for the [Prettify TS](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts) VSCode extension. These tests verify hover content rendering, settings behavior, command functionality, and declaration support for various TypeScript type structures.

---

## Folder Structure

```
test/
├── workspace/               # Contains source types for tests, matching test filenames (e.g., types.ts, declarations.ts, etc.)
├── suite/                  
│   ├── types.test.ts           # Covers all type structures: primitives, arrays, tuples, unions, functions, etc.
│   ├── declarations.test.ts    # Covers declaration kinds: const, let, var, interface, class, etc.
│   ├── commands.test.ts        # Covers command functionality like "Copy Prettified Type"
│   ├── settings.test.ts        # Verifies each user setting and its impact on behavior
│   └── utils.ts                # Helper functions for hover resolution, normalization, document loading
└── README.md               # This file
```

---

## Running Tests

### Requirements

* Node.js 24 (`nvm use`)
* The `pnpm` version pinned in the root `package.json`

Install dependencies:

```bash
pnpm install
```

No global installations or manual build steps are necessary — the `pretest` script will build the project automatically before running tests.

---

### Run Tests

To run the full test suite:

```bash
pnpm test
```

> This runs the tests using the VS Code Test CLI. Linux needs a display server; use `xvfb-run -a pnpm test` in CI.

CI tests the current stable Vue - Official editor extension (`vue.volar`). Its version is independent of the Vue framework package. The installer explicitly updates cached extensions and the suite logs the version actually loaded.

For a historical reproduction, select an editor extension version manually:

```bash
PRETTIFY_TEST_VUE_EXTENSION_VERSION=3.1.1 pnpm test
```

Each selection uses a dedicated test profile with automatic extension updates disabled. Direct plugin assertions cover Vue source mapping before and after edits, independently of the extension's release number. Bug regressions also cover computed and quoted keys, type/value name collisions, skipped aliases, unwrap settings, JavaScript/JSX hover registration, and tuple labels and cardinality.

---

### Debugging with Breakpoints

To run tests with breakpoint support, use the **"Run Tests"** launch configuration in `.vscode/launch.json`.

1. Open the VSCode command palette → “Debug: Select and Start Debugging”
2. Choose: **Run Tests**
3. Set breakpoints in any `.test.ts` or `utils.ts` file
4. Hit F5 to start the debugging session

This launches a VSCode test instance with the extension loaded and breakpoints active.

---

## Test Format Overview

Tests are grouped by category using `mocha`'s `suite()` API:

```ts
suite("Hover Types", () => {
  suiteSetup(async () => {
    await openDocument("types.ts");
  });

  suite("Primitive Types", () => {
    test("string", async () => {
      const hover = await getHover("TestPrimitiveObj");
      assertHover(hover, `type TestPrimitiveObj = { value: string }`);
    });
  });
});
```

---

## Helpful Links

* [VSCode Extension Testing Docs](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
* [@vscode/test-cli](https://github.com/microsoft/vscode-test-cli)
* [Mocha Testing Framework](https://mochajs.org/)

---

## Tips

* All test types are located in `test/workspace/<filename>.ts` matching their respective test files
* Use `suiteSetup` to open the corresponding document for tests
* Use `applySettings()` to override extension config during test setup

---

Feel free to contribute new tests or add edge cases to better validate hover rendering!
