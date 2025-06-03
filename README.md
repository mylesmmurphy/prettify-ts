# Prettify TypeScript

**Get useful type information where you need it**

[![Installs](https://img.shields.io/vscode-marketplace/i/MylesMurphy.prettify-ts)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![GitHub Repo stars](https://img.shields.io/github/stars/mylesmmurphy/prettify-ts?style=social)](https://github.com/mylesmmurphy/prettify-ts)
[![Version](https://img.shields.io/vscode-marketplace/v/MylesMurphy.prettify-ts)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![License](https://img.shields.io/github/license/mylesmmurphy/prettify-ts)](https://github.com/mylesmmurphy/prettify-ts/blob/main/LICENSE)

Prettify TS is a Visual Studio Code extension that enhances your TypeScript development experience. It provides hover information for TypeScript types, classes, interfaces, and more, formatted in a more readable and configurable way.

---

## 🚀 Installation

Install via the VSCode Marketplace:

* [Prettify TS on VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
* [Prettify TS on Open VSX](https://open-vsx.org/extension/MylesMurphy/prettify-ts)

---

## 🛠 Developer Notes

This README is for developing Prettify TS. The extension README (shown on the Marketplace) is [here](./packages/vscode-extension/README.md).

---

## 📦 Scripts

> **Note:** `pnpm` is required. [Install it here](https://pnpm.io/installation).

```bash
pnpm install      # Installs all dependencies
pnpm test         # Builds and runs the extension test suite
pnpm build        # Compiles the codebase
pnpm package      # Builds + prepares the VSIX package for publishing
```

You do **not** need to build manually — `pnpm test` handles build steps automatically.

---

## 🧪 Testing

The full integration test suite lives in `test/`. For more info on the test layout, debugging instructions, and hover validation strategy, see the [Test README](./test/README.md).

---

## 📁 Monorepo Structure

This repo uses [pnpm workspaces](https://pnpm.io/workspaces) to manage multiple packages:

```
.
├── packages/
│   ├── typescript-plugin/     # TypeScript language service plugin
│   └── vscode-extension/      # VSCode extension host + UI
└── test/                      # Full integration test suite
```

### ⚙️ Development Workflow

During development, pnpm automatically symlinks the plugin into the extension’s `node_modules` for live debugging.

### 📦 Packaging Workflow

To prepare for publishing:

1. **Prepackage:**

   * Copies actual plugin files into the extension
   * Rewrites `workspace:*` to `*` for `vsce` compatibility

2. **Package:**

   * Runs `vsce package` to produce `.vsix`

3. **Postpackage:**

   * Reverts everything back for dev (restores `workspace:*` and symlinks)

---

## 🧩 VSCode Debug Configs

Defined in `.vscode/launch.json`:

* **Run Extension**: Launches VSCode with the extension loaded for manual debugging
* **Attach to TSServer**: Debug the TypeScript language service plugin

Use the VSCode Run panel (Ctrl+Shift+D / Cmd+Shift+D) to start these sessions.

---

## 📝 License

[MIT](./LICENSE)

---

Happy coding! 🎉
