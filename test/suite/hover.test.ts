import * as assert from "node:assert";
import {
  applySettings,
  assertHover,
  ensureTypeScriptServerReady,
  getHover,
  getHoverContents,
  getHoverSections,
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

  test("merged hovers keep a single hover, with the preview before TypeScript's signature", async () => {
    const hovers = await getHover("declaredProbe:");
    assertHover(hovers, "const declaredProbe: { nested: { value: string; }; };");
    const sections = await getHoverSections("declaredProbe:");
    const merged = sections.find((hover) => hover.includes("const declaredProbe: DeclaredProbe"));
    assert.ok(merged, JSON.stringify(sections));
    assert.ok(merged.indexOf(hovers.rendered!) === 0, JSON.stringify(merged));
  });

  test("native-first merged hovers start with TypeScript's signature", async () => {
    await applySettings({ maxDepth: 3, hoverPlacement: "nativeFirst" });
    const rendered = (await getHover("declaredProbe:")).rendered!;
    let merged: string[] | undefined;
    for (let attempt = 0; attempt < 20 && merged?.[0] !== "const declaredProbe: DeclaredProbe"; attempt++) {
      merged = (await getHoverSections("declaredProbe:")).find((hover) => hover.includes(rendered));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.deepEqual(merged?.slice(0, 2), ["const declaredProbe: DeclaredProbe", rendered]);
  });

  test("prettified-only merged hovers replace TypeScript's signature", async () => {
    await applySettings({ maxDepth: 3, hoverPlacement: "prettifiedOnly" });
    const rendered = (await getHover("declaredProbe:")).rendered!;
    let hovers: string[] = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      hovers = await getHoverContents("declaredProbe:");
      if (hovers.includes(rendered) && !hovers.includes("const declaredProbe: DeclaredProbe")) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(hovers.includes(rendered), hovers.join("\n"));
    assert.ok(!hovers.includes("const declaredProbe: DeclaredProbe"), hovers.join("\n"));
  });

  test("separate hovers show the preview as a hover of its own", async () => {
    await applySettings({ maxDepth: 3, hoverMode: "separate" });
    const rendered = (await getHover("declaredProbe:")).rendered!;
    let sections: string[][] = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      sections = await getHoverSections("declaredProbe:");
      if (sections.some((hover) => hover.length === 1 && hover[0] === rendered)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(
      sections.some((hover) => hover.length === 1 && hover[0] === rendered),
      JSON.stringify(sections),
    );
    assert.ok(
      sections.some((hover) => hover[0] === "const declaredProbe: DeclaredProbe"),
      JSON.stringify(sections),
    );
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
