import * as assert from "node:assert";

// Environment detection function (matches production implementation)
function isTestEnvironment(env: { NODE_ENV?: string; VSCODE_TEST_ENV?: string } = process.env as any): boolean {
  if (!env) return false;

  const nodeEnv = env.NODE_ENV?.toLowerCase();
  const vscodeTestEnv = env.VSCODE_TEST_ENV?.toLowerCase();

  return nodeEnv === "test" || vscodeTestEnv === "true";
}

suite("Environment Detection Logic", () => {
  suite("Environment Variables", () => {
    test("should detect test environment from NODE_ENV=test", () => {
      const result = isTestEnvironment({ NODE_ENV: "test" });
      assert.strictEqual(result, true);
    });

    test("should detect test environment from NODE_ENV=TEST (case insensitive)", () => {
      const result = isTestEnvironment({ NODE_ENV: "TEST" });
      assert.strictEqual(result, true);
    });

    test("should detect test environment from VSCODE_TEST_ENV=true", () => {
      const result = isTestEnvironment({ VSCODE_TEST_ENV: "true" });
      assert.strictEqual(result, true);
    });

    test("should detect test environment from VSCODE_TEST_ENV=TRUE (case insensitive)", () => {
      const result = isTestEnvironment({ VSCODE_TEST_ENV: "TRUE" });
      assert.strictEqual(result, true);
    });

    test("should not detect test environment with production NODE_ENV", () => {
      const result = isTestEnvironment({ NODE_ENV: "production" });
      assert.strictEqual(result, false);
    });

    test("should not detect test environment with false VSCODE_TEST_ENV", () => {
      const result = isTestEnvironment({ VSCODE_TEST_ENV: "false" });
      assert.strictEqual(result, false);
    });
  });

  suite("Edge Cases", () => {
    test("should return false when no environment variables are set", () => {
      const result = isTestEnvironment({});
      assert.strictEqual(result, false);
    });

    test("should handle null environment object gracefully", () => {
      const result = isTestEnvironment(null as unknown as { NODE_ENV?: string; VSCODE_TEST_ENV?: string });
      assert.strictEqual(result, false);
    });

    test("should handle case-insensitive environment variable detection", () => {
      const testCases = [
        { NODE_ENV: "test", expected: true },
        { NODE_ENV: "Test", expected: true },
        { NODE_ENV: "TEST", expected: true },
        { NODE_ENV: "testing", expected: false },
        { VSCODE_TEST_ENV: "true", expected: true },
        { VSCODE_TEST_ENV: "True", expected: true },
        { VSCODE_TEST_ENV: "TRUE", expected: true },
        { VSCODE_TEST_ENV: "false", expected: false },
      ];

      testCases.forEach(({ NODE_ENV, VSCODE_TEST_ENV, expected }) => {
        const env: { NODE_ENV?: string; VSCODE_TEST_ENV?: string } = {};
        if (NODE_ENV) env.NODE_ENV = NODE_ENV;
        if (VSCODE_TEST_ENV) env.VSCODE_TEST_ENV = VSCODE_TEST_ENV;

        const result = isTestEnvironment(env);
        assert.strictEqual(result, expected);
      });
    });

    test("should prioritize any positive environment variable", () => {
      // Both set to test values
      const result1 = isTestEnvironment({ NODE_ENV: "test", VSCODE_TEST_ENV: "true" });
      assert.strictEqual(result1, true);

      // Mixed values - NODE_ENV positive
      const result2 = isTestEnvironment({ NODE_ENV: "test", VSCODE_TEST_ENV: "false" });
      assert.strictEqual(result2, true);

      // Mixed values - VSCODE_TEST_ENV positive
      const result3 = isTestEnvironment({ NODE_ENV: "production", VSCODE_TEST_ENV: "true" });
      assert.strictEqual(result3, true);
    });
  });
});
