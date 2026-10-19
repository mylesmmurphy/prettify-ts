const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { defineConfig } = require("@vscode/test-cli");
const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } = require("@vscode/test-electron");

module.exports = defineConfig(
  (async () => {
    const root = path.join(__dirname, "..");
    // TypeScript 7 runs replace TS Server with the TypeScript 7 extension and run the TypeScript 7 suite instead.
    const tsgo = process.env.PRETTIFY_TEST_TSGO === "1";
    // The TypeScript 7 extension needs VS Code 1.126 or later.
    const editorVersion = process.env.PRETTIFY_TEST_VSCODE_VERSION || (tsgo ? "stable" : "1.100.0");
    const vueVersion = process.env.PRETTIFY_TEST_VUE_EXTENSION_VERSION || "3.1.1";
    const executable = process.env.PRETTIFY_TEST_VSCODE_PATH || (await downloadAndUnzipVSCode(editorVersion));
    const userDataPath = path.join(
      root,
      ".vscode-test",
      "profile-" + editorVersion + (tsgo ? "-tsgo" : "-vue-" + vueVersion),
    );
    const extensionsPath =
      process.env.PRETTIFY_TEST_EXTENSIONS_PATH ||
      path.join(root, ".vscode-test", tsgo ? "extensions-tsgo" : "extensions-vue-" + vueVersion);
    if (!process.env.PRETTIFY_TEST_EXTENSIONS_PATH && !tsgo) {
      const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(executable);
      const extension = vueVersion === "latest" ? "vue.volar" : "vue.volar@" + vueVersion;
      const windows = process.platform === "win32";
      const install = spawnSync(
        windows ? '"' + cli + '"' : cli,
        [
          ...args,
          "--user-data-dir=" + userDataPath,
          "--extensions-dir=" + extensionsPath,
          "--install-extension",
          extension,
          "--force",
        ],
        { stdio: "inherit", shell: windows },
      );
      if (install.error) throw install.error;
      if (install.status !== 0) throw new Error("Failed to install the requested Vue editor extension");
    }
    fs.mkdirSync(path.join(userDataPath, "User"), { recursive: true });
    fs.mkdirSync(extensionsPath, { recursive: true });
    const settings = { "extensions.autoUpdate": false, "extensions.autoCheckUpdates": false };
    if (process.env.PRETTIFY_TEST_USE_WORKSPACE_TYPESCRIPT === "1") {
      const sdk = path.join(root, "node_modules/typescript/lib");
      settings["typescript.tsdk"] = sdk;
      settings["js/ts.tsdk.path"] = sdk;
    }
    let typescript7Extension;
    if (tsgo) {
      const { buildExtension } = require("../scripts/build-typescript-7-extension");
      typescript7Extension =
        process.env.PRETTIFY_TEST_TS7_EXTENSION_PATH ||
        (await buildExtension(process.env.PRETTIFY_TEST_TS7_EXTENSION_REF));
      // The language server and its API client come from this TypeScript 7 installation (user settings are trusted).
      settings["js/ts.experimental.useTsgo"] = true;
      settings["js/ts.tsdk.path"] =
        process.env.PRETTIFY_TEST_TS7_PATH ||
        path.dirname(require.resolve("typescript-7/package.json", { paths: [path.join(root, "packages/core")] }));
    }
    fs.writeFileSync(path.join(userDataPath, "User/settings.json"), JSON.stringify(settings));
    // Tests change workspace configuration and Vue buffers. Always use disposable fixture copies.
    // A multi-root workspace, so tests can give the second folder its own settings.
    const workspacePath = path.join(userDataPath, "workspace");
    const secondFolderPath = path.join(userDataPath, "workspace-folder");
    for (const [from, to] of [
      ["workspace", workspacePath],
      ["workspace-folder", secondFolderPath],
    ]) {
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(path.join(__dirname, from), to, { recursive: true });
    }
    const workspaceFile = path.join(userDataPath, "prettify.code-workspace");
    fs.writeFileSync(
      workspaceFile,
      JSON.stringify({ folders: [{ path: "workspace" }, { path: "workspace-folder" }], settings: {} }),
    );
    process.env.PRETTIFY_TEST_WORKSPACE = workspacePath;
    // A reused extensions directory keeps replaced versions until VS Code cleans up the ones it marked obsolete.
    const obsoletePath = path.join(extensionsPath, ".obsolete");
    const obsolete = fs.existsSync(obsoletePath) ? JSON.parse(fs.readFileSync(obsoletePath, "utf8")) : {};
    const installed =
      process.env.PRETTIFY_TEST_PACKAGED === "1"
        ? fs
            .readdirSync(extensionsPath)
            .filter((name) => !obsolete[name])
            .map((name) => path.join(extensionsPath, name))
            .find((directory) => {
              const manifestPath = path.join(directory, "package.json");
              if (!fs.existsSync(manifestPath)) return false;
              const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
              return manifest.publisher === "MylesMurphy" && manifest.name === "prettify-ts";
            })
        : undefined;
    if (process.env.PRETTIFY_TEST_PACKAGED === "1" && !installed) throw new Error("Installed test artifact not found");
    const prettify = installed ?? path.join(root, "packages/vscode-extension");
    return {
      useInstallation: { fromPath: executable },
      extensionDevelopmentPath: typescript7Extension ? [prettify, typescript7Extension] : prettify,
      workspaceFolder: workspaceFile,
      launchArgs: ["--user-data-dir=" + userDataPath, "--extensions-dir=" + extensionsPath, "--skip-welcome"],
      env: {
        PRETTIFY_TEST_WORKSPACE: workspacePath,
        PRETTIFY_TEST_SECOND_FOLDER: secondFolderPath,
        PRETTIFY_TEST_VUE_EXTENSION_VERSION: vueVersion,
        PRETTIFY_TEST_USE_WORKSPACE_TYPESCRIPT: process.env.PRETTIFY_TEST_USE_WORKSPACE_TYPESCRIPT,
      },
      files: [tsgo ? "out/tsgo/*.test.js" : "out/*.test.js"],
      mocha: { ui: "tdd", timeout: 45000, color: true },
    };
  })(),
);
