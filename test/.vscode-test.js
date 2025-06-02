const path = require('node:path');
const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  extensionDevelopmentPath: path.join(__dirname, '../packages/vscode-extension'),

  // Use a dedicated out dir for test JS files
  files: ['out/**/*.test.js'],

  // Mocha options
  mocha: {
    ui: 'tdd',
    timeout: 20000,
    color: true
  }
});
