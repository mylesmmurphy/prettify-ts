import * as assert from "node:assert";

// Environment detection function (matches simplified production implementation)
function isTestEnvironment(env: { NODE_ENV?: string; VSCODE_TEST_ENV?: string } = process.env as any): boolean {
  if (!env) return false;

  const nodeEnv = env.NODE_ENV?.toLowerCase();
  const vscodeTestEnv = env.VSCODE_TEST_ENV?.toLowerCase();

  return nodeEnv === "test" || vscodeTestEnv === "true";
}

describe("Environment Detection", () => {
  describe("Primary environment indicators", () => {
    it("should detect test environment from NODE_ENV=test", () => {
      const result = isTestEnvironment({ NODE_ENV: "test" });
      assert.strictEqual(result, true);
    });

    it("should detect test environment from NODE_ENV=TEST (case insensitive)", () => {
      const result = isTestEnvironment({ NODE_ENV: "TEST" });
      assert.strictEqual(result, true);
    });

    it("should detect test environment from VSCODE_TEST_ENV=true", () => {
      const result = isTestEnvironment({ VSCODE_TEST_ENV: "true" });
      assert.strictEqual(result, true);
    });

    it("should detect test environment from VSCODE_TEST_ENV=TRUE (case insensitive)", () => {
      const result = isTestEnvironment({ VSCODE_TEST_ENV: "TRUE" });
      assert.strictEqual(result, true);
    });

    it("should not detect test environment with production NODE_ENV", () => {
      const result = isTestEnvironment({ NODE_ENV: "production" });
      assert.strictEqual(result, false);
    });

    it("should not detect test environment with false VSCODE_TEST_ENV", () => {
      const result = isTestEnvironment({ VSCODE_TEST_ENV: "false" });
      assert.strictEqual(result, false);
    });
  });

  describe("Fallback behavior", () => {
    it("should return false when no environment variables are set", () => {
      const result = isTestEnvironment({});
      assert.strictEqual(result, false);
    });

    it("should prioritize any positive environment variable", () => {
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
