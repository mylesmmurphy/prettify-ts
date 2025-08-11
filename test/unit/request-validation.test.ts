import * as assert from "node:assert";
import { isPrettifyRequest } from "../../packages/typescript-plugin/src/request";
import type { PrettifyRequest } from "../../packages/typescript-plugin/src/request";

// Helper function to test isPrettifyRequest with any value while avoiding type errors
function testIsPrettifyRequest(value: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return isPrettifyRequest(value as any);
}

describe("Request Validation", () => {
  describe("isPrettifyRequest", () => {
    it("should return true for valid PrettifyRequest", () => {
      const validRequest: PrettifyRequest = {
        meta: "prettify-type-info-request",
        options: {
          hidePrivateProperties: true,
          maxDepth: 2,
          maxProperties: 100,
          maxSubProperties: 10,
          maxUnionMembers: 15,
          maxFunctionSignatures: 5,
          skippedTypeNames: [],
          unwrapArrays: true,
          unwrapFunctions: true,
          unwrapGenericArgumentsTypeNames: [],
        },
      };

      assert.strictEqual(isPrettifyRequest(validRequest), true);
    });

    it("should return true for minimal valid request", () => {
      const minimalRequest = {
        meta: "prettify-type-info-request",
        options: {},
      };

      assert.strictEqual(testIsPrettifyRequest(minimalRequest), true);
    });

    it("should return false for null or undefined", () => {
      assert.strictEqual(testIsPrettifyRequest(null), false);
      assert.strictEqual(testIsPrettifyRequest(undefined), false);
    });

    it("should return false for primitive values", () => {
      assert.strictEqual(testIsPrettifyRequest("string"), false);
      assert.strictEqual(testIsPrettifyRequest(123), false);
      assert.strictEqual(testIsPrettifyRequest(true), false);
      assert.strictEqual(testIsPrettifyRequest(false), false);
    });

    it("should return false for objects with wrong meta", () => {
      const wrongMeta = {
        meta: "wrong-meta-value",
        options: {},
      };

      assert.strictEqual(testIsPrettifyRequest(wrongMeta), false);
    });

    it("should return false for objects without meta property", () => {
      const noMeta = {
        options: {},
      };

      assert.strictEqual(testIsPrettifyRequest(noMeta), false);
    });

    it("should return false for objects with non-string meta", () => {
      const testCases = [
        { meta: 123, options: {} },
        { meta: true, options: {} },
        { meta: {}, options: {} },
        { meta: null, options: {} },
      ];

      testCases.forEach((testCase) => {
        assert.strictEqual(testIsPrettifyRequest(testCase), false);
      });
    });

    it("should return true for objects without options (implementation only checks meta)", () => {
      const noOptions = {
        meta: "prettify-type-info-request",
      };

      // The actual implementation only checks the meta field, not options
      assert.strictEqual(testIsPrettifyRequest(noOptions), true);
    });

    it("should handle edge cases for meta string matching", () => {
      const testCases = [
        { meta: "prettify-type-info-request", options: {}, expected: true },
        { meta: "prettify-type-info-request ", options: {}, expected: false }, // trailing space
        { meta: " prettify-type-info-request", options: {}, expected: false }, // leading space
        { meta: "PRETTIFY-TYPE-INFO-REQUEST", options: {}, expected: false }, // case sensitive
        { meta: "prettify-type-info", options: {}, expected: false }, // partial match
      ];

      testCases.forEach(({ meta, options, expected }) => {
        const result = testIsPrettifyRequest({ meta, options });
        assert.strictEqual(result, expected, `Failed for meta: "${meta}"`);
      });
    });

    it("should not validate options property (implementation only checks meta)", () => {
      const requestWithEmptyOptions = {
        meta: "prettify-type-info-request",
        options: {},
      };

      const requestWithNullOptions = {
        meta: "prettify-type-info-request",
        options: null,
      };

      // The implementation only checks meta, so both should return true
      assert.strictEqual(testIsPrettifyRequest(requestWithEmptyOptions), true);
      assert.strictEqual(testIsPrettifyRequest(requestWithNullOptions), true);
    });

    it("should handle complex objects that are not PrettifyRequests", () => {
      const complexObject = {
        meta: "prettify-type-info-request",
        options: {
          maxDepth: 5,
          nestedProperty: {
            deepValue: "test",
          },
        },
        extraProperty: "should not affect validation",
      };

      assert.strictEqual(testIsPrettifyRequest(complexObject), true);
    });

    it("should handle TypeScript completion trigger characters", () => {
      // These should all return false as they're not prettify requests
      const triggerChars = [".", "(", "<", '"', "'", "`", "#", "@"];

      triggerChars.forEach((char) => {
        assert.strictEqual(testIsPrettifyRequest(char), false);
      });
    });
  });

  describe("Type safety and edge cases", () => {
    it("should handle circular references in options", () => {
      const circularOptions: any = {
        meta: "prettify-type-info-request",
        options: {},
      };
      circularOptions.options.self = circularOptions;

      // Should not throw and should return true (circular reference doesn't affect validation)
      assert.doesNotThrow(() => {
        const result = testIsPrettifyRequest(circularOptions);
        assert.strictEqual(result, true);
      });
    });

    it("should handle very large options object", () => {
      const largeOptions = {
        meta: "prettify-type-info-request",
        options: {},
      };

      // Add many properties to options
      for (let i = 0; i < 1000; i++) {
        (largeOptions.options as any)[`prop${i}`] = `value${i}`;
      }

      // Should handle large objects without issues
      assert.strictEqual(testIsPrettifyRequest(largeOptions), true);
    });

    it("should handle prototype pollution attempts", () => {
      const maliciousObject = {
        meta: "prettify-type-info-request",
        options: {},
        __proto__: { isEvilPrototype: true },
        constructor: { prototype: { evilMethod: () => {} } },
      };

      // Should validate normally despite prototype properties
      assert.strictEqual(testIsPrettifyRequest(maliciousObject), true);
    });

    it("should handle objects with Symbol properties", () => {
      const symbolKey = Symbol("test");
      const objectWithSymbol = {
        meta: "prettify-type-info-request",
        options: {},
        [symbolKey]: "symbol value",
      };

      assert.strictEqual(testIsPrettifyRequest(objectWithSymbol), true);
    });
  });
});
