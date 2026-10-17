import * as assert from "node:assert";
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
