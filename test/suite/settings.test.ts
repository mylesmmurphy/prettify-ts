import * as assert from "node:assert";
import * as vscode from "vscode";
import {
  applySettings,
  ensureTypeScriptServerReady,
  getHover,
  getOpenDocument,
  getPrettifyTypeInfo,
  openDocument,
} from "./utils";

const publicMembers = [
  "publicField",
  "parameterPublic",
  "publicMethod",
  "publicAccessor",
  "publicSetter",
  "inheritedPublic",
  "inheritedAccessor",
  "[_filterSymbol]",
];
const underscoreMembers = [
  "_publicField",
  "_quotedField",
  "_parameterUnderscore",
  "_publicMethod",
  "_publicAccessor",
  "_inheritedUnderscore",
];
const privateMembers = [
  "privateField",
  "protectedField",
  "_privateUnderscore",
  "#privateField",
  "parameterPrivate",
  "parameterProtected",
  "privateMethod",
  "protectedMethod",
  "privateAccessor",
  "protectedAccessor",
  "privateSetter",
  "protectedSetter",
  "inheritedPrivate",
  "inheritedProtected",
  "inheritedPrivateAccessor",
  "inheritedProtectedAccessor",
];

function propertyNames(tree: unknown): string[] {
  const object = tree as { kind: string; properties: { name: string }[] };
  assert.strictEqual(object.kind, "object");
  return object.properties.map((property) => property.name);
}

suite("Private and underscore member filtering (#38)", () => {
  suiteSetup(async () => {
    await ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe");
    await openDocument("settings.ts");
  });

  setup(async () => applySettings());
  teardown(async () => applySettings());

  test("omitted underscore option preserves existing filtering", async () => {
    const info = await getPrettifyTypeInfo("filteringExample:");
    assert.deepStrictEqual(propertyNames(info.typeTree).sort(), [...publicMembers].sort());
  });

  for (const hidePrivateProperties of [true, false]) {
    for (const treatUnderscoreAsPrivate of [true, false]) {
      test(`private filter=${hidePrivateProperties}, underscore convention=${treatUnderscoreAsPrivate}`, async () => {
        const info = await getPrettifyTypeInfo("filteringExample:", 1, {
          hidePrivateProperties,
          treatUnderscoreAsPrivate,
        });
        const expected = [
          ...publicMembers,
          ...(!hidePrivateProperties || !treatUnderscoreAsPrivate ? underscoreMembers : []),
          ...(!hidePrivateProperties ? privateMembers : []),
        ];
        assert.deepStrictEqual(propertyNames(info.typeTree).sort(), expected.sort());
      });
    }
  }

  test("object signatures preserve quoted underscore names and computed symbols", async () => {
    for (const treatUnderscoreAsPrivate of [true, false]) {
      const info = await getPrettifyTypeInfo("FilteringObject", 1, { treatUnderscoreAsPrivate });
      const expected = [
        "publicField",
        "[_filterSymbol]",
        ...(!treatUnderscoreAsPrivate ? ["_underscore", "_quoted"] : []),
      ];
      assert.deepStrictEqual(propertyNames(info.typeTree).sort(), expected.sort());
    }
  });

  test("hover reflects live changes to the underscore convention", async () => {
    const defaultHover = (await getHover("filteringExample:")).find((text) => text.includes("publicField:"));
    assert.ok(defaultHover, "Expected an expanded Prettify hover");
    assert.ok(!defaultHover.includes("_publicField:"), defaultHover);

    await applySettings({ treatUnderscoreAsPrivate: false });
    const expandedHover = (await getHover("filteringExample:")).find((text) => text.includes("publicField:"));
    assert.ok(expandedHover, "Expected an expanded Prettify hover");
    assert.ok(expandedHover.includes("_publicField:"), expandedHover);
    assert.ok(!expandedHover.includes("parameterPrivate:"), expandedHover);
    assert.ok(!expandedHover.includes("privateAccessor:"), expandedHover);
  });

  for (const command of ["prettify-ts.copyPrettifiedType", "prettify-ts.fullCopyPrettifiedType"]) {
    test(`${command} respects underscore and private settings`, async () => {
      const originalClipboard = await vscode.env.clipboard.readText();
      const document = getOpenDocument();
      const editor = await vscode.window.showTextDocument(document);
      const position = document.positionAt(document.getText().indexOf("filteringExample:") + 1);
      editor.selection = new vscode.Selection(position, position);

      try {
        for (const treatUnderscoreAsPrivate of [true, false]) {
          await applySettings({ treatUnderscoreAsPrivate });
          await vscode.env.clipboard.writeText("");
          const pendingCommand = vscode.commands.executeCommand(command);
          try {
            let copied = "";
            for (let attempt = 0; attempt < 50; attempt++) {
              await new Promise((resolve) => setTimeout(resolve, 100));
              copied = await vscode.env.clipboard.readText();
              if (copied.includes("publicField:")) break;
            }
            assert.ok(copied.includes("publicField:"), "Expected the command to copy an expanded type");
            assert.strictEqual(copied.includes("_publicField:"), !treatUnderscoreAsPrivate, copied);
            assert.ok(!copied.includes("parameterPrivate:"), copied);
            assert.ok(!copied.includes("privateAccessor:"), copied);
          } finally {
            await vscode.commands.executeCommand("notifications.clearAll");
            await pendingCommand;
          }
        }
      } finally {
        await vscode.env.clipboard.writeText(originalClipboard);
      }
    });
  }
});
