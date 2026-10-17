import * as assert from "node:assert";
import * as vscode from "vscode";
import { applySettings, ensureTypeScriptServerReady } from "./utils";

suite("Editor commands and unsaved documents", () => {
  suiteSetup(async () => ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe"));
  setup(async () => applySettings({ maxDepth: 3 }));
  teardown(async () => applySettings());

  test("toggle updates an effective workspace override", async () => {
    const config = vscode.workspace.getConfiguration("prettify-ts");
    await config.update("enabled", false, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand("prettify-ts.toggle", true);
    assert.strictEqual(vscode.workspace.getConfiguration("prettify-ts").get("enabled"), true);
    await vscode.commands.executeCommand("prettify-ts.toggle");
    assert.strictEqual(vscode.workspace.getConfiguration("prettify-ts").get("enabled"), false);
  });

  test("untitled documents provide expanded hover and copied function types", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "typescript",
      content:
        "type Item = { nested: { value: string } }; declare const probe: Item; type Callback = <T>(value: T) => T;",
    });
    const editor = await vscode.window.showTextDocument(document);
    const position = document.positionAt(document.getText().indexOf("probe:") + 1);
    let content = "";
    for (let attempt = 0; attempt < 40; attempt++) {
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        "vscode.executeHoverProvider",
        document.uri,
        position,
      );
      content = (hovers ?? [])
        .flatMap((hover) => hover.contents)
        .map((value) => (typeof value === "string" ? value : value.value))
        .join("\n");
      if (content.includes("nested: {")) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(content.includes("nested: {"), content);
    const callback = document.positionAt(document.getText().indexOf("Callback") + 1);
    editor.selection = new vscode.Selection(callback, callback);
    const original = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand("prettify-ts.copyPrettifiedType");
      assert.match(await vscode.env.clipboard.readText(), /type Callback = <T>\(value: T\) => T/);
    } finally {
      await vscode.env.clipboard.writeText(original);
      await vscode.commands.executeCommand("notifications.clearAll");
    }
  });
});
