const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
test("a failed packaging attempt removes staging and preserves manifest and workspace symlink", async () => {
  const manifest = path.resolve(__dirname, "../../packages/vscode-extension/package.json");
  const plugin = path.resolve(__dirname, "../../packages/vscode-extension/node_modules/@prettify-ts/typescript-plugin");
  const original = await fs.readFile(manifest, "utf8");
  const link = await fs.readlink(plugin);
  const vsce = require("../../packages/vscode-extension/node_modules/@vscode/vsce");
  const create = vsce.createVSIX;
  let stage;
  vsce.createVSIX = async (options) => {
    stage = options.cwd;
    throw new Error("simulated packaging failure");
  };
  try {
    await assert.rejects(
      require("../../scripts/package").packageExtension(
        require("node:path").join(require("node:os").tmpdir(), "unused.vsix"),
      ),
      /simulated packaging failure/,
    );
    assert.ok(stage);
    await assert.rejects(fs.stat(stage), { code: "ENOENT" });
    assert.equal(await fs.readFile(manifest, "utf8"), original);
    assert.equal(await fs.readlink(plugin), link);
  } finally {
    vsce.createVSIX = create;
  }
});
