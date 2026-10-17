# Prettify TypeScript

**Get useful type information where you need it**

[![Installs](https://badgen.net/vs-marketplace/i/MylesMurphy.prettify-ts)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![GitHub Repo stars](https://img.shields.io/github/stars/mylesmmurphy/prettify-ts?style=social)](https://github.com/mylesmmurphy/prettify-ts)
[![Version](https://badgen.net/vs-marketplace/v/MylesMurphy.prettify-ts)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![CI](https://github.com/mylesmmurphy/prettify-ts/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mylesmmurphy/prettify-ts/actions/workflows/ci.yml)
[![License](https://badgen.net/static/license/MIT/blue)](https://github.com/mylesmmurphy/prettify-ts/blob/main/LICENSE)

Prettify TS is a Visual Studio Code extension that enhances your TypeScript development experience. It provides hover information for TypeScript types, classes, interfaces, and more, formatted in a more readable and configurable way.


## Installation

Install via the VSCode Marketplace:

* [Prettify TS on VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
* [Prettify TS on Open VSX](https://open-vsx.org/extension/MylesMurphy/prettify-ts)


## Developer Notes

This README is for developing Prettify TS. The extension README (shown on the Marketplace) is [here](./packages/vscode-extension/README.md).


## Scripts

Use Node.js 24 (`nvm use`) and the pnpm version pinned in `package.json`. Enable Corepack with `corepack enable`, or [install the pinned pnpm version](https://pnpm.io/installation).

TypeScript is kept on the 5.9 line while the language service plugin relies on the JavaScript compiler API. New compiler major versions require a separate compatibility review.

```bash
pnpm install      # Installs all dependencies
pnpm typecheck    # Checks the plugin, extension, and test types
pnpm lint         # Checks code style and lint rules
pnpm test         # Builds and runs the extension test suite
pnpm build        # Compiles the codebase
pnpm package      # Builds + prepares the VSIX package for publishing
```

You do **not** need to build manually — `test` and `package` handles build steps automatically.


## Testing

The full integration test suite lives in `test/`. For more info on the test layout, debugging instructions, and hover validation strategy, see the [Test README](./test/README.md).


## Monorepo Structure

This repo uses [pnpm workspaces](https://pnpm.io/workspaces) to manage multiple packages:

```
.
├── packages/
│   ├── typescript-plugin/     # TypeScript language service plugin
│   └── vscode-extension/      # VSCode extension host + UI
└── test/                      # Full integration test suite
└── scripts/                   # Utility scripts for development, building, or CI
```


### Development Workflow

During development, pnpm automatically symlinks the plugin into the extension’s `node_modules` for live debugging.


### Packaging Workflow

Run pnpm package to build a VSIX. Packaging stages the manifest, bundle, assets, and plugin in a temporary directory and removes that directory on success or failure. It never rewrites the checkout manifest or replaces workspace dependency symlinks.

Run pnpm test:package to install the generated VSIX in an isolated editor profile and run the integration suite against the installed extension. Tests use a disposable copy of the workspace fixtures. Pass a path (`node scripts/test-package.js path/to/file.vsix`) to test an existing VSIX instead of packaging a new one.

### Release Workflow

Pushing a `v*` tag runs [`.github/workflows/release.yml`](./.github/workflows/release.yml). It fails if the tag does not match the version in `packages/vscode-extension/package.json`, runs the CI checks, builds the VSIX once, runs the installed-VSIX tests against that file, and uploads it as an artifact. The [real-world sweep](./test/README.md#real-world-suite-optional) runs in parallel and must also pass. After approval, the `publish` job publishes that same artifact to the VS Code Marketplace and Open VSX, then creates a GitHub release with the VSIX attached.

To release:

1. Bump `version` in `packages/vscode-extension/package.json` (and the plugin package if it changed), then merge to `main`.
2. Tag the release commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. When the `verify` and `real-world` jobs pass, approve the `release` environment deployment in the workflow run.

One-time setup:

1. Create a VS Code Marketplace personal access token (Azure DevOps, organization **All accessible organizations**, scope **Marketplace → Manage**) for the `MylesMurphy` publisher, and an [Open VSX](https://open-vsx.org/user-settings/tokens) access token.
2. Add them as repository secrets named `VSCE_PAT` and `OVSX_PAT`. Open VSX publishing is skipped when `OVSX_PAT` is not set.
3. Create a `release` environment (Settings → Environments) with required reviewers.

### Correctness and compatibility

The minimum supported editor is VS Code 1.100.0. CI exercises that editor with Vue - Official 3.1.1 and its bundled compiler, plus the current editor/Vue with workspace TypeScript. Compiler-backed regression tests also cover type equivalence, mapped modifiers, generic signatures, cancellation, bounded recursive expansion, and packaging failure cleanup.

Run pnpm test:unit for the compiler and client regression suite. See [the audit coverage checklist](./docs/audit-fixes.md) for the issues covered by this change.

## VSCode Debug Configs

Defined in `.vscode/launch.json`:

* **Run Extension**: Launches VSCode with the extension loaded for manual debugging
* **Attach to TSServer**: Debug the TypeScript language service plugin

Use the VSCode Run panel (Ctrl+Shift+D / Cmd+Shift+D) to start these sessions.

## License

[MIT](./LICENSE)

Happy coding!
