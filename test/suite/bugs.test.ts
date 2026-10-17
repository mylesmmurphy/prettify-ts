import * as assert from "node:assert";
import {
  applySettings,
  renderPrettifiedType,
  ensureTypeScriptServerReady,
  getPrettifyTypeInfo,
  openDocument,
} from "./utils";

suite("Open bug regressions", () => {
  suiteSetup(async () => {
    await ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe");
    await openDocument("bugs.ts");
  });

  setup(async () => applySettings({ maxDepth: 4 }));
  teardown(async () => applySettings());

  test("mapped unique symbol keys use source names (#83)", async () => {
    const text = await renderPrettifiedType("BugMappedSymbol");
    assert.match(text, /\[bugSymbol\]: "mapped"/);
    assert.doesNotMatch(text, /__@/);
  });

  test("computed symbols stay visible and quoted keys are escaped (#83)", async () => {
    const text = await renderPrettifiedType("BugObjectKeys");
    assert.ok(text.includes('[bugSymbol]: "symbol";'), text);
    assert.ok(text.includes("[Symbol.iterator]: () => string;"), text);
    assert.ok(text.includes('"quoted key": string;'), text);
    assert.ok(text.includes('"quote\\"key": number;'), text);
    assert.ok(text.includes('"back\\\\slash": boolean;'), text);
    assert.ok(text.includes('"line\\nbreak": number;'), text);
    assert.ok(text.includes('"[literal]": string;'), text);
    assert.ok(text.includes('"brace}key{": "false | true";'), text);
    assert.ok(text.includes('"semi; colon": string;'), text);
    assert.ok(text.includes('"merge } & { key": string;'), text);
    assert.doesNotMatch(text, /__@/);
  });

  test("skipped primitive aliases retain their annotated name (#93)", async () => {
    const info = await getPrettifyTypeInfo("bugUuid:", 0, { skippedTypeNames: ["BugUUID"] });
    assert.deepStrictEqual(info.typeTree, { kind: "reference", typeName: "BugUUID" });
  });

  test("skipped aliases survive nested properties, arrays, and return types (#93)", async () => {
    await applySettings({ maxDepth: 4, skippedTypeNames: ["BugUUID"] });
    const text = await renderPrettifiedType("BugUUIDContainer");
    assert.match(text, /id: BugUUID;/);
    assert.match(text, /optionalId\?: BugUUID;/);
    assert.match(text, /ids: BugUUID\[\];/);
    assert.match(text, /getId: \(\) => BugUUID;/);
    assert.match(text, /formatId: \(id\?: BugUUID\) => BugUUID;/);
  });

  test("disabled unwrap settings preserve nested array and function names (#82)", async () => {
    await applySettings({ maxDepth: 4, unwrapArrays: false, unwrapFunctions: false });
    const text = await renderPrettifiedType("BugNestedSettings");
    assert.match(text, /items: BugItem\[\];/);
    assert.match(text, /callback: BugCallback;/);
    assert.doesNotMatch(text, /nested:/);
  });

  test("disabled unwrap settings also preserve top-level arrays and functions (#82)", async () => {
    const options = { unwrapArrays: false, unwrapFunctions: false };
    assert.deepStrictEqual((await getPrettifyTypeInfo("bugArray:", 0, options)).typeTree, {
      kind: "reference",
      typeName: "BugItem[]",
    });
    assert.deepStrictEqual((await getPrettifyTypeInfo("bugCallback:", 0, options)).typeTree, {
      kind: "reference",
      typeName: "BugCallback",
    });
  });

  test("disabled function unwrapping retains declaration syntax (#82)", async () => {
    await applySettings({ unwrapFunctions: false });
    const text = await renderPrettifiedType("bugFunction(");
    assert.match(text, /function bugFunction\(item: BugItem\): BugItem/);
    assert.doesNotMatch(text, /=>/);
    const nested = await renderPrettifiedType("BugNestedSettings");
    assert.match(nested, /inlineCallback: \(item: BugItem\) => BugItem;/);
  });

  test("generic skip names keep their abbreviated arguments (#93)", async () => {
    const info = await getPrettifyTypeInfo("bugGeneric:", 0, { skippedTypeNames: ["BugGeneric"] });
    assert.deepStrictEqual(info.typeTree, { kind: "reference", typeName: "BugGeneric<...>" });
  });

  test("array and function unwrap settings work independently (#82)", async () => {
    await applySettings({ maxDepth: 4, unwrapArrays: false, unwrapFunctions: true });
    const arrays = await renderPrettifiedType("BugNestedSettings");
    assert.match(arrays, /items: BugItem\[\];/);
    assert.match(arrays, /callback: \(item:/);
    await applySettings({ maxDepth: 4, unwrapArrays: true, unwrapFunctions: false });
    const functions = await renderPrettifiedType("BugNestedSettings");
    assert.match(functions, /callback: BugCallback;/);
    assert.match(functions, /items: \{/);
  });

  test("enabled unwrap settings still expand nested values (#82)", async () => {
    const text = await renderPrettifiedType("BugNestedSettings");
    assert.match(text, /nested:/);
    assert.match(text, /value: string;/);
  });
});
