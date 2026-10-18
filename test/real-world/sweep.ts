/**
 * Headless real-world sweep: runs the Prettify TS plugin over a cloned project without an editor.
 * Usage: node test/out-real-world/sweep.js <project-dir> <options-json> <report-json>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import type * as ts from "typescript";

import init from "../../packages/typescript-plugin/src";
import { DEFAULT_OPTIONS, FULL_COPY_LIMITS, PREVIEW_LIMITS } from "../../packages/core/src/options";
import type { PrettifyOptions, PrettifyRequest, PrettifyResponse } from "../../packages/typescript-plugin/src/request";
import type { TypeInfo } from "../../packages/core/src/types";
import { renderTypeInfo, renderTypeParts } from "../../packages/core/src/stringify";

export type SweepOptions = {
  name: string;
  tsconfig: string;
  include?: string[];
  /** Total identifier positions to request in hover mode. */
  positions: number;
  /** At most this many positions per file, spread evenly, so the sample covers many files. */
  perFile: number;
  /** Every Nth hover position is also requested as a full copy. */
  fullCopyEvery: number;
  /** Cooperative deadlines are checked between compiler calls, so allow one call of overrun. */
  toleranceMs: number;
};

/** hover: what the hover provider requests. copy / full-copy: what the two copy commands request. */
type Mode = "hover" | "copy" | "full-copy";

const REQUEST_OPTIONS: Record<Mode, PrettifyOptions> = {
  hover: DEFAULT_OPTIONS,
  copy: { ...DEFAULT_OPTIONS, copy: true },
  "full-copy": { ...DEFAULT_OPTIONS, fullExpansion: true, copy: true },
};

export type Failure = { mode: Mode; location: string; name?: string; kind: string; detail: string };

/** Failures with the same kind and shape (for example every `Foo<...>` parse error) are reported together. */
export type FailureGroup = { kind: string; signature: string; count: number; examples: Failure[] };

export type Sample = { mode: Mode; location: string; name: string; ms: number; preview: string };

export type SweepReport = {
  name: string;
  typescript: string;
  files: number;
  positions: number;
  warmupMs: number;
  modes: Record<Mode, { requests: number; responses: number; latencies: number[]; truncation: Record<string, number> }>;
  slowest: Sample[];
  failures: FailureGroup[];
  failureCount: number;
};

const EXAMPLES_PER_GROUP = 5;
const SLOWEST = 10;

function hash(text: string): number {
  // FNV-1a: a stable order that does not depend on the file system or the compiler's file order.
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** The project's own compiler, as an editor using the workspace version would load it. */
function loadTypeScript(projectDir: string): typeof ts {
  try {
    return createRequire(path.join(projectDir, "package.json"))("typescript") as typeof ts;
  } catch {
    return createRequire(__filename)("typescript") as typeof ts;
  }
}

function createLanguageService(typescript: typeof ts, projectDir: string, tsconfig: string) {
  const configPath = path.resolve(projectDir, tsconfig);
  const parsed = typescript.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...typescript.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(typescript.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    },
  );
  if (!parsed) throw new Error("Could not read " + configPath);
  const snapshots = new Map<string, ts.IScriptSnapshot | undefined>();
  const sys = typescript.sys;
  const host: ts.LanguageServiceHost & { useSourceOfProjectReferenceRedirect(): boolean } = {
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => parsed.fileNames,
    getProjectReferences: () => parsed.projectReferences,
    // Internal host hook: tsserver resolves references to their sources rather than built declarations.
    useSourceOfProjectReferenceRedirect: () => true,
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName) => {
      if (!snapshots.has(fileName)) {
        const text = typescript.sys.readFile(fileName);
        snapshots.set(fileName, text === undefined ? undefined : typescript.ScriptSnapshot.fromString(text));
      }
      return snapshots.get(fileName);
    },
    getCurrentDirectory: () => projectDir,
    getDefaultLibFileName: (options) => typescript.getDefaultLibFilePath(options),
    fileExists: (fileName) => sys.fileExists(fileName),
    readFile: (fileName, encoding) => sys.readFile(fileName, encoding),
    readDirectory: (...args) => sys.readDirectory(...args),
    directoryExists: (directory) => sys.directoryExists(directory),
    getDirectories: (directory) => sys.getDirectories(directory),
    realpath: (fileName) => sys.realpath?.(fileName) ?? fileName,
  };
  return typescript.createLanguageService(host, typescript.createDocumentRegistry());
}

