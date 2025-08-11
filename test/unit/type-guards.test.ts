import * as assert from "node:assert";

// Type guard functions (copied from main implementation)
function hasProgram(project: any): project is { program: any } {
  return Boolean(project && typeof project === "object" && "program" in project && project.program);
}

function isValidTypeScriptNode(node: any): node is { kind: number } {
  return Boolean(node && typeof node === "object" && "kind" in node && typeof node.kind === "number");
}

describe("Type Guards", () => {
  describe("hasProgram", () => {
    it("should return true for valid project with program", () => {
      const project = {
        program: { getSourceFile: () => {} },
        otherProperty: "value",
      };

      const result = hasProgram(project);
      assert.strictEqual(result, true);
    });

    it("should return false for null or undefined", () => {
      assert.strictEqual(hasProgram(null), false);
      assert.strictEqual(hasProgram(undefined), false);
    });

    it("should return false for non-object values", () => {
      assert.strictEqual(hasProgram("string"), false);
      assert.strictEqual(hasProgram(123), false);
      assert.strictEqual(hasProgram(true), false);
    });

    it("should return false for object without program property", () => {
      const project = {
        languageService: { getProgram: () => {} },
      };

      assert.strictEqual(hasProgram(project), false);
    });

    it("should return false for object with falsy program property", () => {
      assert.strictEqual(hasProgram({ program: null }), false);
      assert.strictEqual(hasProgram({ program: undefined }), false);
      assert.strictEqual(hasProgram({ program: false }), false);
      assert.strictEqual(hasProgram({ program: 0 }), false);
      assert.strictEqual(hasProgram({ program: "" }), false);
    });

    it("should return true for object with truthy program property", () => {
      assert.strictEqual(hasProgram({ program: {} }), true);
      assert.strictEqual(hasProgram({ program: "program" }), true);
      assert.strictEqual(hasProgram({ program: 1 }), true);
    });
  });

  describe("isValidTypeScriptNode", () => {
    it("should return true for valid TypeScript node", () => {
      const node = {
        kind: 123,
        text: "example",
        parent: null,
      };

      assert.strictEqual(isValidTypeScriptNode(node), true);
    });

    it("should return false for null or undefined", () => {
      assert.strictEqual(isValidTypeScriptNode(null), false);
      assert.strictEqual(isValidTypeScriptNode(undefined), false);
    });

    it("should return false for non-object values", () => {
      assert.strictEqual(isValidTypeScriptNode("string"), false);
      assert.strictEqual(isValidTypeScriptNode(123), false);
      assert.strictEqual(isValidTypeScriptNode(true), false);
    });

    it("should return false for object without kind property", () => {
      const node = {
        text: "example",
        parent: null,
      };

      assert.strictEqual(isValidTypeScriptNode(node), false);
    });

    it("should return false for object with non-numeric kind", () => {
      assert.strictEqual(isValidTypeScriptNode({ kind: "string" }), false);
      assert.strictEqual(isValidTypeScriptNode({ kind: null }), false);
      assert.strictEqual(isValidTypeScriptNode({ kind: undefined }), false);
      assert.strictEqual(isValidTypeScriptNode({ kind: {} }), false);
    });

    it("should return true for valid numeric kind values", () => {
      assert.strictEqual(isValidTypeScriptNode({ kind: 0 }), true);
      assert.strictEqual(isValidTypeScriptNode({ kind: -1 }), true);
      assert.strictEqual(isValidTypeScriptNode({ kind: 999 }), true);
      assert.strictEqual(isValidTypeScriptNode({ kind: 123.0 }), true);
    });
  });
});
