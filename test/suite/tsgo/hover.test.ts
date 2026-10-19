// Runs with PRETTIFY_TEST_TSGO=1: VS Code serves TypeScript through the TypeScript 7 extension, with TS Server off.
import * as assert from "node:assert";
import * as vscode from "vscode";
import { applySettings, getHoverContents, getHoverSections, getOpenDocument, openDocument } from "../utils";

const preview = "const declaredProbe: { nested: { value: string; }; }";
const native = "const declaredProbe: DeclaredProbe";

/** Settings and the language server apply asynchronously; poll until the editor shows the expected state. */
async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, attempts = 50): Promise<T> {
  let value = await read();
  for (let attempt = 1; attempt < attempts && !done(value); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    value = await read();
  }
  return value;
}

const mergedHover = (hovers: string[][]) => hovers.find((hover) => hover.includes(preview));

suite("TypeScript 7", () => {
  suiteSetup(async function () {
    this.timeout(180000);
    const typescript7 = vscode.extensions.getExtension<{ registerLspMiddleware?: unknown }>(
      "TypeScriptTeam.native-preview",
    );
    assert.ok(typescript7, "TypeScript 7 extension");
    const api = await typescript7.activate();
    assert.strictEqual(typeof api.registerLspMiddleware, "function", "TypeScript 7 extension API");
    await vscode.extensions.getExtension("MylesMurphy.prettify-ts")!.activate();
    await applySettings({ maxDepth: 3 });
    await openDocument("declarations.ts");
    // The language server starts, then Prettify connects to its API.
    const hovers = await until(
      () => getHoverSections("declaredProbe:"),
      (value) => !!mergedHover(value),
      600,
    );
    assert.ok(mergedHover(hovers), "TypeScript 7 hover with the preview: " + JSON.stringify(hovers));
  });
  teardown(async () => applySettings({ maxDepth: 3 }));

  test("merged hovers put the preview before TypeScript 7's own signature, in one hover", async () => {
    const hovers = await getHoverSections("declaredProbe:");
    const merged = mergedHover(hovers);
    assert.ok(merged, JSON.stringify(hovers));
    assert.ok(merged.indexOf(preview) < merged.indexOf(native), JSON.stringify(merged));
    assert.ok(!hovers.some((hover) => hover.length === 1 && hover[0] === preview), JSON.stringify(hovers));
  });

  test("native-first merged hovers start with TypeScript 7's signature", async () => {
    await applySettings({ maxDepth: 3, hoverPlacement: "nativeFirst" });
    const hovers = await until(
      () => getHoverSections("declaredProbe:"),
      (value) => mergedHover(value)?.[0] === native,
    );
    assert.deepStrictEqual(mergedHover(hovers)?.slice(0, 2), [native, preview], JSON.stringify(hovers));
  });

  test("prettified-only merged hovers replace TypeScript 7's signature", async () => {
    await applySettings({ maxDepth: 3, hoverPlacement: "prettifiedOnly" });
    const contents = await until(
      () => getHoverContents("declaredProbe:"),
      (value) => value.includes(preview) && !value.includes(native),
    );
    assert.ok(contents.includes(preview) && !contents.includes(native), contents.join("\n"));
  });

  test("separate hovers show the preview as a hover of its own", async () => {
    await applySettings({ maxDepth: 3, hoverMode: "separate" });
    const hovers = await until(
      () => getHoverSections("declaredProbe:"),
      (value) => value.some((hover) => hover.length === 1 && hover[0] === preview),
    );
    assert.ok(
      hovers.some((hover) => hover.length === 1 && hover[0] === preview),
      JSON.stringify(hovers),
    );
    assert.ok(
      hovers.some((hover) => hover[0] === native),
      JSON.stringify(hovers),
    );
  });

  test("a type TypeScript 7's hover already shows is not repeated", async () => {
    const contents = await getHoverContents("DeclaredProbe = {", 0);
    assert.strictEqual(contents.filter((content) => content.includes("nested")).length, 1, contents.join("\n"));
  });

  test("copying a type uses the TypeScript 7 API", async () => {
    const document = getOpenDocument();
    const position = document.positionAt(document.getText().indexOf("declaredProbe:") + 1);
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(position, position);
    await vscode.env.clipboard.writeText("");
    await vscode.commands.executeCommand("prettify-ts.copyPrettifiedType");
    const copied = await until(
      () => Promise.resolve(vscode.env.clipboard.readText()),
      (text) => text.length > 0,
    );
    assert.strictEqual(copied, "const declaredProbe: {\n    nested: {\n        value: string;\n    };\n}\n");
  });

  test("disabling the extension removes only its preview", async () => {
    await applySettings({ maxDepth: 3, enabled: false });
    const contents = await until(
      () => getHoverContents("declaredProbe:"),
      (value) => !value.some((content) => content.includes("nested")),
    );
    assert.ok(!contents.some((content) => content.includes("nested")), contents.join("\n"));
    assert.ok(contents.includes(native), contents.join("\n"));
  });
});
