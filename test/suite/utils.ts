import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";
type TypeInfo = { declaration: string; name: string; typeTree: unknown; compilerVersion?: string };

// Singleton document to be used across tests
let openDoc: vscode.TextDocument;

const workspacePath = process.env.PRETTIFY_TEST_WORKSPACE ?? path.join(__dirname, "../workspace");

/**
 * Opens a document in the test workspace.
 * Sets the shared `openDoc` variable to the opened document.
 * Waits until the TypeScript server provides the hover information.
 */
export async function openDocument(fileName: string): Promise<void> {
  const uri = vscode.Uri.file(path.join(workspacePath, fileName));

  const doc = await vscode.workspace.openTextDocument(uri);

  await vscode.window.showTextDocument(doc);

  openDoc = doc;
}

/** Wait for the plugin itself, so native hover cannot hide an initialization failure. */
export async function ensureTypeScriptServerReady(fileName: string, keyword: string): Promise<void> {
  await openDocument(fileName);
  const extension = vscode.extensions.getExtension("MylesMurphy.prettify-ts");
  assert.ok(extension, "Extension not found");
  await extension.activate();
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await getPrettifyTypeInfo(keyword, 0);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("The Prettify TypeScript plugin did not become ready.");
}

/**
 * Extension settings for Prettify TypeScript.
 */
type PrettifySettings = {
  enabled?: boolean;
  typeIndentation?: number;
  maxCharacters?: number;
  hidePrivateProperties?: boolean;
  treatUnderscoreAsPrivate?: boolean;
  maxDepth?: number;
  maxProperties?: number;
  maxSubProperties?: number;
  maxUnionMembers?: number;
  maxFunctionSignatures?: number;
  skippedTypeNames?: string[];
  unwrapArrays?: boolean;
  unwrapFunctions?: boolean;
  unwrapGenericArgumentsTypeNames?: string[];
};

/**
 * Applies the given settings to the Prettify TypeScript extension.
 * If a setting is not provided, it will use the default value.
 */
export async function applySettings(overrides: PrettifySettings = {}) {
  const config = vscode.workspace.getConfiguration("prettify-ts");

  // Read the contributed defaults so fresh-install behavior and tests cannot drift.
  const manifest = JSON.parse(
    await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(__dirname, "../../packages/vscode-extension/package.json"), "utf8"),
    ),
  ) as {
    contributes: { configuration: { properties: Record<string, { default: unknown }> } };
  };
  const defaults = Object.fromEntries(
    Object.entries(manifest.contributes.configuration.properties).map(([key, value]) => [
      key.replace("prettify-ts.", ""),
      value.default,
    ]),
  ) as Required<PrettifySettings>;

  const merged = { ...defaults, ...overrides };

  for (const key of Object.keys(merged) as (keyof PrettifySettings)[]) {
    await config.update(key, merged[key], vscode.ConfigurationTarget.Workspace);
  }
}

/**
 * Retrieves plugin/renderer output directly; UI provider flows have separate integration tests.
 * @returns The prettified type string with whitespace normalized.
 */
export async function getHover(keyword: string, characterOffset = 1): Promise<string[]> {
  const offset = openDoc.getText().indexOf(keyword);
  assert.ok(offset >= 0, `Fixture keyword not found: ${keyword}`);
  // Type assertions use the plugin directly: native hovers must not mask extraction regressions.
  // Actual provider registration and unsaved-document flows are covered in commands.test.ts.
  return [normalizeTypeString(await renderPrettifiedType(keyword, characterOffset))];
}

/**
 * Cleans up a TypeScript type string by removing specific Markdown fences and normalizing whitespace.
 * This function is used to ensure that the type string is in a clean format for comparison.
 */
function normalizeTypeString(input: string): string {
  let type = input;

  // Remove the specific TypeScript Markdown fences
  const leadingFence = "\n```typescript\n";
  const trailingFence = "\n\n```\n";

  if (type.startsWith(leadingFence)) {
    type = type.substring(leadingFence.length);
  }

  if (type.endsWith(trailingFence)) {
    type = type.substring(0, type.length - trailingFence.length);
  }

  type = type
    .replace(/\s+/g, " ") // Collapse all whitespace (including newlines/tabs) to single spaces
    .trim(); // Remove leading/trailing spaces

  // Remove a single trailing semicolon, if present
  if (type.endsWith(";")) {
    type = type.slice(0, -1).trim();
  }

  return type;
}

/**
 * Asserts that actual hover contents match the expected content
 * after normalization (e.g. whitespace and Markdown fences removed).
 */
export function assertHover(hovers: string[], expected: string): void {
  const normalizedExpected = normalizeTypeString(expected);
  assert.ok(
    hovers.map(normalizeTypeString).includes(normalizedExpected),
    `Expected hover content to be "${expected}", but got "${hovers.join(", ")}"`,
  );
}

/** Request the plugin directly so native TypeScript hover output cannot mask a regression. */
export async function getPrettifyTypeInfo(keyword: string, characterOffset = 1, overrides: PrettifySettings = {}) {
  const offset = openDoc.getText().indexOf(keyword);
  assert.ok(offset >= 0, `Fixture keyword not found: ${keyword}`);
  const position = openDoc.positionAt(offset + characterOffset);
  const response = await vscode.commands.executeCommand<{
    body?: { __prettifyResponse?: TypeInfo };
  }>(
    "typescript.tsserverRequest",
    "completionInfo",
    {
      file: openDoc.uri,
      line: position.line + 1,
      offset: position.character + 1,
      triggerCharacter: {
        meta: "prettify-type-info-request",
        options: {
          hidePrivateProperties: true,
          maxDepth: 3,
          maxProperties: 100,
          maxSubProperties: 5,
          maxUnionMembers: 15,
          maxFunctionSignatures: 5,
          skippedTypeNames: [],
          unwrapArrays: true,
          unwrapFunctions: true,
          unwrapGenericArgumentsTypeNames: ["Promise"],
          ...overrides,
        },
      },
    },
    { executionTarget: 0 },
  );
  const info = response?.body?.__prettifyResponse;
  assert.ok(info, "Expected a response from the Prettify TypeScript plugin");
  if (process.env.PRETTIFY_TEST_USE_WORKSPACE_TYPESCRIPT === "1") {
    assert.match(info.compilerVersion ?? "", /^5[.]9[.]/, "Expected the workspace TypeScript compiler");
  }
  return info;
}

/** Render the direct plugin response using the extension's built formatter. */
export async function renderPrettifiedType(keyword: string, characterOffset = 1): Promise<string> {
  const config = vscode.workspace.getConfiguration("prettify-ts");
  const overrides: PrettifySettings = {};
  for (const key of [
    "hidePrivateProperties",
    "treatUnderscoreAsPrivate",
    "maxDepth",
    "maxProperties",
    "maxSubProperties",
    "maxUnionMembers",
    "maxFunctionSignatures",
    "skippedTypeNames",
    "unwrapArrays",
    "unwrapFunctions",
    "unwrapGenericArgumentsTypeNames",
  ] as const) {
    Object.assign(overrides, { [key]: config.get(key) });
  }
  const info = await getPrettifyTypeInfo(keyword, characterOffset, overrides);
  // Load the same compiled formatter used by the extension, without requiring editor focus.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const formatter = require("../../packages/vscode-extension/out/stringify-type-tree") as {
    renderTypeInfo(info: TypeInfo, indentation: number): string;
  };
  return formatter.renderTypeInfo(info, 4);
}

export function getOpenDocument(): vscode.TextDocument {
  return openDoc;
}
