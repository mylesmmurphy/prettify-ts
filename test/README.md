# Tests

Use Node 24 and the pinned pnpm version.

- pnpm typecheck checks the plugin, extension, integration tests, and unit entry points.
- pnpm lint checks TypeScript and formatting.
- pnpm build builds the plugin and extension.
- pnpm test:unit runs compiler-backed semantic/parser regressions, client/cancellation/configuration tests, and packaging failure cleanup.
- pnpm test builds and runs the editor integration suite.
- pnpm test:package builds a VSIX, installs it in an isolated profile, and runs the integration suite using the installed artifact directory as the test extension.

The reproducible editor baseline is VS Code 1.100.0 with Vue - Official 3.1.1. The normal editor run uses that editor's bundled compiler. CI also tests the current stable editor/latest Vue using workspace TypeScript. Linux editor tests require xvfb-run -a.

Environment selectors:

| Variable | Purpose |
| --- | --- |
| PRETTIFY_TEST_VSCODE_VERSION | Editor download version; default 1.100.0, or stable for the canary |
| PRETTIFY_TEST_VUE_EXTENSION_VERSION | Vue editor extension version; default 3.1.1, or latest |
| PRETTIFY_TEST_USE_WORKSPACE_TYPESCRIPT | Set to 1 to select the workspace compiler |
| PRETTIFY_TEST_VSCODE_PATH | Reuse a cached editor executable |
| PRETTIFY_TEST_EXTENSIONS_PATH | Reuse an already prepared isolated extensions directory |
| PRETTIFY_TEST_TYPESCRIPT_PATH | Alternate compiler module for test:unit |

Each editor run uses a disposable workspace copy. Settings updates and Vue edit regressions do not change tracked fixtures. Extension installation also uses explicit isolated profile and extension directories.

Hover assertions go through VS Code's real hover providers, as users see them, and also check the plugin's own rendering, so a matching native TypeScript hover cannot hide a Prettify regression. The hover suite also covers duplicate hiding, the omission marker, and the enabled setting. The unit suite additionally parses emitted types and checks mutual assignability for representative complete expansions. Fresh-install defaults are checked against the shared options definition.

The built formatter is loaded from development output by type-output assertions even during installed-VSIX runs; actual hover/copy integration tests exercise the installed bundled renderer. Run the build before invoking the test CLI directly.

Run editor suites sequentially on the same desktop: clipboard integration tests share the system clipboard. CI jobs use separate machines.

## Real-world suite (optional)

`pnpm test:real-world` (or `node scripts/test-real-world.js`) runs the plugin over large open-source projects. It is not part of `pnpm test` or PR CI; the `Real-world sweep` workflow runs it weekly, on demand, and on pull requests labelled `real-world` (never a required PR check). Releases require it: the release workflow calls it and does not publish unless it passes.

- Projects, pinned commits, install commands, tsconfig and sampled directories live in `test/real-world/projects.json`. Clones and installs (lifecycle scripts disabled) are kept in `.vscode-test/real-world/` and reused while the commit and install command are unchanged.
- The headless sweep (`test/real-world/sweep.ts`) loads each project's tsconfig into a LanguageService with the project's own TypeScript, attaches the plugin through its `create` entry, and requests a deterministic sample of identifiers the way the editor does: every position as a hover (`DEFAULT_OPTIONS`) and as a copy (`copy: true`), and every 8th distinct name as a full copy (`fullExpansion`).
- Each position fails on a plugin error, a request slower than the internal limit (`PREVIEW_LIMITS` / `FULL_COPY_LIMITS`, plus 250ms for the cooperative deadline), a "response size limit" truncation, or, for copies, `renderTypeInfo` output with parse diagnostics. Hovers keep their compact display (`Foo<...>`), so they are not parsed. Names that are not identifiers (`default`, `aria-label`) and `-Infinity` are accepted. Failures are grouped by shape, with examples.
- The report prints p50/p95/max latency, limit counts, and the slowest types; JSON reports and `summary.md` are written next to the clones.

Flags: `--project=<name>` (repeatable), `--positions=<n>` (default 3000, or `PRETTIFY_REAL_WORLD_POSITIONS`), `--prepare-only`, `--editor` (also run the editor smoke test: hover and both copy commands on the identifiers in the project's `smoke` entry), `--editor-only`.
