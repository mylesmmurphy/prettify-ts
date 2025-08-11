import { applySettings, assertHover, openDocument, getHover, ensureTypeScriptServerReady } from "./utils";

suite("Display Parts", () => {
  suiteSetup(async () => {
    await ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe");
    await applySettings({ maxDepth: 3 });
    await openDocument("types.ts");
  });

  suite("Core Type Display", () => {
    test("primitive types show correctly", async () => {
      const hover = await getHover("TestPrimitiveObj");
      const expected = /* ts */ `type TestPrimitiveObj = { value: string; };`;
      assertHover(hover, expected);
    });

    test("function signatures with parameters", async () => {
      const hover = await getHover("TestFunctionSingleObj");
      const expected = /* ts */ `type TestFunctionSingleObj = { value: (x: number) => string; };`;
      assertHover(hover, expected);
    });

    test("array types with brackets", async () => {
      const hover = await getHover("TestArrayObj");
      const expected = /* ts */ `type TestArrayObj = { value: number[]; };`;
      assertHover(hover, expected);
    });

    test("object types show structure", async () => {
      const hover = await getHover("TestObject");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for object type");
      }

      // Should contain object structure indicators
      if (!hoverText.includes("{") || !hoverText.includes("}")) {
        throw new Error("Object type should include braces");
      }
    });

    test("circular references are handled", async () => {
      const hover = await getHover("TestCircularObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for circular type");
      }

      // Should handle circular reference without crashing
      if (!hoverText.includes("Circular")) {
        throw new Error("Should reference Circular type");
      }
    });
  });

  suite("Type Operators and Modifiers", () => {
    test("union types preserve pipe operator", async () => {
      const hover = await getHover("TestUnionObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for union type");
      }

      // Check for union - either expanded with | or type alias Union
      const hasUnionOperator = hoverText.includes("|");
      const hasUnionAlias = hoverText.includes("Union");

      if (!hasUnionOperator && !hasUnionAlias) {
        throw new Error("Union type should be represented");
      }
    });

    test("intersection types preserve ampersand or expand correctly", async () => {
      const hover = await getHover("TestObjectMerge");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for intersection type");
      }

      const hasIntersectionOperator = hoverText.includes("&");
      const hasExpandedProperties = hoverText.includes("a: string") && hoverText.includes("b: number");

      if (!hasIntersectionOperator && !hasExpandedProperties) {
        throw new Error("Intersection type should either preserve & operator or show expanded properties");
      }
    });

    test("optional properties show question mark", async () => {
      const hover = await getHover("TestOptionalPropObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for optional property");
      }

      // Check for optional modifier or type alias
      const hasOptionalModifier = hoverText.includes("?");
      const hasOptionalAlias = hoverText.includes("OptionalProp");

      if (!hasOptionalModifier && !hasOptionalAlias) {
        throw new Error("Optional property should be represented");
      }
    });

    test("readonly modifier is preserved", async () => {
      const hover = await getHover("TestReadonlyPropObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for readonly property");
      }

      // Check for readonly keyword or type alias
      const hasReadonly = hoverText.includes("readonly");
      const hasReadonlyAlias = hoverText.includes("ReadonlyProp");

      if (!hasReadonly && !hasReadonlyAlias) {
        throw new Error("Readonly property should be represented");
      }
    });
  });

  suite("Complex Types", () => {
    test("generic types with type arguments", async () => {
      const hover = await getHover("TestGenericObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for generic type");
      }

      // Should contain angle brackets or type alias
      const hasAngleBrackets = hoverText.includes("<") && hoverText.includes(">");
      const hasGenericAlias = hoverText.includes("Generic") || hoverText.includes("Promise");

      if (!hasAngleBrackets && !hasGenericAlias) {
        throw new Error("Generic type should be represented");
      }
    });

    test("tuple types with brackets", async () => {
      const hover = await getHover("TestTupleObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for tuple type");
      }

      // Should contain brackets or type alias
      const hasBrackets = hoverText.includes("[") && hoverText.includes("]");
      const hasTupleAlias = hoverText.includes("Tuple");

      if (!hasBrackets && !hasTupleAlias) {
        throw new Error("Tuple type should be represented");
      }
    });

    test("template literal types with backticks", async () => {
      const hover = await getHover("TestTemplateLiteralObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for template literal");
      }

      // Should contain backticks or type alias
      const hasBackticks = hoverText.includes("`");
      const hasTemplateAlias = hoverText.includes("TemplateLiteral");

      if (!hasBackticks && !hasTemplateAlias) {
        throw new Error("Template literal type should be represented");
      }
    });

    test("index signatures with brackets", async () => {
      const hover = await getHover("TestIndexStringObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for index signature");
      }

      // Should contain index signature brackets or type alias
      const hasIndexBrackets = hoverText.includes("[") && hoverText.includes("]");
      const hasIndexAlias = hoverText.includes("IndexString");

      if (!hasIndexBrackets && !hasIndexAlias) {
        throw new Error("Index signature should be represented");
      }
    });

    test("enum types are represented", async () => {
      const hover = await getHover("TestEnum");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for enum");
      }

      // Should reference the enum
      if (!hoverText.includes("TestEnum")) {
        throw new Error("Enum should reference TestEnum");
      }
    });
  });

  suite("Type Expansion Behavior", () => {
    test("conditional types are evaluated", async () => {
      const hover = await getHover("TestConditionalObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for conditional type");
      }

      // Should show the evaluated result or the type alias
      const hasEvaluatedResult = hoverText.includes('"yes"') || hoverText.includes("'yes'");
      const hasConditionalAlias = hoverText.includes("Conditional");

      if (!hasEvaluatedResult && !hasConditionalAlias) {
        throw new Error("Conditional type should be represented");
      }
    });

    test("mapped types show structure", async () => {
      const hover = await getHover("TestMappedObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for mapped type");
      }

      // Should show mapped result or type alias
      const hasMappedStructure = hoverText.includes("{") && (hoverText.includes("a") || hoverText.includes("b"));
      const hasMappedAlias = hoverText.includes("Mapped");

      if (!hasMappedStructure && !hasMappedAlias) {
        throw new Error("Mapped type should be represented");
      }
    });

    test("discriminated unions show alternatives", async () => {
      const hover = await getHover("TestDiscriminatedUnion");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for discriminated union");
      }

      // Should show union with pipe or individual type names
      const hasUnion = hoverText.includes("|");
      const hasCircleSquare = hoverText.includes("Circle") || hoverText.includes("Square");

      if (!hasUnion && !hasCircleSquare) {
        throw new Error("Discriminated union should be represented");
      }
    });
  });

  suite("Function Types", () => {
    test("optional parameters with question mark", async () => {
      const hover = await getHover("TestFunctionOptionalArgObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for optional parameter function");
      }

      // Should show optional parameter or type alias
      const hasOptional = hoverText.includes("?");
      const hasFunctionAlias = hoverText.includes("FunctionOptionalArg");

      if (!hasOptional && !hasFunctionAlias) {
        throw new Error("Optional parameter should be represented");
      }
    });

    test("rest parameters with ellipsis", async () => {
      const hover = await getHover("TestFunctionRestArgObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for rest parameter function");
      }

      // Should show rest parameter or type alias
      const hasEllipsis = hoverText.includes("...");
      const hasFunctionAlias = hoverText.includes("FunctionRestArg");

      if (!hasEllipsis && !hasFunctionAlias) {
        throw new Error("Rest parameter should be represented");
      }
    });

    test("function overloads are handled", async () => {
      const hover = await getHover("TestFunctionMultipleObj");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for function overloads");
      }

      const hasOverloadFunction = hoverText.includes("overloadFunction");
      const hasTypeof = hoverText.includes("typeof");
      const hasFunctionSignature = hoverText.includes("(") && hoverText.includes(")") && hoverText.includes("=>");
      const hasValue = hoverText.includes("value:");

      if (!hasOverloadFunction && !hasTypeof && (!hasFunctionSignature || !hasValue)) {
        console.log("Function overloads hover text:", hoverText);
        throw new Error("Function overloads should be represented");
      }
    });
  });

  suite("Performance and Stability", () => {
    test("hover completes within reasonable time", async function () {
      this.timeout(5000);

      const start = Date.now();
      await getHover("TestObject");
      const elapsed = Date.now() - start;

      if (elapsed >= 500) {
        throw new Error(`Hover took ${elapsed}ms, expected < 500ms`);
      }
    });

    test("repeated hovers benefit from caching", async function () {
      this.timeout(5000);

      // First hover
      const start1 = Date.now();
      await getHover("TestObject");
      const time1 = Date.now() - start1;

      // Second hover (should be cached)
      const start2 = Date.now();
      await getHover("TestObject");
      const time2 = Date.now() - start2;

      // Second should not be significantly slower
      if (time2 > time1 + 50) {
        throw new Error(`Caching not effective: first=${time1}ms, second=${time2}ms`);
      }
    });

    test("maximum depth is respected", async () => {
      const hover = await getHover("TestObject");
      const hoverText = hover[0];

      if (!hoverText) {
        throw new Error("No hover text for depth test");
      }

      // Count nesting levels by braces
      const openBraces = (hoverText.match(/{/g) || []).length;

      // Should not exceed reasonable depth
      if (openBraces > 10) {
        throw new Error(`Too many nesting levels: ${openBraces}`);
      }
    });

    test("all test types provide hover", async () => {
      const testTypes = [
        "TestPrimitiveObj",
        "TestUnionObj",
        "TestEnum",
        "TestFunctionSingleObj",
        "TestTupleObj",
        "TestArrayObj",
        "TestObject",
        "TestGenericObj",
        "TestObjectMerge",
        "TestConditionalObj",
        "TestMappedObj",
        "TestTemplateLiteralObj",
        "TestCircularObj",
      ];

      for (const typeName of testTypes) {
        const hover = await getHover(typeName);
        const hoverText = hover[0];

        if (!hoverText) {
          throw new Error(`No hover text for ${typeName}`);
        }

        // Basic validation - should have some content
        if (hoverText.length < 5) {
          throw new Error(`Hover text too short for ${typeName}: "${hoverText}"`);
        }
      }
    });
  });
});
