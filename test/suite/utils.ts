import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

// Singleton document to be used across tests
let openDoc: vscode.TextDocument;

const workspacePath = path.join(__dirname, "../workspace");

/**
 * Opens a document in the test workspace.
 * Sets the shared `openDoc` variable to the opened document.
 * Waits until the TypeScript server provides the hover information.
 */
export async function openDocument(fileName: string): Promise<void> {
  const uri = vscode.Uri.file(path.join(workspacePath, fileName));

  const doc = await vscode.workspace.openTextDocument(uri);

  await vscode.window.showTextDocument(doc);

  // Wait for the TypeScript server to process the document
  // This is the simplest way to ensure the server is ready
  await new Promise((res) => setTimeout(res, 3000));

  openDoc = doc;
}

/**
 * Extension settings for Prettify TypeScript.
 */
type PrettifySettings = {
  enabled?: boolean;
  typeIndentation?: number;
  maxCharacters?: number;
  hidePrivateProperties?: boolean;
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

  const defaults: Required<PrettifySettings> = {
    enabled: true,
    typeIndentation: 4,
    maxCharacters: 20000,
    hidePrivateProperties: true,
    maxDepth: 2,
    maxProperties: 100,
    maxSubProperties: 5,
    maxUnionMembers: 15,
    maxFunctionSignatures: 5,
    skippedTypeNames: [],
    unwrapArrays: true,
    unwrapFunctions: true,
    unwrapGenericArgumentsTypeNames: ["Promise"],
  };

  const merged = { ...defaults, ...overrides };

  for (const key of Object.keys(merged) as (keyof PrettifySettings)[]) {
    await config.update(key, merged[key], vscode.ConfigurationTarget.Workspace);
  }
}

/**
 * Retrieves the hover information for a given keyword in the currently opened document.
 * @returns {Promise<string>} The prettified type string from the hover content with whitespace normalized.
 */
export async function getHover(keyword: string): Promise<string> {
  const position = openDoc.positionAt(openDoc.getText().indexOf(keyword) + 1);

  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    openDoc.uri,
    position,
  );
  assert.ok(hovers, "Expected hover results to be defined");
  assert.ok(hovers.length > 1, "Expected at least two hover results (TS Quick Info and Prettify)");

  const content = hovers[1]?.contents[0]; // Prettify will always be the second hover, TS Quick Info comes first
  assert.ok(content, "Expected hover content to be defined");

  const hover = typeof content === "string" ? content : content.value;

  // Extract the prettified type string
  assert.ok(typeof hover === "string", "Expected prettify hover content to be a string");

  return normalizeTypeString(hover);
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
 * Asserts that actual hover content matches the expected content
 * after normalization (e.g. whitespace and Markdown fences removed).
 */
export function assertHover(hover: string, expected: string): void {
  assert.strictEqual(
    hover,
    normalizeTypeString(expected),
    `Expected hover content to be "${expected}", but got "${hover}"`,
  );
}
