import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

suite("Hover Test", () => {
  test("shows hover content for a TypeScript type", async () => {
    const uri = vscode.Uri.file(path.join(__dirname, "../workspace/index.ts"));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);

    const position = new vscode.Position(2, 7);

    // Trigger hover provider
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      doc.uri,
      position,
    );

    assert.ok(hovers);
    assert.ok(hovers.length > 0, "Expected at least one hover result");

    const contents = hovers
      .map((h) => h.contents.map((c) => (typeof c === "string" ? c : c.value)).join("\n"))
      .join("\n");

    console.log("Hover content:", contents);
    assert.ok(contents.includes("foo"), "Expected hover to include variable name");
  });
});
