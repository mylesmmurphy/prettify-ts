const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } = require("@vscode/test-electron");
const { packageExtension } = require("./package");

async function main() {
  const root = path.resolve(__dirname, "..");
  const vsix = process.argv[2] ? path.resolve(process.argv[2]) : await packageExtension();
  const executable =
    process.env.PRETTIFY_TEST_VSCODE_PATH ||
    (await downloadAndUnzipVSCode(process.env.PRETTIFY_TEST_VSCODE_VERSION || "1.100.0"));
  const extensions = path.join(root, ".vscode-test", "packaged-extensions");
  const profile = path.join(root, ".vscode-test", "packaged-install-profile");
  const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(executable);
  const windows = process.platform === "win32";
  function install(extension) {
    const result = spawnSync(
      windows ? '"' + cli + '"' : cli,
      [
        ...args,
        "--user-data-dir=" + profile,
        "--extensions-dir=" + extensions,
        "--install-extension",
        extension,
        "--force",
      ],
      { stdio: "inherit", shell: windows },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("Installation failed: " + extension);
  }
  install(vsix);
  const vue = process.env.PRETTIFY_TEST_VUE_EXTENSION_VERSION || "3.1.1";
  install(vue === "latest" ? "vue.volar" : "vue.volar@" + vue);
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/@vscode/test-cli/out/bin.mjs"), "--config", path.join(root, "test/.vscode-test.js")],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PRETTIFY_TEST_VSCODE_PATH: executable,
        PRETTIFY_TEST_EXTENSIONS_PATH: extensions,
        PRETTIFY_TEST_PACKAGED: "1",
        PRETTIFY_TEST_VUE_EXTENSION_VERSION: vue,
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Installed VSIX tests failed");
  console.log("Verified installed VSIX: " + vsix);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
