import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

type Smoke = { file: string; identifiers: { name: string; contains: string }[] };

const smoke = JSON.parse(process.env.PRETTIFY_REAL_WORLD_SMOKE ?? "null") as Smoke | null;
const workspace = process.env.PRETTIFY_REAL_WORLD_DIR ?? "";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function positionOf(document: vscode.TextDocument, name: string): vscode.Position {
  const offset = document.getText().search(new RegExp(`\\b${name}\\b`));
  assert.ok(offset >= 0, `Smoke identifier not found: ${name}`);
  return document.positionAt(offset + 1);
}

async function hoverText(document: vscode.TextDocument, position: vscode.Position): Promise<string> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    document.uri,
    position,
  );
  return (hovers ?? [])
    .flatMap((hover) => hover.contents)
    .map((content) => (typeof content === "string" ? content : content.value))
    .join("\n");
}

/** The Prettify response itself, so TypeScript's native hover cannot hide a missing plugin. */
async function prettifyName(document: vscode.TextDocument, position: vscode.Position): Promise<string | undefined> {
  const response = await vscode.commands.executeCommand<{ body?: { __prettifyResponse?: { name: string } } }>(
    "typescript.tsserverRequest",
    "completionInfo",
    {
      file: document.uri,
      line: position.line + 1,
      offset: position.character + 1,
      triggerCharacter: { meta: "prettify-type-info-request", options: {} },
    },
    { executionTarget: 0 },
  );
  return response?.body?.__prettifyResponse?.name;
}

suite("Real-world editor smoke test", () => {
  let document: vscode.TextDocument;
  let editor: vscode.TextEditor;

  suiteSetup(async function () {
    if (!smoke) this.skip();
    document = await vscode.workspace.openTextDocument(path.join(workspace, smoke.file));
    editor = await vscode.window.showTextDocument(document);
    await vscode.extensions.getExtension("MylesMurphy.prettify-ts")?.activate();
    const first = smoke.identifiers[0]!;
    // Large projects take a while to load; wait for the plugin rather than a fixed delay.
    for (let attempt = 0; attempt < 180; attempt++) {
      if ((await prettifyName(document, positionOf(document, first.name)).catch(() => undefined)) === first.name)
        return;
      await delay(1000);
    }
    throw new Error("The Prettify TypeScript plugin did not respond in the cloned project");
  });

  for (const identifier of smoke?.identifiers ?? []) {
    test(`hover and copy ${identifier.name}`, async () => {
      const position = positionOf(document, identifier.name);
      assert.strictEqual(await prettifyName(document, position), identifier.name);
      let text = "";
      for (let attempt = 0; attempt < 40 && !text.includes(identifier.contains); attempt++) {
        text = await hoverText(document, position);
        if (!text.includes(identifier.contains)) await delay(250);
      }
      assert.ok(text.includes(identifier.contains), text);

      editor.selection = new vscode.Selection(position, position);
      const original = await vscode.env.clipboard.readText();
      try {
        for (const command of ["prettify-ts.copyPrettifiedType", "prettify-ts.fullCopyPrettifiedType"]) {
          await vscode.env.clipboard.writeText("");
          await vscode.commands.executeCommand(command);
          const copied = await vscode.env.clipboard.readText();
          assert.ok(copied.includes(identifier.name) && copied.includes(identifier.contains), `${command}: ${copied}`);
        }
      } finally {
        await vscode.env.clipboard.writeText(original);
        await vscode.commands.executeCommand("notifications.clearAll");
      }
    });
  }
});
