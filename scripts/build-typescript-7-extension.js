// Builds the TypeScript 7 VS Code extension (TypeScriptTeam.native-preview) from TypeScript's source for the
// TypeScript 7 editor tests. The Marketplace release predates the extension API Prettify TS uses (expected with
// TypeScript 7.1); once a release has it, the tests can install the release instead.
//
// Usage: node scripts/build-typescript-7-extension.js [commit-or-branch]
// Defaults to the commit pinned in test/typescript-7.json. Prints the built extension directory.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { build } = require("esbuild");

const root = path.resolve(__dirname, "..");
const pinned = JSON.parse(fs.readFileSync(path.join(root, "test/typescript-7.json"), "utf8"));

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });
}

async function buildExtension(ref = pinned.extensionCommit) {
  const cache = path.join(root, ".vscode-test", "typescript-7-extension");
  const source = path.join(cache, "source");
  fs.mkdirSync(source, { recursive: true });
  if (!fs.existsSync(path.join(source, ".git"))) {
    run("git", ["init", "--quiet"], source);
    run("git", ["remote", "add", "origin", pinned.extensionRepository], source);
  }
  // Only the extension and the API package it imports from source are needed.
  run("git", ["sparse-checkout", "set", "--no-cone", "/packages/vscode-typescript/", "/packages/typescript/"], source);
  run("git", ["fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", ref], source);
  run("git", ["checkout", "--quiet", "--force", "FETCH_HEAD"], source);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
  const output = path.join(cache, commit);
  if (fs.existsSync(path.join(output, "dist/extension.bundle.js"))) return output;

  const extensionSource = path.join(source, "packages/vscode-typescript");
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionSource, "package.json"), "utf8"));
  const dependencies = path.join(cache, "dependencies-" + commit);
  fs.rmSync(dependencies, { recursive: true, force: true });
  fs.mkdirSync(dependencies, { recursive: true });
  fs.writeFileSync(path.join(dependencies, "package.json"), JSON.stringify({ private: true }));
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      ...Object.entries(manifest.dependencies ?? {}).map(([name, version]) => name + "@" + version),
    ],
    dependencies,
  );
  // The extension imports TypeScript's API package by name; resolve it to the checked-out source.
  const scope = path.join(dependencies, "node_modules/@typescript");
  fs.mkdirSync(scope, { recursive: true });
  fs.symlinkSync(path.join(source, "packages/typescript"), path.join(scope, "typescript"), "junction");

  const staging = output + ".tmp";
  fs.rmSync(staging, { recursive: true, force: true });
  await build({
    entryPoints: [path.join(extensionSource, "src/extension.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["vscode"],
    conditions: ["@typescript/source"],
    nodePaths: [path.join(dependencies, "node_modules")],
    outfile: path.join(staging, manifest.main),
    logLevel: "warning",
  });
  for (const name of ["package.json", "package.nls.json", "LICENSE", "README.md", "l10n"]) {
    const from = path.join(extensionSource, name);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(staging, name), { recursive: true });
  }
  fs.rmSync(dependencies, { recursive: true, force: true });
  fs.renameSync(staging, output);
  return output;
}

module.exports = { buildExtension };
if (require.main === module) {
  buildExtension(process.argv[2])
    .then((directory) => console.log(directory))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
