const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { build } = require("esbuild");

const root = path.resolve(__dirname, "..");
const extension = path.join(root, "packages/vscode-extension");
const plugin = path.join(root, "packages/typescript-plugin");

async function packageExtension(outputPath) {
  const stage = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "prettify-ts-package-")));
  try {
    for (const name of ["README.md", "LICENSE", ".vscodeignore", "assets"]) {
      await fs.cp(path.join(extension, name), path.join(stage, name), { recursive: true });
    }
    const manifest = JSON.parse(await fs.readFile(path.join(extension, "package.json"), "utf8"));
    manifest.dependencies = { "@prettify-ts/typescript-plugin": manifest.version };
    delete manifest.devDependencies;
    delete manifest.scripts;
    await fs.writeFile(path.join(stage, "package.json"), JSON.stringify(manifest, null, 2));
    await build({
      entryPoints: [path.join(extension, "src/extension.ts")],
      bundle: true,
      minify: true,
      platform: "node",
      format: "cjs",
      external: ["vscode"],
      outfile: path.join(stage, "out/extension.js"),
    });
    const pluginStage = path.join(stage, "node_modules/@prettify-ts/typescript-plugin");
    await fs.mkdir(pluginStage, { recursive: true });
    const pluginManifest = JSON.parse(await fs.readFile(path.join(plugin, "package.json"), "utf8"));
    delete pluginManifest.devDependencies;
    delete pluginManifest.scripts;
    await fs.writeFile(path.join(pluginStage, "package.json"), JSON.stringify(pluginManifest, null, 2));
    await build({
      entryPoints: [path.join(plugin, "src/index.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "es2017",
      external: ["typescript"],
      outfile: path.join(pluginStage, "out/index.js"),
    });
    const vsce = require(path.join(extension, "node_modules/@vscode/vsce"));
    const destination = path.resolve(
      outputPath ?? path.join(extension, manifest.name + "-" + manifest.version + ".vsix"),
    );
    await vsce.createVSIX({ cwd: stage, packagePath: destination, dependencies: true });
    return destination;
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}
module.exports = { packageExtension };
if (require.main === module) {
  packageExtension(process.argv[2])
    .then((destination) => console.log(destination))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
