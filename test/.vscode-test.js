const path = require("node:path");
const { defineConfig } = require("@vscode/test-cli");

module.exports = defineConfig({
  extensionDevelopmentPath: path.join(__dirname, "../packages/vscode-extension"),
  workspaceFolder: path.join(__dirname, "workspace"),
  installExtensions: ["vue.volar"],
  files: ["out/test/suite/**/*.test.js"],
  env: {
    VSCODE_TEST_ENV: "true",
    NODE_ENV: "test",
  },
  mocha: {
    ui: "tdd",
    timeout: 0,
    color: true,
  },
});
