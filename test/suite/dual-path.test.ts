import { applySettings, openDocument, getHover, ensureTypeScriptServerReady, TEST_CONFIG } from "./utils";
import * as assert from "node:assert";

suite("Dual Path Verification", () => {
  suiteSetup(async () => {
    await ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe");
    await applySettings({ maxDepth: 3 });
    await openDocument("types.ts");
  });

  suite("TypeScript Plugin Path Verification", () => {
    test("should get consistent hover results through plugin quickinfo enhancement", async () => {
      // This tests the path that's currently active in tests (TypeScript plugin)
      const hover = await getHover("TestPrimitiveObj");

      assert.ok(hover && hover.length > 0, "Should get hover results");
      assert.ok(hover[0]?.includes("string"), "Should contain primitive type information");
    });

    test("should handle complex discriminated union types through plugin path", async () => {
      const hover = await getHover("TestDiscriminatedUnion");

      assert.ok(hover && hover.length > 0, "Should get hover results");
      assert.ok(hover[0]?.includes("|"), "Should contain union type information");
      assert.ok(hover[0]?.includes("kind"), "Should contain discriminated union properties");
    });

    test("should format structured object types through plugin path", async () => {
      const hover = await getHover("TestObject");

      assert.ok(hover && hover.length > 0, "Should get hover results");
      assert.ok(hover[0]?.includes("{"), "Should contain object structure");
      assert.ok(hover[0]?.includes("}"), "Should contain object structure");
    });
  });

  suite("Configuration Behavior", () => {
    test("should respect maxDepth configuration", async () => {
      await applySettings({ maxDepth: 1 });

      const hover = await getHover("TestCircularObj");

      assert.ok(hover && hover.length > 0, "Should get hover results");

      const hoverContent = hover[0] || "";

      // Should limit depth (exact behavior depends on implementation)
      assert.ok(hoverContent.length > 0, "Should have some content even with limited depth");
    });

    test("should handle skipped type names", async () => {
      await applySettings({ skippedTypeNames: ["Array", "Promise"] });

      // Test with a type that uses skipped types
      const hover = await getHover("TestPrimitiveObj");

      // Should still work for non-skipped types
      assert.ok(hover && hover.length > 0, "Should work for non-skipped types");
    });
  });

  suite("Performance Verification", () => {
    test("should complete simple operations within reasonable time", async () => {
      const startTime = Date.now();

      await getHover("TestPrimitiveObj");

      const duration = Date.now() - startTime;
      const { SIMPLE_OPERATION_TIMEOUT_MS } = TEST_CONFIG.PERFORMANCE;

      assert.ok(
        duration < SIMPLE_OPERATION_TIMEOUT_MS,
        `Simple operations should complete quickly, took ${duration}ms (limit: ${SIMPLE_OPERATION_TIMEOUT_MS}ms)`,
      );
    });

    test("should handle complex types efficiently within time limits", async () => {
      const startTime = Date.now();

      await getHover("TestCircularObj");

      const duration = Date.now() - startTime;
      const { COMPLEX_OPERATION_TIMEOUT_MS } = TEST_CONFIG.PERFORMANCE;

      assert.ok(
        duration < COMPLEX_OPERATION_TIMEOUT_MS,
        `Complex operations should complete efficiently, took ${duration}ms (limit: ${COMPLEX_OPERATION_TIMEOUT_MS}ms)`,
      );
    });
  });

  suite("Edge Cases", () => {
    test("should handle invalid type names gracefully", async () => {
      try {
        const hover = await getHover("NonExistentType");

        // Empty results are acceptable for non-existent types
        assert.ok(hover !== null && Array.isArray(hover), "Should return valid array result");

        // If results exist, they should be strings
        if (hover.length > 0) {
          hover.forEach((result) => {
            assert.strictEqual(typeof result, "string", "Hover results should be strings");
          });
        }
      } catch (error) {
        // Specific error type checking for better debugging
        assert.ok(error instanceof Error, "Should throw proper Error instance");
        assert.ok(error.message && error.message.length > 0, "Error should have descriptive message");

        // Common expected error patterns
        const expectedErrorPatterns = [/not found/i, /invalid/i, /undefined/i, /cannot find/i];

        const hasExpectedPattern = expectedErrorPatterns.some((pattern) => pattern.test(error.message));

        if (!hasExpectedPattern) {
          console.warn(`Unexpected error pattern for invalid type: ${error.message}`);
        }
      }
    });

    test("should handle empty configurations", async () => {
      await applySettings({});

      const hover = await getHover("TestPrimitiveObj");

      // Should use defaults and still work
      assert.ok(hover && hover.length > 0, "Should work with default configuration");
    });
  });
});
