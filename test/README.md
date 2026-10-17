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
