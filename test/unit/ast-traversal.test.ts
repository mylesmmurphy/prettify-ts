import * as assert from "node:assert";
import * as ts from "typescript";
import { getDescendantAtRange } from "../../packages/typescript-plugin/src/type-tree/get-ast-node";

describe("AST Traversal", () => {
  describe("getDescendantAtRange", () => {
    // Helper to create a source file for testing
    function createSourceFile(content: string, fileName = "test.ts"): ts.SourceFile {
      return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
    }

    it("should return the innermost node for a valid range", () => {
      const sourceText = `const value = 123;`;
      const sourceFile = createSourceFile(sourceText);

      // Find the numeric literal "123"
      const numberPos = sourceText.indexOf("123");
      const node = getDescendantAtRange(ts, sourceFile, [numberPos, numberPos + 3]);

      assert.ok(node, "Should return a node");
      assert.ok(ts.isNumericLiteral(node), "Should return numeric literal node");
      assert.strictEqual(node.getText(), "123");
    });

    it("should return the deepest nested node", () => {
      const sourceText = `const obj = { nested: { deep: 456 } };`;
      const sourceFile = createSourceFile(sourceText);

      // Find the numeric literal "456" deep in the nested object
      const numberPos = sourceText.indexOf("456");
      const node = getDescendantAtRange(ts, sourceFile, [numberPos, numberPos + 3]);

      assert.ok(node, "Should return a node");
      assert.ok(ts.isNumericLiteral(node), "Should return numeric literal node");
      assert.strictEqual(node.getText(), "456");
    });

    it("should handle identifier nodes", () => {
      const sourceText = `const myVariable = 'hello';`;
      const sourceFile = createSourceFile(sourceText);

      // Find the identifier "myVariable"
      const identifierPos = sourceText.indexOf("myVariable");
      const node = getDescendantAtRange(ts, sourceFile, [identifierPos, identifierPos + 10]);

      assert.ok(node, "Should return a node");
      assert.ok(ts.isIdentifier(node), "Should return identifier node");
      assert.strictEqual(node.getText(), "myVariable");
    });

    it("should return appropriate node when range is at file boundaries", () => {
      const sourceText = `const x = 1;`;
      const sourceFile = createSourceFile(sourceText);

      // Range at the very beginning
      const node = getDescendantAtRange(ts, sourceFile, [0, 0]);

      // Should return a node (might be source file or a token)
      assert.ok(node, "Should return a node for boundary position");
    });

    it("should handle ranges outside any child node", () => {
      const sourceText = `const x = 1;`;
      const sourceFile = createSourceFile(sourceText);

      // Range beyond the end of the file
      const node = getDescendantAtRange(ts, sourceFile, [1000, 1001]);

      // Should return the source file as fallback
      assert.strictEqual(node, sourceFile);
    });

    it("should handle zero-length ranges (single position)", () => {
      const sourceText = `const hello = "world";`;
      const sourceFile = createSourceFile(sourceText);

      // Single position at the start of "world"
      const stringPos = sourceText.indexOf('"world"');
      const node = getDescendantAtRange(ts, sourceFile, [stringPos + 1, stringPos + 1]);

      assert.ok(node, "Should return a node");
      // Should find the string literal or a token within it
      assert.ok(node.getText().includes("world") || ts.isStringLiteral(node.parent));
    });

    it("should handle multi-character ranges", () => {
      const sourceText = `function calculateSum(a: number, b: number): number { return a + b; }`;
      const sourceFile = createSourceFile(sourceText);

      // Select the entire "calculateSum" identifier
      const funcNameStart = sourceText.indexOf("calculateSum");
      const funcNameEnd = funcNameStart + "calculateSum".length;
      const node = getDescendantAtRange(ts, sourceFile, [funcNameStart, funcNameEnd]);

      assert.ok(node, "Should return a node");
      assert.ok(ts.isIdentifier(node), "Should return identifier node");
      assert.strictEqual(node.getText(), "calculateSum");
    });

    it("should handle ranges spanning multiple tokens", () => {
      const sourceText = `const result = a + b;`;
      const sourceFile = createSourceFile(sourceText);

      // Select "a + b" expression
      const exprStart = sourceText.indexOf("a +");
      const exprEnd = sourceText.indexOf("b;") + 1;
      const node = getDescendantAtRange(ts, sourceFile, [exprStart, exprEnd]);

      assert.ok(node, "Should return a node");
      // Should return a parent node that contains the entire expression
      const nodeText = node.getText();
      assert.ok(nodeText.includes("a") && nodeText.includes("b"), "Should contain both operands");
    });

    it("should handle complex nested structures", () => {
      const sourceText = `
        interface User {
          profile: {
            settings: {
              theme: string;
            }
          }
        }
      `;
      const sourceFile = createSourceFile(sourceText);

      // Find the "string" keyword deep in the interface
      const stringPos = sourceText.indexOf("string");
      const node = getDescendantAtRange(ts, sourceFile, [stringPos, stringPos + 6]);

      assert.ok(node, "Should return a node");
      assert.ok(ts.isTypeNode(node) || node.getText() === "string", "Should find the type node");
    });

    it("should handle function expressions and arrow functions", () => {
      const sourceText = `const fn = (x: number) => x * 2;`;
      const sourceFile = createSourceFile(sourceText);

      // Find the parameter "x"
      const paramPos = sourceText.indexOf("x: number");
      const node = getDescendantAtRange(ts, sourceFile, [paramPos, paramPos + 1]);

      assert.ok(node, "Should return a node");
      assert.ok(ts.isIdentifier(node), "Should return identifier node");
      assert.strictEqual(node.getText(), "x");
    });

    it("should handle invalid ranges gracefully", () => {
      const sourceText = `const test = true;`;
      const sourceFile = createSourceFile(sourceText);

      // Invalid range where start > end
      const node = getDescendantAtRange(ts, sourceFile, [10, 5]);

      // Should return a node (implementation handles invalid ranges)
      assert.ok(node, "Should return a node even for invalid ranges");
    });

    it("should handle empty source files", () => {
      const sourceFile = createSourceFile("");

      const node = getDescendantAtRange(ts, sourceFile, [0, 0]);

      // Should return a node for empty source files
      assert.ok(node, "Should return a node for empty source files");
    });

    it("should handle whitespace-only ranges", () => {
      const sourceText = `const a = 1;   const b = 2;`;
      const sourceFile = createSourceFile(sourceText);

      // Range in the whitespace between statements
      const whitespaceStart = sourceText.indexOf(";") + 1;
      const whitespaceEnd = sourceText.indexOf("const b") - 1;
      const node = getDescendantAtRange(ts, sourceFile, [whitespaceStart, whitespaceEnd]);

      // Should return source file or a parent node for whitespace
      assert.ok(node, "Should return a node");
    });

    it("should handle ranges at exact token boundaries", () => {
      const sourceText = `if (condition) { return true; }`;
      const sourceFile = createSourceFile(sourceText);

      // Range exactly covering "condition"
      const condStart = sourceText.indexOf("condition");
      const condEnd = condStart + "condition".length;
      const node = getDescendantAtRange(ts, sourceFile, [condStart, condEnd]);

      assert.ok(node, "Should return a node");
      assert.ok(ts.isIdentifier(node), "Should return identifier node");
      assert.strictEqual(node.getText(), "condition");
    });

    it("should handle TypeScript-specific syntax", () => {
      const sourceText = `type GenericType<T extends string> = T | 'default';`;
      const sourceFile = createSourceFile(sourceText);

      // Find the type parameter "T"
      const typeParamPos = sourceText.indexOf("<T");
      const node = getDescendantAtRange(ts, sourceFile, [typeParamPos + 1, typeParamPos + 2]);

      assert.ok(node, "Should return a node");
      assert.strictEqual(node.getText(), "T");
    });
  });

  describe("Edge Cases and Error Conditions", () => {
    it("should handle malformed source files gracefully", () => {
      // Create a source file with syntax errors
      const sourceText = `const = = = invalid syntax`;
      const sourceFile = ts.createSourceFile("test.ts", sourceText, ts.ScriptTarget.Latest, true);

      // Should not throw even with invalid syntax
      assert.doesNotThrow(() => {
        const node = getDescendantAtRange(ts, sourceFile, [0, 5]);
        assert.ok(node, "Should return some node even for malformed code");
      });
    });

    it("should handle very large ranges", () => {
      const sourceText = `const x = 1;`;
      const sourceFile = ts.createSourceFile("test.ts", sourceText, ts.ScriptTarget.Latest, true);

      // Range much larger than the file
      const node = getDescendantAtRange(ts, sourceFile, [0, 999999]);

      // Should return the source file for oversized ranges
      assert.strictEqual(node, sourceFile);
    });

    it("should handle negative positions", () => {
      const sourceText = `const x = 1;`;
      const sourceFile = ts.createSourceFile("test.ts", sourceText, ts.ScriptTarget.Latest, true);

      const node = getDescendantAtRange(ts, sourceFile, [-5, -1]);

      // Should return source file for negative positions
      assert.strictEqual(node, sourceFile);
    });
  });
});
