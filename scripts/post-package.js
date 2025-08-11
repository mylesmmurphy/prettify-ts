/**
 * Post Package Script
 * Removes the built TS Plugin to the Extension node_modules directory
 * and updates the dependency version in the extension's package.json
 */
const fs = require("fs-extra");
const path = require("node:path");

const extensionDir = path.resolve(__dirname, "../packages/vscode-extension");
const extensionNodeModules = path.join(extensionDir, "node_modules/@prettify-ts/typescript-plugin");

// Clean the target directory first
fs.removeSync(extensionNodeModules);

// Update dependency in extension's package.json
const extensionPkgPath = path.join(extensionDir, "package.json");
const extensionPkg = fs.readJsonSync(extensionPkgPath);

if (extensionPkg.dependencies && extensionPkg.dependencies["@prettify-ts/typescript-plugin"] === "*") {
  extensionPkg.dependencies["@prettify-ts/typescript-plugin"] = "workspace:*";
  fs.writeJsonSync(extensionPkgPath, extensionPkg, { spaces: 2 });
  console.log('⏪ Updated @prettify-ts/typescript-plugin dependency to "workspace:*" in vscode-extension/package.json');
}