function collectIdentifiers(typescript: typeof ts, sourceFile: ts.SourceFile, limit: number): ts.Identifier[] {
  const identifiers: ts.Identifier[] = [];
  const visit = (node: ts.Node) => {
    if (typescript.isIdentifier(node)) identifiers.push(node);
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (identifiers.length <= limit) return identifiers;
  const step = identifiers.length / limit;
  return Array.from({ length: limit }, (_, index) => identifiers[Math.floor(index * step)]!);
}

function parse(typescript: typeof ts, text: string): readonly ts.Diagnostic[] {
  const file = typescript.createSourceFile("rendered.ts", text, typescript.ScriptTarget.Latest, true);
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
}

/**
 * Copy output must be pasteable, with three accepted exceptions:
 * - `typeof import("x"): ...` is a display-only header, so only its type is checked;
 * - names that are not identifiers (`default`, `export`, `aria-label`) are shown as written, so a placeholder is checked;
 * - `-Infinity` is a type the compiler prints but TypeScript has no syntax for.
 */
function parseErrors(typescript: typeof ts, info: TypeInfo): { detail: string; signature: string }[] {
  const { declaration, type } = renderTypeParts(info, 4);
  let text = declaration.startsWith("typeof import(") ? "type Rendered = " + type : renderTypeInfo(info, 4);
  text = text.replace(/(?<![\w$.])-Infinity\b/g, "number");
  let diagnostics = parse(typescript, text);
  if (diagnostics.length && parse(typescript, `let ${info.name};`).length && declaration.includes(info.name)) {
    text = text.replace(info.name, "Rendered");
    diagnostics = parse(typescript, text);
  }
  return diagnostics.map((diagnostic) => {
    const message = typescript.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    const start = diagnostic.start ?? 0;
    // Collapse names so one rendering defect on many types forms one group.
    const shape = text
      .slice(Math.max(0, start - 2), start + 5)
      .replace(/[A-Za-z_$][\w$]*/g, "x")
      .replace(/\d+/g, "n");
    return {
      detail: `${message} at ${start}: ${JSON.stringify(text.slice(Math.max(0, start - 40), start + 40))}`,
      signature: `${message} near ${JSON.stringify(shape)}`,
    };
  });
}

export function sweep(projectDir: string, options: SweepOptions): SweepReport {
  const typescript = loadTypeScript(projectDir);
  const languageService = createLanguageService(typescript, projectDir, options.tsconfig);
  const logs: string[] = [];
  const project = {
    projectService: { logger: { info: (message: string) => logs.push(message) } },
    getCancellationToken: () => ({ isCancellationRequested: () => false }),
  };
  const plugin = init({ typescript }).create({ languageService, project } as unknown as ts.server.PluginCreateInfo);

  const report: SweepReport = {
    name: options.name,
    typescript: typescript.version,
    files: 0,
    positions: 0,
    warmupMs: 0,
    modes: {
      hover: { requests: 0, responses: 0, latencies: [], truncation: {} },
      copy: { requests: 0, responses: 0, latencies: [], truncation: {} },
      "full-copy": { requests: 0, responses: 0, latencies: [], truncation: {} },
    },
    slowest: [],
    failures: [],
    failureCount: 0,
  };
  const groups = new Map<string, FailureGroup>();
  const fail = (failure: Failure, signature = "") => {
    report.failureCount++;
    const key = failure.kind + "\0" + signature;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { kind: failure.kind, signature, count: 0, examples: [] }));
    group.count++;
    if (group.examples.length < EXAMPLES_PER_GROUP) group.examples.push(failure);
  };

  let started = performance.now();
  const program = languageService.getProgram();
  if (!program) throw new Error("No program for " + options.tsconfig);
  report.warmupMs += performance.now() - started;

  const relative = (fileName: string) => path.relative(projectDir, fileName).split(path.sep).join("/");
  const files = program
    .getRootFileNames()
    .map(relative)
    .filter((name) => !name.startsWith("..") && !name.includes("node_modules/") && /\.[cm]?tsx?$/.test(name))
    .filter((name) => !options.include?.length || options.include.some((prefix) => name.startsWith(prefix)))
    .sort((a, b) => hash(a) - hash(b) || a.localeCompare(b));
  if (!files.length) throw new Error("No source files matched the project's include prefixes");

  const request = (fileName: string, node: ts.Identifier, mode: Mode, sourceFile: ts.SourceFile) => {
    const limits = mode === "full-copy" ? FULL_COPY_LIMITS : PREVIEW_LIMITS;
    const requestOptions = REQUEST_OPTIONS[mode];
    const triggerCharacter: PrettifyRequest = { meta: "prettify-type-info-request", options: requestOptions };
    const position = node.getStart(sourceFile) + Math.floor(node.text.length / 2);
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
    const location = `${relative(fileName)}:${line + 1}:${character + 1}`;
    const stats = report.modes[mode];
    const logStart = logs.length;
    stats.requests++;

    let response: PrettifyResponse | undefined;
    const start = performance.now();
    try {
      response = plugin.getCompletionsAtPosition(fileName, position, {
        triggerCharacter: triggerCharacter as unknown as ts.CompletionsTriggerCharacter,
      });
    } catch (error) {
      fail({ mode, location, name: node.text, kind: "plugin threw", detail: String((error as Error)?.stack ?? error) });
      return;
    }
    const ms = performance.now() - start;
    stats.latencies.push(ms);

    for (const message of logs.slice(logStart)) {
      if (message.startsWith("Prettify analysis failed"))
        fail({ mode, location, name: node.text, kind: "plugin error", detail: message });
    }
    if (ms > limits.milliseconds + options.toleranceMs) {
      fail({
        mode,
        location,
        name: node.text,
        kind: "time limit",
        detail: `${ms.toFixed(0)}ms > ${limits.milliseconds}ms`,
      });
    }

    const info = response?.__prettifyResponse;
    if (!info) return;
    stats.responses++;
    for (const reason of info.truncationReasons ?? []) stats.truncation[reason] = (stats.truncation[reason] ?? 0) + 1;
    if (info.truncationReasons?.includes("response size limit")) {
      fail({ mode, location, name: info.name, kind: "response size limit", detail: info.truncationReasons.join(", ") });
    }

    let preview = "";
    try {
      const rendered = renderTypeInfo(info, 4);
      preview = rendered.replace(/\s+/g, " ").slice(0, 120);
      // Hovers keep the compact display (`Foo<...>`, `{ ... 2 more }`); only copies must parse.
      const [first, ...rest] = mode === "hover" ? [] : parseErrors(typescript, info);
      if (first) {
        const reasons = info.truncationReasons?.length ? ` [limits: ${info.truncationReasons.join(", ")}]` : "";
        const more = rest.length ? ` (+${rest.length} more)` : "";
        fail(
          { mode, location, name: info.name, kind: "parse error", detail: first.detail + more + reasons },
          first.signature,
        );
      }
    } catch (error) {
      fail({ mode, location, name: info.name, kind: "render threw", detail: String((error as Error)?.stack ?? error) });
    }

    report.slowest.push({ mode, location, name: info.name, ms, preview });
    report.slowest.sort((a, b) => b.ms - a.ms);
    report.slowest.length = Math.min(report.slowest.length, SLOWEST);
  };

  // Full copies of the same name (for example a test helper on every line) add time but no coverage.
  const fullCopied = new Set<string>();
  let fullCopyDue = 0;

  for (const name of files) {
    if (report.positions >= options.positions) break;
    const fileName = path.join(projectDir, name);
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) continue;
    // An open editor has already checked the file; measure the plugin, not the first type check.
    started = performance.now();
    languageService.getSemanticDiagnostics(fileName);
    report.warmupMs += performance.now() - started;
    report.files++;
    const budget = Math.min(options.perFile, options.positions - report.positions);
    for (const node of collectIdentifiers(typescript, sourceFile, budget)) {
      request(fileName, node, "hover", sourceFile);
      request(fileName, node, "copy", sourceFile);
      if (report.positions % options.fullCopyEvery === 0) fullCopyDue++;
      if (fullCopyDue && !fullCopied.has(node.text)) {
        fullCopied.add(node.text);
        fullCopyDue--;
        request(fileName, node, "full-copy", sourceFile);
      }
      report.positions++;
    }
  }
  report.failures = [...groups.values()].sort((a, b) => b.count - a.count);
  return report;
}

if (require.main === module) {
  const [projectDir, optionsJson, reportPath] = process.argv.slice(2);
  if (!projectDir || !optionsJson || !reportPath) {
    throw new Error("Usage: sweep.js <project-dir> <options-json> <report-json>");
  }
  const report = sweep(path.resolve(projectDir), JSON.parse(optionsJson) as SweepOptions);
  fs.writeFileSync(reportPath, JSON.stringify(report));
}
