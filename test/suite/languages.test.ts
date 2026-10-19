import * as assert from "node:assert";
import * as vscode from "vscode";
import { applySettings, ensureTypeScriptServerReady, getHoverSections, openDocument, showDocument } from "./utils";

/** A language-specific workspace setting, such as `"[typescript]": { "prettify-ts.enabled": false }`. */
async function setForLanguage(languageId: string, enabled: boolean | undefined) {
  await vscode.workspace
    .getConfiguration("prettify-ts", { languageId })
    .update("enabled", enabled, vscode.ConfigurationTarget.Workspace, true);
}

async function setAssociations(associations: Record<string, string> | undefined) {
  await vscode.workspace
    .getConfiguration("files")
    .update("associations", associations, vscode.ConfigurationTarget.Workspace);
}

/** The hovers at a keyword in the current document, polled until settings changes have reached TS Server. */
async function hoversUntil(keyword: string, done: (hovers: string[][]) => boolean): Promise<string[][]> {
  let hovers = await getHoverSections(keyword);
  for (let attempt = 0; attempt < 50 && !done(hovers); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    hovers = await getHoverSections(keyword);
  }
  return hovers;
}

const shows = (text: string) => (hovers: string[][]) => hovers.some((hover) => hover.includes(text));
const noPreview = (native: string) => (hovers: string[][]) =>
  shows(native)(hovers) && !hovers.flat().some((section) => section.includes("nested"));

suite("Language-specific settings in merged hovers", () => {
  suiteSetup(async function () {
    this.timeout(120000);
    await ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe");
    await applySettings({ maxDepth: 3 });
  });
  teardown(async () => {
    await setForLanguage("typescript", undefined);
    await setForLanguage("javascriptreact", undefined);
    await setAssociations(undefined);
    await applySettings({ maxDepth: 3 });
  });

  test("a TypeScript language setting applies to an untitled TypeScript document", async () => {
    const native = "const probeUntitled: UntitledProbe";
    const preview = "const probeUntitled: { nested: { value: string; }; }";
    await setForLanguage("typescript", false);
    const document = await vscode.workspace.openTextDocument({
      language: "typescript",
      content:
        'type UntitledProbe = { nested: { value: string } };\nconst probeUntitled: UntitledProbe = { nested: { value: "" } };\n',
    });
    await showDocument(document);
    const disabled = await hoversUntil("probeUntitled:", noPreview(native));
    assert.ok(noPreview(native)(disabled), JSON.stringify(disabled));
    // Control: without the language setting, the same document has the preview.
    await setForLanguage("typescript", undefined);
    const enabled = await hoversUntil("probeUntitled:", shows(preview));
    assert.ok(shows(preview)(enabled), JSON.stringify(enabled));
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
  });

  test("a JavaScript file opened as JavaScript React gets its settings, and follows language mode changes", async () => {
    const native = "const probeJS: JsProbe";
    const preview = "const probeJS: { nested: { value: string; }; }";
    await setAssociations({ "**/associated.js": "javascriptreact" });
    await setForLanguage("javascriptreact", false);
    await openDocument("associated.js");
    const document = vscode.window.activeTextEditor!.document;
    assert.strictEqual(document.languageId, "javascriptreact");
    const disabled = await hoversUntil("probeJS =", noPreview(native));
    assert.ok(noPreview(native)(disabled), JSON.stringify(disabled));
    // Switching the document to JavaScript applies JavaScript's settings, which keep the preview.
    await showDocument(await vscode.languages.setTextDocumentLanguage(document, "javascript"));
    const enabled = await hoversUntil("probeJS =", shows(preview));
    assert.ok(shows(preview)(enabled), JSON.stringify(enabled));
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });

  test("a conventional .jsx file follows its own language setting", async () => {
    const native = "const jsxModel: JsxModel";
    const preview = "const jsxModel: { details: { value: string; }; }";
    const withoutPreview = (hovers: string[][]) =>
      shows(native)(hovers) && !hovers.flat().some((section) => section.includes("value: string"));
    await setForLanguage("javascriptreact", false);
    await openDocument("javascriptreact.jsx");
    assert.strictEqual(vscode.window.activeTextEditor!.document.languageId, "javascriptreact");
    const disabled = await hoversUntil("jsxModel =", withoutPreview);
    assert.ok(withoutPreview(disabled), JSON.stringify(disabled));
    await setForLanguage("javascriptreact", undefined);
    const enabled = await hoversUntil("jsxModel =", shows(preview));
    assert.ok(shows(preview)(enabled), JSON.stringify(enabled));
  });
});
