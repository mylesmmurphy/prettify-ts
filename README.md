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

To prepare for publishing:

1. **Prepackage:**

   * Copies actual plugin files into the extension
   * Rewrites `workspace:*` to `*` for `vsce` compatibility

2. **Package:**

   * Runs `vsce package` to produce `.vsix`

3. **Postpackage:**

   * Reverts everything back for dev (restores `workspace:*` and symlinks)


## VSCode Debug Configs

Defined in `.vscode/launch.json`:

* **Run Extension**: Launches VSCode with the extension loaded for manual debugging
* **Attach to TSServer**: Debug the TypeScript language service plugin

Use the VSCode Run panel (Ctrl+Shift+D / Cmd+Shift+D) to start these sessions.

## License

[MIT](./LICENSE)

Happy coding!
