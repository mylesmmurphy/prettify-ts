/**
 * Post Build Script
 * Copies the built TS Plugin to the Extension node_modules directory
 */
const fs = require('fs-extra');
const path = require('node:path');

const pluginDir = path.resolve(__dirname, '../packages/typescript-plugin');
const extensionNodeModules = path.resolve(__dirname, '../packages/vscode-extension/node_modules/@prettify-ts/typescript-plugin');

// Clean the target directory first
fs.removeSync(extensionNodeModules);

fs.ensureDirSync(extensionNodeModules);
fs.copySync(path.join(pluginDir, 'package.json'), path.join(extensionNodeModules, 'package.json'));
fs.copySync(path.join(pluginDir, 'out'), path.join(extensionNodeModules, 'out'));
