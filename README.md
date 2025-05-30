# Prettify TypeScript

**Get useful type information where you need it**

[![Installs](https://img.shields.io/vscode-marketplace/i/MylesMurphy.prettify-ts)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![GitHub Repo stars](https://img.shields.io/github/stars/mylesmmurphy/prettify-ts?style=social)](https://github.com/mylesmmurphy/prettify-ts)
[![Version](https://img.shields.io/vscode-marketplace/v/MylesMurphy.prettify-ts)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![License](https://img.shields.io/github/license/mylesmmurphy/prettify-ts)](https://github.com/mylesmmurphy/prettify-ts/blob/main/LICENSE)

Prettify TS is a Visual Studio Code extension that enhances your TypeScript development experience. It provides hover information for TypeScript types, classes, interfaces, and more, formatted in a more readable and configurable way.

## Installation

You can install Prettify TS from the following sources:

- **Visual Studio Code Marketplace**: [Prettify TS on VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
- **Open VSX Registry**: [Prettify TS on Open VSX](https://open-vsx.org/extension/MylesMurphy/prettify-ts)

## Developer Notes

This README is for Development of Prettify TS. The VSCode Extension README can be found [here](./packages/vscode-extension/README.md).

## Scripts

> **Note:** This project uses [pnpm](https://pnpm.io/) as its package manager. Please ensure you have pnpm installed globally (`npm install -g pnpm`) before running these scripts.

This project provides several scripts that you can use to manage the development process:

- `pnpm install`: Installs all the dependencies for the project. This command should be run after cloning the repository or whenever a new package is added to the `package.json` file.

- `pnpm build`: Compiles the TypeScript code in the project. This command should be run before testing the extension or preparing it for distribution.

- `pnpm package`: Packages the Visual Studio Code extension for distribution. This command should be run when you're ready to create a `.vsix` file that can be installed in Visual Studio Code.

You can run these commands from the terminal in the root directory of the project.

## Development and Debugging

In the `.vscode/launch.json` file, we have:

- **Run Extension**: Starts a new VS Code instance with the extension loaded. It runs the "build root" task before launching and allows attaching a debugger to the VSCode extension code.

- **Attach to TSServer**: Attaches the debugger to the TypeScript server running in the extension's context. Use this to debug the TypeScript server's Language Service Plugin.

You can execute these tasks in Visual Studio Code by navigating to the Run view (View > Run), selecting the desired task from the dropdown menu, and pressing the green play button.

## Monorepo Structure

This project is organized as a monorepo, meaning it hosts multiple packages within a single repository.

### Packages

The monorepo includes the following packages:

- `vscode-extension`: This package is the Visual Studio Code extension that integrates the TypeScript Plugin into the editor. It provides the user interface for interacting with Prettify TS.

- `typescript-plugin`: This package is a TypeScript language service plugin. It enhances the TypeScript language service with the capabilities of Prettify TS.

### Packaging

This monorepo uses pnpm workspaces to manage dependencies. During development, pnpm automatically symlinks local packages (like typescript-plugin) into the extension’s node_modules directory. This setup is ideal for debugging, as changes to the plugin are immediately reflected in the extension.

For packaging and publishing, the process is as follows:

1. Prepackage step: A script deletes the symlinked plugin from the extension’s node_modules and copies the actual built files and package.json into place. It also updates the extension’s package.json dependency on the plugin from "workspace:*" to "*". This ensures the VS Code extension packaging tool (vsce) includes the real dependency, not a symlink, and avoids pnpm workspace-specific version specifiers, which don't work with vsce.
2. Packaging: The extension is packaged using vsce, producing a .vsix file ready for distribution.
3. Postpackage step: The symlink is restored by re-installing dependencies with pnpm, and the dependency in package.json is reverted back to "workspace:*", returning the workspace to its development-ready state.

This approach ensures a smooth workflow for both development (with live symlinks) and packaging (with real files included).

## License

MIT
