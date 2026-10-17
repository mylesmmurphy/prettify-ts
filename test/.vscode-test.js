const path = require('node:path');
const fs = require('node:fs');
const { defineConfig } = require('@vscode/test-cli');

const vueVersion = process.env.PRETTIFY_TEST_VUE_VERSION || "latest";

// Keep pinned Vue versions from updating while their compatibility tests run.
const userDataPath = path.join(__dirname, '../.vscode-test', `profile-${vueVersion}`);
fs.mkdirSync(path.join(userDataPath, 'User'), { recursive: true });
fs.writeFileSync(path.join(userDataPath, 'User/settings.json'), JSON.stringify({
  'extensions.autoUpdate': false,
  'extensions.autoCheckUpdates': false,
}));

module.exports = defineConfig({
  extensionDevelopmentPath: path.join(__dirname, '../packages/vscode-extension'),
  workspaceFolder: path.join(__dirname, './workspace'),
  launchArgs: [`--user-data-dir=${userDataPath}`],
  installExtensions: [vueVersion === "latest" ? "vue.volar" : `vue.volar@${vueVersion}`],


  // Use a dedicated out dir for test JS files
  files: ['out/**/*.test.js'],

  // Mocha options
  mocha: {
    ui: 'tdd',
    timeout: 45000,
    color: true
  }
});
