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

  openDoc = doc;
}

/**
 * Ensures the TypeScript language server is fully initialized and ready to provide rich type information.
 *
 * This function works by:
 * 1. Opening a 'canary.ts' file which contains a known type (`ServerReadinessProbe`).
 * 2. Activating the 'prettify-ts' extension.
 * 3. Repeatedly triggering a hover on the `ServerReadinessProbe` type.
 * 4. Waiting until the hover content no longer shows a "loading..." message and includes
 *    detailed metadata (specifically, "a?: string" from the `ServerReadinessProbe` type).
 *    This indicates that the server has fully parsed the AST and is operational.
 *
 * @remarks
 * This method of waiting for server readiness by inspecting hover content is a heuristic.
 * More robust or direct methods for determining server readiness should be explored
 * for better test stability and reliability.
 */
export async function ensureTypeScriptServerReady(): Promise<void> {
  await openDocument("canary.ts"); // Assumes canary.ts contains 'ServerReadinessProbe' type

  console.log("Waiting for TypeScript server to be ready...");

  const extensionId = "MylesMurphy.prettify-ts";
  const extension = vscode.extensions.getExtension(extensionId);

  assert.ok(extension, "Extension not found");
  await extension.activate();
  assert.ok(extension.isActive, "Extension failed to activate");

  if (!openDoc) {
    throw new Error("Document 'canary.ts' was not opened successfully.");
  }

  const position = openDoc.positionAt(openDoc.getText().indexOf("ServerReadinessProbe"));

  let attempt = 0;
  const maxAttempts = 60; // Approx 30 seconds if each attempt is 500ms
  const retryDelay = 500; // ms

  while (attempt < maxAttempts) {
    attempt++;
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      openDoc.uri,
      position,
    );

    // We are interested in the first hover provider, which is TypeScript's native hover.
    const content = hovers[0]?.contents[0];
    if (!content) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      continue;
    }

    const hover = typeof content === "string" ? content : content.value;

    // Check for specific content indicating the server is ready and AST is parsed
    // "a?: string" is part of the ServerReadinessProbe type definition in canary.ts
    if (!hover.includes("loading") && hover.includes("a?: string")) {
      console.log(`TypeScript server is ready after ${attempt} attempts.`);
      return; // Server is ready
    }

    if (attempt % 10 === 0) {
      // Log progress occasionally
      console.log(`Still waiting for TS server... Attempt ${attempt}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
  throw new Error(`TypeScript server did not become ready after ${maxAttempts} attempts.`);
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
export async function getHover(keyword: string): Promise<string[]> {
  const position = openDoc.positionAt(openDoc.getText().indexOf(keyword) + 1);

  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    openDoc.uri,
    position,
  );

  assert.ok(hovers, "Expected hover results to be defined");
  assert.ok(hovers.length > 0, "Expected at least one hover result");

  return hovers
    .map((hover) => hover.contents[0])
    .filter((content) => content !== undefined)
    .map((content) => (typeof content === "string" ? content : content.value))
    .map(normalizeTypeString); // Normalize each hover content type string
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
    hovers.includes(normalizedExpected),
    `Expected hover content to be "${expected}", but got "${hovers.join(", ")}"`,
  );
}
