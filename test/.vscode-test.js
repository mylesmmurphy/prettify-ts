const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { defineConfig } = require('@vscode/test-cli');
const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } = require('@vscode/test-electron');

module.exports = defineConfig((async () => {
  const vueExtensionVersion = process.env.PRETTIFY_TEST_VUE_EXTENSION_VERSION || 'latest';
  const extension = vueExtensionVersion === 'latest' ? 'vue.volar' : `vue.volar@${vueExtensionVersion}`;
  const executable = await downloadAndUnzipVSCode('stable');
  const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(executable);
  // The standard test-cli installer can leave an older cached version selected.
  const windows = process.platform === 'win32';
  const installation = spawnSync(windows ? `"${cli}"` : cli, [...args, '--install-extension', extension, '--force'], {
    stdio: 'inherit',
    shell: windows,
  });
  if (installation.error) throw installation.error;
  if (installation.status !== 0) throw new Error('Failed to install the requested Vue editor extension');

  const userDataPath = path.join(__dirname, '../.vscode-test', `profile-vue-extension-${vueExtensionVersion}`);
  fs.mkdirSync(path.join(userDataPath, 'User'), { recursive: true });
  fs.writeFileSync(path.join(userDataPath, 'User/settings.json'), JSON.stringify({
    'extensions.autoUpdate': false,
    'extensions.autoCheckUpdates': false,
  }));

  return {
    extensionDevelopmentPath: path.join(__dirname, '../packages/vscode-extension'),
    workspaceFolder: path.join(__dirname, './workspace'),
    launchArgs: [`--user-data-dir=${userDataPath}`],
    files: ['out/**/*.test.js'],
    mocha: {
      ui: 'tdd',
      timeout: 45000,
      color: true,
    },
  };
})());
