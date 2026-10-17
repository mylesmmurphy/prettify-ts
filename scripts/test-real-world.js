// Optional real-world end-to-end suite. Not part of `pnpm test` or PR CI.
//
//   node scripts/test-real-world.js [--project=<name>]... [--positions=<n>] [--prepare-only] [--editor] [--editor-only]
//
// Clones the projects in test/real-world/projects.json at their pinned commits, installs them with
// lifecycle scripts disabled, sweeps the TypeScript plugin over a deterministic sample of identifiers,
// and prints a latency and failure report. `--editor` also runs the VS Code smoke test.
const { buildSync } = require("esbuild");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cloneRoot = path.join(root, ".vscode-test/real-world");
const outDir = path.join(root, "test/out-real-world");
const config = JSON.parse(fs.readFileSync(path.join(root, "test/real-world/projects.json"), "utf8"));

const args = process.argv.slice(2);
const flag = (name) => args.includes("--" + name);
const values = (name) => args.filter((arg) => arg.startsWith(`--${name}=`)).map((arg) => arg.slice(name.length + 3));
const selected = values("project");
const projects = config.projects.filter((project) => !selected.length || selected.includes(project.name));
if (!projects.length) throw new Error("No project matches " + selected.join(", "));
const positions = Number(values("positions")[0] ?? process.env.PRETTIFY_REAL_WORLD_POSITIONS ?? 3000);

function run(command, commandArgs, options = {}) {
  console.log(`$ ${[command, ...commandArgs].join(" ")}`);
  const windows = process.platform === "win32";
  const result = spawnSync(windows ? `"${command}"` : command, commandArgs, {
    stdio: "inherit",
    shell: windows,
    ...options,
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

function git(cwd, ...gitArgs) {
  return spawnSync("git", gitArgs, { cwd, encoding: "utf8" }).stdout?.trim();
}

/** Shallow clone at the pinned commit and install once; later runs (and the CI cache) reuse both. */
function prepare(project) {
  const dir = path.join(cloneRoot, project.name);
  const marker = path.join(dir, ".prettify-real-world.json");
  const state = JSON.stringify({ commit: project.commit, install: project.install });
  if (
    fs.existsSync(marker) &&
    fs.readFileSync(marker, "utf8") === state &&
    git(dir, "rev-parse", "HEAD") === project.commit
  ) {
    console.log(`Reusing ${project.name} at ${project.commit.slice(0, 12)}`);
    return dir;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  run("git", ["init", "--quiet"], { cwd: dir });
  run("git", ["fetch", "--quiet", "--depth=1", project.repository, project.commit], { cwd: dir });
  run("git", ["-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"], { cwd: dir });
  const [command, ...installArgs] = project.install;
  run(command, installArgs, { cwd: dir });
  fs.writeFileSync(marker, state);
  return dir;
}

function build() {
  buildSync({
    entryPoints: [path.join(root, "test/real-world/sweep.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["typescript"],
    outdir: outDir,
    logLevel: "warning",
  });
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

function sweep(project, dir) {
  const reportPath = path.join(cloneRoot, `${project.name}.report.json`);
  const options = {
    name: project.name,
    tsconfig: project.tsconfig,
    include: project.include,
    positions,
    perFile: project.perFile ?? 60,
    fullCopyEvery: project.fullCopyEvery ?? 8,
    toleranceMs: project.toleranceMs ?? 250,
  };
  console.log(`\nSweeping ${project.name} (${positions} positions)`);
  const started = Date.now();
  run(process.execPath, [
    "--max-old-space-size=8192",
    path.join(outDir, "sweep.js"),
    dir,
    JSON.stringify(options),
    reportPath,
  ]);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.totalSeconds = (Date.now() - started) / 1000;
  return report;
}

function print(report) {
  const lines = [];
  lines.push(`\n## ${report.name}`);
  lines.push(
    `TypeScript ${report.typescript}; ${report.files} files, ${report.positions} positions; ` +
      `warm-up ${(report.warmupMs / 1000).toFixed(1)}s; total ${report.totalSeconds.toFixed(1)}s`,
  );
  for (const [mode, stats] of Object.entries(report.modes)) {
    const sorted = [...stats.latencies].sort((a, b) => a - b);
    const truncation = Object.entries(stats.truncation)
      .map(([reason, count]) => `${reason} ×${count}`)
      .join(", ");
    lines.push(
      `${mode.padEnd(9)} ${String(stats.requests).padStart(5)} requests, ${String(stats.responses).padStart(5)} types | ` +
        `p50 ${percentile(sorted, 0.5).toFixed(1)}ms  p95 ${percentile(sorted, 0.95).toFixed(1)}ms  ` +
        `max ${(sorted.at(-1) ?? 0).toFixed(0)}ms` +
        (truncation ? ` | limits: ${truncation}` : ""),
    );
  }
  lines.push("Slowest types:");
  for (const sample of report.slowest) {
    lines.push(
      `  ${sample.ms.toFixed(0).padStart(5)}ms ${sample.mode.padEnd(9)} ${sample.location}  ${sample.preview}`,
    );
  }
  if (report.failureCount) {
    lines.push(`FAILURES: ${report.failureCount}`);
    for (const group of report.failures) {
      lines.push(`  ${group.count} × ${group.kind}${group.signature ? ": " + group.signature : ""}`);
      for (const failure of group.examples.slice(0, 2)) {
        lines.push(`      ${failure.mode} ${failure.location} ${failure.name ?? ""}: ${failure.detail.split("\n")[0]}`);
      }
    }
  } else lines.push("No failures.");
  return lines.join("\n");
}

function editorSmoke(project, dir) {
  // Same as `pnpm build:debug`, without needing pnpm on PATH.
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  run(npm, ["run", "--silent", "build:debug"], { cwd: path.join(root, "packages/typescript-plugin") });
  run(npm, ["run", "--silent", "build"], { cwd: path.join(root, "packages/vscode-extension") });
  buildSync({
    entryPoints: [path.join(root, "test/real-world/editor/smoke.test.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["vscode"],
    outdir: path.join(outDir, "editor"),
    logLevel: "warning",
  });
  run(
    path.join(root, "node_modules/.bin/vscode-test"),
    ["--config", path.join(root, "test/real-world/.vscode-test.js")],
    {
      cwd: root,
      env: { PRETTIFY_REAL_WORLD_DIR: dir, PRETTIFY_REAL_WORLD_SMOKE: JSON.stringify(project.smoke) },
    },
  );
}

fs.mkdirSync(cloneRoot, { recursive: true });
const directories = new Map(projects.map((project) => [project.name, prepare(project)]));
if (flag("prepare-only")) process.exit(0);
let failed = 0;
const summaries = [];
if (!flag("editor-only")) {
  build();
  for (const project of projects) {
    const report = sweep(project, directories.get(project.name));
    failed += report.failureCount;
    summaries.push(print(report));
    console.log(summaries.at(-1));
  }
  const summary = "# Prettify TS real-world sweep\n" + summaries.join("\n");
  fs.writeFileSync(path.join(cloneRoot, "summary.md"), summary + "\n");
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "```\n" + summary + "\n```\n");
  console.log(`\nReports: ${path.relative(root, cloneRoot)}/*.report.json`);
}
if (flag("editor") || flag("editor-only")) {
  const smoke = projects.find((project) => project.smoke);
  if (!smoke) throw new Error("No selected project defines a smoke test");
  editorSmoke(smoke, directories.get(smoke.name));
}
if (failed) {
  console.error(`\n${failed} real-world failure(s).`);
  process.exitCode = 1;
}
