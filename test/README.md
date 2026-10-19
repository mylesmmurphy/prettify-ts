# Tests

Use Node 24 and the pinned pnpm version.

- pnpm typecheck checks the plugin, extension, integration tests, and unit entry points.
- pnpm lint checks TypeScript and formatting.
- pnpm build builds the plugin and extension.
- pnpm test:unit runs compiler-backed semantic/parser regressions, client/cancellation/configuration tests, hover rendering and quick-info merging (including workspace-folder settings), the builder's driver contract, TypeScript 7 tests, and packaging failure cleanup. `backend.test.cjs` runs the builder asynchronously against a wrapper of the in-process compiler whose every query is pending, and requires output identical to the synchronous run; it also checks that the synchronous driver rejects a pending query and that rejected queries reach the builder's error handling. The TypeScript 7 tests start the pinned TypeScript 7 server: `tsgo.test.cjs` checks that the TypeScript 7 backend renders the same output as the in-process compiler for a shared corpus, and `tsgo-editor.test.cjs` drives the extension's TypeScript 7 integration with VS Code mocked (hover middleware, separate hovers, copying, backend selection from the useTsgo settings, server restarts, disposal, cancellation, stale documents, and missing or unavailable APIs).
- pnpm test builds and runs the editor integration suite.
- pnpm test:package builds a VSIX, installs it in an isolated profile, and runs the integration suite using the installed artifact directory as the test extension.

The reproducible editor baseline is VS Code 1.100.0 with Vue - Official 3.1.1. The normal editor run uses that editor's bundled compiler. CI also tests the current stable editor/latest Vue using workspace TypeScript. The Windows job runs after merging to main, or on any branch from the CI workflow's Run workflow button. Linux editor tests require xvfb-run -a.

Environment selectors:

| Variable | Purpose |
| --- | --- |
| PRETTIFY_TEST_VSCODE_VERSION | Editor download version; default 1.100.0, or stable for the canary |
| PRETTIFY_TEST_VUE_EXTENSION_VERSION | Vue editor extension version; default 3.1.1, or latest |
| PRETTIFY_TEST_USE_WORKSPACE_TYPESCRIPT | Set to 1 to select the workspace compiler |
| PRETTIFY_TEST_VSCODE_PATH | Reuse a cached editor executable |
| PRETTIFY_TEST_EXTENSIONS_PATH | Reuse an already prepared isolated extensions directory |
| PRETTIFY_TEST_TYPESCRIPT_PATH | Alternate compiler module for test:unit |
| PRETTIFY_TEST_TSGO | Set to 1 to run the TypeScript 7 editor suite |
| PRETTIFY_TEST_TS7_PATH | Alternate TypeScript 7 installation (package directory) for the TypeScript 7 unit tests and editor suite |
| PRETTIFY_TEST_TS7_EXTENSION_REF | TypeScript commit or branch to build the TypeScript 7 extension from; default the pinned commit |
| PRETTIFY_TEST_TS7_EXTENSION_PATH | Use an already built TypeScript 7 extension directory |

Each editor run uses disposable copies of a two-folder workspace (`test/workspace` and `test/workspace-folder`), so tests can give the second folder its own settings. Settings updates and Vue edit regressions do not change tracked fixtures. Extension installation also uses explicit isolated profile and extension directories.

Hover assertions go through VS Code's real hover providers, as users see them, and also check the plugin's own rendering, so a matching native TypeScript hover cannot hide a Prettify regression. Merged hovers contribute several code blocks to one hover; the helpers collect each of them. The hover suite also covers duplicate hiding, the omission marker, the enabled setting, each hover placement, and separate hovers. The multi-root suite checks that each folder's `enabled`, `maxDepth` and `hoverMode` apply only to its own files, in merged and separate hovers alike. The language suite checks language-specific settings in merged hovers for an untitled TypeScript document, a `.js` file associated with JavaScript React (and after switching its language mode), and a `.jsx` file. The unit suite also checks that analysis leaves no compiler objects reachable once a request finishes (a garbage-collection probe with a retaining control). The unit suite additionally parses emitted types and checks mutual assignability for representative complete expansions. Fresh-install defaults are checked against the shared options definition.

## TypeScript 7 editor suite (experimental)

`PRETTIFY_TEST_TSGO=1 pnpm test` runs `test/suite/tsgo` instead of the regular editor suite: VS Code serves TypeScript through the TypeScript 7 extension (`TypeScriptTeam.native-preview`) with `js/ts.experimental.useTsgo` on and TS Server off. It covers merged hovers in each placement, separate hovers, de-duplication, copying and disabling.

No Marketplace release of the TypeScript 7 extension has the API Prettify TS uses, so `scripts/build-typescript-7-extension.js` builds the extension from TypeScript's source at the commit in `test/typescript-7.json` (cached in `.vscode-test/typescript-7-extension`). The language server is the pinned TypeScript 7 nightly from `packages/core`. Use VS Code 1.126 or later; the default for this suite is the current stable release. These runs establish the pinned development combination only: compatibility with a published extension needs a run against that release (and the packaged extension) once one has the API.

The `TypeScript 7 nightly` workflow runs weekly (and on demand) against `typescript@next` and the extension built from TypeScript's `main`, so API changes show up before the pins are bumped. To bump them, update `typescript-7` in `packages/core/package.json` and the commit in `test/typescript-7.json` together, then run the unit and TypeScript 7 editor suites.

The built formatter is loaded from development output by type-output assertions even during installed-VSIX runs; actual hover/copy integration tests exercise the installed bundled renderer. Run the build before invoking the test CLI directly.

Run editor suites sequentially on the same desktop: clipboard integration tests share the system clipboard. CI jobs use separate machines.

## Real-world suite (optional)

`pnpm test:real-world` (or `node scripts/test-real-world.js`) runs the plugin over large open-source projects. It is not part of `pnpm test` or PR CI; the `Real-world sweep` workflow runs it weekly, on demand, and on pull requests labelled `real-world` (never a required PR check). Releases require it: the release workflow calls it and does not publish unless it passes.

- Projects, pinned commits, install commands, tsconfig and sampled directories live in `test/real-world/projects.json`. Clones and installs (lifecycle scripts disabled) are kept in `.vscode-test/real-world/` and reused while the commit and install command are unchanged.
- The headless sweep (`test/real-world/sweep.ts`) loads each project's tsconfig into a LanguageService with the project's own TypeScript, attaches the plugin through its `create` entry, and requests a deterministic sample of identifiers the way the editor does: every position as a hover (`DEFAULT_OPTIONS`) and as a copy (`copy: true`), and every 8th distinct name as a full copy (`fullExpansion`).
- Each position fails on a plugin error, a request slower than the internal limit (`PREVIEW_LIMITS` / `FULL_COPY_LIMITS`, plus 250ms for the cooperative deadline), a "response size limit" truncation, or, for copies, `renderTypeInfo` output with parse diagnostics. Hovers keep their compact display (`Foo<...>`), so they are not parsed. Names that are not identifiers (`default`, `aria-label`) and `-Infinity` are accepted. Failures are grouped by shape, with examples.
- The report prints p50/p95/max latency, limit counts, and the slowest types; JSON reports and `summary.md` are written next to the clones.

Flags: `--project=<name>` (repeatable), `--positions=<n>` (default 3000, or `PRETTIFY_REAL_WORLD_POSITIONS`), `--prepare-only`, `--editor` (also run the editor smoke test: hover and both copy commands on the identifiers in the project's `smoke` entry), `--editor-only`.
