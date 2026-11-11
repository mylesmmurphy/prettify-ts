import * as assert from "node:assert";
import * as vscode from "vscode";
import {
  applySettings,
  assertHover,
  ensureTypeScriptServerReady,
  getHover,
  getHoverContents,
  openDocument,
} from "./utils";

suite("Hover provider", () => {
  suiteSetup(async () => {
    await ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe");
    await applySettings({ maxDepth: 3 });
    await openDocument("declarations.ts");
  });
  teardown(async () => applySettings({ maxDepth: 3 }));

  test("adds an expanded hover next to TypeScript's own", async () => {
    const hovers = await getHover("declaredProbe:");
    assertHover(hovers, "const declaredProbe: { nested: { value: string; }; };");
    assert.ok(hovers.includes("const declaredProbe: DeclaredProbe"), hovers.join("\n"));
  });

  test("does not repeat a type TypeScript's hover already shows", async () => {
    const expected = "type DeclaredProbe = { nested: { value: string; }; }";
    const hovers = await getHover("DeclaredProbe = {", 0);
    assertHover(hovers, expected);
    assert.strictEqual(hovers.filter((hover) => hover === expected).length, 1, hovers.join("\n"));
  });

  test("collapsed members use the familiar marker", async () => {
    await applySettings({ maxDepth: 1 });
    const hovers = await getHover("declaredProbe:");
    assertHover(hovers, "const declaredProbe: { nested: { ... 1 more }; };");
  });

  test("the unexpanded type setting names each named object at every depth", async () => {
    const expected: [string, string][] = [
      ["declaredProbe:", "const declaredProbe: DeclaredProbe & { nested: { value: string; }; }"],
      ["namedProbe:", "const namedProbe: { pair: NamedPair<number> & { key: string; value: number; }; }"],
    ];
    await applySettings({ maxDepth: 3, includeUnexpandedType: true });
    for (const [keyword, hover] of expected) {
      let hovers: string[] = [];
      for (let attempt = 0; attempt < 20; attempt++) {
        hovers = await getHoverContents(keyword);
        if (hovers.includes(hover)) break;

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      assert.ok(hovers.includes(hover), hovers.join("\n"));
    }
  });

  test("unexpanded names follow the editor's hover length setting", async function () {
    const config = vscode.workspace.getConfiguration("js/ts");
    if (config.inspect("hover.maximumLength")?.defaultValue === undefined) {
      this.skip();
    }

    // `NamedPair<number>` is 17 characters, so a 16-character limit leaves it out.
    const expected = "const namedProbe: { pair: { key: string; value: number; }; }";
    await applySettings({ maxDepth: 3, includeUnexpandedType: true });
    await config.update("hover.maximumLength", 16, vscode.ConfigurationTarget.Workspace);
    try {
      let hovers: string[] = [];
      for (let attempt = 0; attempt < 20; attempt++) {
        hovers = await getHoverContents("namedProbe:");
        if (hovers.includes(expected)) break;

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      assert.ok(hovers.includes(expected), hovers.join("\n"));
    } finally {
      await config.update("hover.maximumLength", undefined, vscode.ConfigurationTarget.Workspace);
    }
  });

  test("disabling the extension removes only its hover", async () => {
    await applySettings({ maxDepth: 3, enabled: false });
    let hovers: string[] = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      hovers = await getHoverContents("declaredProbe:");
      if (!hovers.some((hover) => hover.includes("nested"))) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(!hovers.some((hover) => hover.includes("nested")), hovers.join("\n"));
    assert.ok(hovers.includes("const declaredProbe: DeclaredProbe"), hovers.join("\n"));
  });
});
