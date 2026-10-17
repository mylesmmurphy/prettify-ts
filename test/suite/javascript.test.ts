import { applySettings, assertHover, ensureTypeScriptServerReady, getHover, openDocument } from "./utils";

suite("JavaScript hover support (#90)", () => {
  suiteSetup(async () => ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe"));
  setup(async () => applySettings({ maxDepth: 3 }));
  teardown(async () => applySettings());

  test("checked JavaScript expands JSDoc aliases", async () => {
    await openDocument("javascript.js");
    assertHover(await getHover("jsModel ="), "const jsModel: { details: { value: string; }; };");
  });

  test("unchecked JSX expands JSDoc aliases", async () => {
    await openDocument("javascriptreact.jsx");
    assertHover(await getHover("jsxModel ="), "const jsxModel: { details: { value: string; }; };");
  });
});
