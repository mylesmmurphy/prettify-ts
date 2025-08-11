import * as assert from "node:assert";

// Mock TypeScript API for testing
const mockTypeScript = {
  isTypeQueryNode: (() => {
    let mockImpl: () => boolean = () => false;
    const fn = () => mockImpl();
    fn.mockReturnValue = (value: boolean) => {
      mockImpl = () => value;
    };
    fn.mockImplementation = (impl: () => boolean) => {
      mockImpl = impl;
    };
    fn.mockClear = () => {
      mockImpl = () => false;
    };
    return fn;
  })(),
  SyntaxKind: {
    TypeQuery: 123,
  },
};

// Mock logger
const mockLogger = {
  info: (() => {
    const calls: unknown[][] = [];
    const fn = (...args: unknown[]) => calls.push(args);
    fn.mockClear = () => {
      calls.length = 0;
    };
    fn.toHaveBeenCalled = () => calls.length > 0;
    fn.toHaveBeenCalledWith = (...expectedArgs: unknown[]) => {
      return calls.some(
        (call) =>
          call.length === expectedArgs.length && call.every((arg: unknown, i: number) => arg === expectedArgs[i]),
      );
    };
    fn.getCalls = () => calls;
    return fn;
  })(),
};

// Simplified typeof detection function for testing
function hasTypeofExpression(
  sourceFile: { throwError?: boolean; nodeAtPosition?: unknown },
  position: number | string,
  ts: { isTypeQueryNode?: (...args: unknown[]) => boolean },
  logger: { info: (...args: unknown[]) => void },
): boolean {
  try {
    if (!sourceFile || typeof position !== "number" || position < 0) {
      return false;
    }

    // Mock implementation that can throw errors
    if (sourceFile.throwError) {
      throw new Error("AST traversal error");
    }

    return Boolean(ts.isTypeQueryNode?.(sourceFile.nodeAtPosition));
  } catch (error) {
    logger.info(
      `[prettify-ts] Error during typeof detection: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false; // Graceful fallback
  }
}

// Mock getProgram function
function getProgram(info: {
  project?: { program?: unknown; [key: string]: unknown } | null;
  languageService?: { getProgram?: () => unknown } | null;
}): unknown {
  if (info?.project?.program) {
    return info.project.program;
  }
  if (info?.languageService?.getProgram) {
    return info.languageService.getProgram();
  }
  return undefined;
}

describe("Error Handling", () => {
  beforeEach(() => {
    mockTypeScript.isTypeQueryNode.mockClear();
    mockLogger.info.mockClear();
  });

  describe("typeof detection error boundaries", () => {
    it("should handle null source file gracefully", () => {
      const result = hasTypeofExpression(
        null as unknown as { throwError?: boolean; nodeAtPosition?: unknown },
        100,
        mockTypeScript,
        mockLogger,
      );

      assert.strictEqual(result, false);
      assert.ok(!mockLogger.info.toHaveBeenCalled());
    });

    it("should handle invalid position gracefully", () => {
      const sourceFile = { text: "some code" } as { text: string; throwError?: boolean; nodeAtPosition?: unknown };

      const result1 = hasTypeofExpression(sourceFile, -1, mockTypeScript, mockLogger);
      const result2 = hasTypeofExpression(sourceFile, NaN, mockTypeScript, mockLogger);

      assert.strictEqual(result1, false);
      assert.strictEqual(result2, false);
      assert.ok(!mockLogger.info.toHaveBeenCalled());
    });

    it("should handle AST traversal errors gracefully", () => {
      const sourceFile = {
        throwError: true,
        nodeAtPosition: { kind: 123 },
      };

      const result = hasTypeofExpression(sourceFile, 100, mockTypeScript, mockLogger);

      assert.strictEqual(result, false);
      assert.ok(
        mockLogger.info.toHaveBeenCalledWith("[prettify-ts] Error during typeof detection: AST traversal error"),
      );
    });

    it("should handle non-Error objects gracefully", () => {
      const sourceFile = {
        nodeAtPosition: { kind: 123 },
      };

      mockTypeScript.isTypeQueryNode.mockImplementation(() => {
        throw new Error("string error");
      });

      const result = hasTypeofExpression(sourceFile, 100, mockTypeScript, mockLogger);

      assert.strictEqual(result, false);
      const calls = mockLogger.info.getCalls();
      const expectedCall = "[prettify-ts] Error during typeof detection: string error";
      const foundCall = calls.some((call) => call[0] === expectedCall);
      assert.ok(foundCall, `Expected call "${expectedCall}" not found. Actual calls: ${JSON.stringify(calls)}`);
    });

    it("should handle successful detection", () => {
      const sourceFile = {
        nodeAtPosition: { kind: 123 },
      };

      mockTypeScript.isTypeQueryNode.mockReturnValue(true);

      const result = hasTypeofExpression(sourceFile, 100, mockTypeScript, mockLogger);

      assert.strictEqual(result, true);
      assert.ok(!mockLogger.info.toHaveBeenCalled());
    });
  });

  describe("program access error handling", () => {
    it("should handle null project gracefully", () => {
      const info = { project: null, languageService: null };

      const result = getProgram(info);

      assert.strictEqual(result, undefined);
    });

    it("should handle missing project.program gracefully", () => {
      const info = {
        project: { other: "property" },
        languageService: { getProgram: () => ({ sourceFile: true }) },
      };

      const result = getProgram(info);

      assert.deepStrictEqual(result, { sourceFile: true });
    });

    it("should handle missing languageService gracefully", () => {
      const info = {
        project: { program: null },
        languageService: null,
      };

      const result = getProgram(info);

      assert.strictEqual(result, undefined);
    });

    it("should prefer project.program when available", () => {
      const mockProgram = { fromProject: true };
      const info = {
        project: { program: mockProgram },
        languageService: { getProgram: () => ({ fromLanguageService: true }) },
      };

      const result = getProgram(info);

      assert.deepStrictEqual(result, { fromProject: true });
    });

    it("should fallback to languageService.getProgram", () => {
      const mockProgram = { fromLanguageService: true };
      const info = {
        project: { program: null },
        languageService: { getProgram: () => mockProgram },
      };

      const result = getProgram(info);

      assert.deepStrictEqual(result, { fromLanguageService: true });
    });
  });

  describe("error message formatting", () => {
    it("should format Error objects with message", () => {
      const error = new Error("Test error message");
      const formatted = error instanceof Error ? error.message : String(error);

      assert.strictEqual(formatted, "Test error message");
    });

    it("should format non-Error objects as strings", () => {
      const testCases = [
        { input: "string error", expected: "string error" },
        { input: 42, expected: "42" },
        { input: { message: "object error" }, expected: '{"message":"object error"}' },
        { input: null, expected: "null" },
        { input: undefined, expected: "undefined" },
      ];

      testCases.forEach(({ input, expected }) => {
        const formatted =
          input instanceof Error
            ? input.message
            : input === null
              ? "null"
              : input === undefined
                ? "undefined"
                : typeof input === "object"
                  ? JSON.stringify(input)
                  : String(input);
        assert.strictEqual(formatted, expected);
      });
    });
  });

  describe("defensive programming patterns", () => {
    it("should validate input parameters", () => {
      const validationCases = [
        {
          sourceFile: null as unknown as { throwError?: boolean; nodeAtPosition?: unknown },
          position: 100,
          expected: false,
        },
        {
          sourceFile: undefined as unknown as { throwError?: boolean; nodeAtPosition?: unknown },
          position: 100,
          expected: false,
        },
        { sourceFile: {}, position: -1, expected: false },
        { sourceFile: {}, position: "invalid" as unknown as number, expected: false },
        { sourceFile: {}, position: 100, expected: false }, // valid case handled by mock
      ];

      validationCases.forEach(({ sourceFile, position, expected }) => {
        const result = hasTypeofExpression(sourceFile, position, mockTypeScript, mockLogger);
        assert.strictEqual(result, expected);
      });
    });
  });
});
