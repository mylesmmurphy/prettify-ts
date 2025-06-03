import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

// Singleton document to be used across tests
let openDoc: vscode.TextDocument;

const workspacePath = path.join(__dirname, "../workspace");

/**
 * Opens a document in the test workspace.
 * Sets the shared `openDoc` variable to the opened document.
 */
export async function openDocument(fileName: string): Promise<void> {
  const uri = vscode.Uri.file(path.join(workspacePath, fileName));

  const doc = await vscode.workspace.openTextDocument(uri);

  await vscode.window.showTextDocument(doc);

  openDoc = doc;
}

/**
 * Retrieves the hover information for a given keyword in the currently opened document.
 * Waits until the TypeScript server provides the hover information.
 * @returns {Promise<string>} The prettified type string from the hover content with whitespace normalized.
 */
export async function getHover(keyword: string, timeout = 10000): Promise<string> {
  const position = openDoc.positionAt(openDoc.getText().indexOf(keyword));
  const start = Date.now();

  let hovers: vscode.Hover[];

  while (true) {
    hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", openDoc.uri, position);

    if (hovers && hovers.length > 1) break;

    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for tsserver hover");
    }

    await new Promise((res) => setTimeout(res, 250));
  }

  assert.ok(hovers, "Expected hover results to be defined");
  assert.ok(hovers.length > 0, "Expected at least one hover result");

  // Prettify hover content - Prettify will always be the second hover result, after TS Quick Info
  const content = hovers[1]?.contents[0];
  assert.ok(content, "Expected prettify hover content to be defined");

  // Extract the prettified type string
  const hover = typeof content === "string" ? content : content.value;
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
