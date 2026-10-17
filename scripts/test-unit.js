const { buildSync } = require("esbuild");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
buildSync({
  entryPoints: [path.join(root, "test/unit/entry.ts"), path.join(root, "test/unit/editor-entry.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["vscode"],
  outdir: path.join(root, "test/out-unit"),
});
const result = spawnSync(
  process.execPath,
  [
    "--test",
    ...require("node:fs")
      .readdirSync(path.join(root, "test/unit"))
      .filter((name) => name.endsWith(".test.cjs"))
      .map((name) => path.join(root, "test/unit", name)),
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
