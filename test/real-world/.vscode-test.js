// Editor smoke test for the real-world suite; run through scripts/test-real-world.js --editor.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { defineConfig } = require("@vscode/test-cli");

const workspaceFolder = process.env.PRETTIFY_REAL_WORLD_DIR;
if (!workspaceFolder) throw new Error("PRETTIFY_REAL_WORLD_DIR is not set; run scripts/test-real-world.js --editor");
// Short path: the editor's IPC socket lives here and Unix sockets are limited to ~100 characters.
const userDataPath = path.join(os.tmpdir(), "prettify-rw-profile");
fs.mkdirSync(path.join(userDataPath, "User"), { recursive: true });
fs.writeFileSync(
  path.join(userDataPath, "User/settings.json"),
  JSON.stringify({ "extensions.autoUpdate": false, "extensions.autoCheckUpdates": false }),
);

module.exports = defineConfig({
  version: "stable",
  extensionDevelopmentPath: path.join(__dirname, "../../packages/vscode-extension"),
  workspaceFolder,
  launchArgs: [`--user-data-dir=${userDataPath}`, "--disable-extensions"],
  files: "../out-real-world/editor/smoke.test.js",
  env: {
    PRETTIFY_REAL_WORLD_DIR: workspaceFolder,
    PRETTIFY_REAL_WORLD_SMOKE: process.env.PRETTIFY_REAL_WORLD_SMOKE,
  },
  mocha: { ui: "tdd", timeout: 120000, color: true },
});
