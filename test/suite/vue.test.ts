import { assertHover, openDocument, getHover, ensureTypeScriptServerReady } from "./utils";

suite("Vue Hover Types", () => {
  suiteSetup(async function () {
    await ensureTypeScriptServerReady();

    await openDocument("test.vue");

    this.timeout(90000); // Generous timeout for server readiness
  });

  test("primitive", async () => {
    const hover = await getHover("TestPrimitiveObj");
    const expected = /* ts */ `type TestPrimitiveObj = { value: string; }`;
    assertHover(hover, expected);
  });
});
