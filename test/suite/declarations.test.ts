import * as assert from "node:assert";
import {
  applySettings,
  assertHover,
  ensureTypeScriptServerReady,
  getHover,
  getPrettifyTypeInfo,
  openDocument,
} from "./utils";

suite("Declaration Hover Types", () => {
  suiteSetup(async () => {
    await ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe");
    await applySettings({ maxDepth: 3 });
    await openDocument("declarations.ts");
  });

  test("type alias after a value with the same name (#89)", async () => {
    const info = await getPrettifyTypeInfo("SharedTypeFirst = { typeOnly");
    assert.strictEqual(info.declaration, "type SharedTypeFirst = ");
    assert.match(JSON.stringify(info.typeTree), /"name":"typeOnly"/);
    assert.doesNotMatch(JSON.stringify(info.typeTree), /"name":"runtimeOnly"/);
  });

  test("value after a type alias with the same name (#89)", async () => {
    const info = await getPrettifyTypeInfo("SharedValueFirst = { runtimeOnly");
    assert.strictEqual(info.declaration, "const SharedValueFirst: ");
    assert.match(JSON.stringify(info.typeTree), /"name":"runtimeOnly"/);
    assert.doesNotMatch(JSON.stringify(info.typeTree), /"name":"typeOnly"/);
  });

  test("type and value references select the correct namespace (#89)", async () => {
    const type = await getPrettifyTypeInfo("SharedTypeFirst = { typeOnly");
    const reference = await getPrettifyTypeInfo("sharedReference: SharedTypeFirst", "sharedReference: ".length);
    assert.deepStrictEqual(reference.typeTree, type.typeTree);
    const value = await getPrettifyTypeInfo("SharedValueFirst;", 0);
    assert.match(JSON.stringify(value.typeTree), /"name":"runtimeOnly"/);
    assert.strictEqual(reference.declaration, "type SharedTypeFirst = ");
  });

  test("class declarations, constructor calls, and enums keep their previews", async () => {
    const declaration = await getPrettifyTypeInfo("DeclarationClass {");
    assert.match(JSON.stringify(declaration.typeTree), /"name":"instanceValue"/);
    assert.doesNotMatch(JSON.stringify(declaration.typeTree), /"name":"staticMember"/);
    const constructor = await getPrettifyTypeInfo("new DeclarationClass", "new ".length);
    assert.match(JSON.stringify(constructor.typeTree), /"kind":"function"/);
    assert.match(JSON.stringify(constructor.typeTree), /"name":"instanceValue"/);
    const enumeration = await getPrettifyTypeInfo("DeclarationEnum {");
    assert.match(JSON.stringify(enumeration.typeTree), /"kind":"union"/);
  });

  test("hover at the first character of an identifier (#43)", async () => {
    const hover = await getHover("declaredProbe:", 0);
    assertHover(hover, "const declaredProbe: { nested: { value: string; }; };");
  });
});
