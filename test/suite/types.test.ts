import { assertHover, openDocument, getHover } from "./utils";

suite("Hover Types", () => {
  suiteSetup(async () => {
    await openDocument("index.ts");
  });

  suite("Primitive Types", () => {
    test("string", async () => {
      const hover = await getHover("TestPrimitiveObj");
      const expected = /* typescript */ `type TestPrimitiveObj = { value: string };`;
      assertHover(hover, expected);
    });

    test("template literal", async () => {
      const hover = await getHover("TestTemplateLiteralObj");
      const expected = `type TestTemplateLiteralObj = { value: \`user-\${string}\` };`;
      assertHover(hover, expected);
    });
  });

  suite("Type Operations", () => {
    test("mapped", async () => {
      const hover = await getHover("TestMappedObj");
      const expected = /* typescript */ `type TestMappedObj = { value: { a: number; b: string } };`;
      assertHover(hover, expected);
    });

    test("conditional", async () => {
      const hover = await getHover("TestConditionalObj");
      const expected = /* typescript */ `type TestConditionalObj = { value: "yes" };`;
      assertHover(hover, expected);
    });

    test("conditional inference", async () => {
      const hover = await getHover("TestConditionalInferObj");
      const expected = /* typescript */ `type TestConditionalInferObj = { value: number };`;
      assertHover(hover, expected);
    });

    test("extends primitive", async () => {
      const hover = await getHover("TestExtendedPrimitiveObj");
      const expected = /* typescript */ `type TestExtendedPrimitiveObj = { value: string };`;
      assertHover(hover, expected);
    });
  });

  suite("Union Types", () => {
    test("basic union", async () => {
      const hover = await getHover("TestUnionObj");
      const expected = /* typescript */ `type TestUnionObj = { value: string | number };`;
      assertHover(hover, expected);
    });

    test("string literal union", async () => {
      const hover = await getHover("TestStringUnionObj");
      const expected = /* typescript */ `type TestStringUnionObj = { value: "a" | "b" | "c" };`;
      assertHover(hover, expected);
    });

    test("union sorting", async () => {
      const hover = await getHover("TestUnionSort");
      const expected = /* typescript */ `type TestUnionSort = string | number | { x: string } | null | undefined;`;
      assertHover(hover, expected);
    });
  });

  suite("Function Types", () => {
    test("single signature", async () => {
      const hover = await getHover("TestFunctionSingleObj");
      const expected = /* typescript */ `type TestFunctionSingleObj = { value: (x: number) => string };`;
      assertHover(hover, expected);
    });

    test("multiple signatures", async () => {
      const hover = await getHover("TestFunctionMultipleObj");
      const expected = /* typescript */ `type TestFunctionMultipleObj = { value: (string: string) => string & ((number: number) => number) };`;
      assertHover(hover, expected);
    });

    test("rest parameter", async () => {
      const hover = await getHover("TestFunctionRestArgObj");
      const expected = /* typescript */ `type TestFunctionRestArgObj = { value: (...args: number[]) => void };`;
      assertHover(hover, expected);
    });

    test("optional parameter", async () => {
      const hover = await getHover("TestFunctionOptionalArgObj");
      const expected = /* typescript */ `type TestFunctionOptionalArgObj = { value: (x?: string) => void };`;
      assertHover(hover, expected);
    });
  });

  suite("Tuple and Array Types", () => {
    test("tuple", async () => {
      const hover = await getHover("TestTupleObj");
      const expected = /* typescript */ `type TestTupleObj = { value: [number, string] };`;
      assertHover(hover, expected);
    });

    test("readonly tuple", async () => {
      const hover = await getHover("TestReadonlyTupleObj");
      const expected = /* typescript */ `type TestReadonlyTupleObj = { value: readonly [boolean, boolean] };`;
      assertHover(hover, expected);
    });

    test("optional and rest tuple", async () => {
      const hover = await getHover("TestOptionalRestTupleObj");
      const expected = /* typescript */ `type TestOptionalRestTupleObj = { value: [a: string, b?: number, ...rest: boolean[]] };`;
      assertHover(hover, expected);
    });

    test("array", async () => {
      const hover = await getHover("TestArrayObj");
      const expected = /* typescript */ `type TestArrayObj = { value: number[] };`;
      assertHover(hover, expected);
    });

    test("readonly array", async () => {
      const hover = await getHover("TestReadonlyArrayObj");
      const expected = /* typescript */ `type TestReadonlyArrayObj = { value: ReadonlyArray<string> };`;
      assertHover(hover, expected);
    });
  });

  suite("Object Types", () => {
    test("basic object", async () => {
      const hover = await getHover("TestObject");
      const expected = /* typescript */ `type TestObject = { value: { a: number; b: string } };`;
      assertHover(hover, expected);
    });

    test("intersection", async () => {
      const hover = await getHover("TestObjectMerge");
      const expected = /* typescript */ `type TestObjectMerge = { value: { a: string } & { b: number } };`;
      assertHover(hover, expected);
    });

    test("intersection with never", async () => {
      const hover = await getHover("TestNeverObjectMerge");
      const expected = /* typescript */ `type TestNeverObjectMerge = { value: { a: string } & { a: number } };`;
      assertHover(hover, expected);
    });

    test("index signature - number", async () => {
      const hover = await getHover("TestIndexNumberObj");
      const expected = /* typescript */ `type TestIndexNumberObj = { value: { [key: number]: number } };`;
      assertHover(hover, expected);
    });

    test("index signature - string", async () => {
      const hover = await getHover("TestIndexStringObj");
      const expected = /* typescript */ `type TestIndexStringObj = { value: { [key: string]: string } };`;
      assertHover(hover, expected);
    });

    test("template key", async () => {
      const hover = await getHover("TestTemplateIndexObj");
      const expected = /* typescript */ `type TestTemplateIndexObj = { value: { [key: \`item-\${number}\`]: boolean } };`;
      assertHover(hover, expected);
    });

    test("dynamic index", async () => {
      const hover = await getHover("TestDynamicIndexObj");
      const expected = /* typescript */ `type TestDynamicIndexObj = { value: { a: number; b: number } };`;
      assertHover(hover, expected);
    });

    test("readonly index", async () => {
      const hover = await getHover("TestIndexReadonlyObj");
      const expected = /* typescript */ `type TestIndexReadonlyObj = { value: { readonly [key: string]: string } };`;
      assertHover(hover, expected);
    });

    test("readonly prop", async () => {
      const hover = await getHover("TestReadonlyPropObj");
      const expected = /* typescript */ `type TestReadonlyPropObj = { value: { readonly b: number } };`;
      assertHover(hover, expected);
    });
  });

  suite("Other Types", () => {
    test("promise generic", async () => {
      const hover = await getHover("TestGenericObj");
      const expected = /* typescript */ `type TestGenericObj = { value: Promise<string> };`;
      assertHover(hover, expected);
    });

    test("circular type", async () => {
      const hover = await getHover("TestCircularObj");
      const expected = /* typescript */ `type TestCircularObj = { value: { value: string; next?: Circular } };`;
      assertHover(hover, expected);
    });
  });
});
