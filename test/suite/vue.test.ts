import * as assert from "node:assert";
import * as vscode from "vscode";
import { getPrettifyTypeInfo, getOpenDocument, assertHover, getHover, ensureTypeScriptServerReady } from "./utils";

suite("Vue Hover Types", () => {
  suiteSetup(async function () {
    const vue = vscode.extensions.getExtension("vue.volar");
    assert.ok(vue, "Vue extension must be installed for the Vue tests");
    const version = process.env.PRETTIFY_TEST_VUE_VERSION;
    if (version && version !== "latest") {
      assert.strictEqual(vue.packageJSON.version, version);
    }
    await ensureTypeScriptServerReady("test.vue", "ServerReadinessProbe");
  });

  test("plugin provides mapped Vue types", async () => {
    const info = await getPrettifyTypeInfo("TestPrimitiveObj");
    assert.strictEqual(info.declaration, "type TestPrimitiveObj = ");
    assert.match(JSON.stringify(info.typeTree), /"name":"value"/);
  });

  test("plugin maps Vue positions after an edit replaces the program", async () => {
    const document = getOpenDocument();
    const original = document.getText();
    try {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, new vscode.Position(1, 0), "// Move the Vue type locations.\n");
      assert.ok(await vscode.workspace.applyEdit(edit));
      const info = await getPrettifyTypeInfo("TestPrimitiveObj", 0);
      assert.strictEqual(info.declaration, "type TestPrimitiveObj = ");
      assert.match(JSON.stringify(info.typeTree), /"name":"value"/);
    } finally {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length)),
        original,
      );
      assert.ok(await vscode.workspace.applyEdit(edit));
    }
  });

  test("primitive", async () => {
    const hover = await getHover("TestPrimitiveObj");
    const expected = /* ts */ `type TestPrimitiveObj = { value: string; }`;
    assertHover(hover, expected);
  });
});
