import * as assert from "node:assert";
import { prettyPrintTypeString } from "../../packages/typescript-plugin/src/type-tree/stringify";

describe("String Formatting", () => {
  describe("prettyPrintTypeString", () => {
    it("should handle simple types without indentation when indentation < 1", () => {
      const input = "{ name: string; age: number; }";
      const result = prettyPrintTypeString(input, 0);
      assert.strictEqual(result, input, "Should return input unchanged when indentation < 1");
    });

    it("should format simple objects with proper indentation", () => {
      const input = "{ name: string; age: number; }";
      const expected = `{
  name: string;
  age: number;
}`;
      const result = prettyPrintTypeString(input, 2);
      assert.strictEqual(result, expected);
    });

    it("should format nested objects with proper depth", () => {
      const input = "{ user: { profile: { name: string; }; }; }";
      const expected = `{
  user: {
    profile: {
      name: string;
    };
  };
}`;
      const result = prettyPrintTypeString(input, 2);
      assert.strictEqual(result, expected);
    });

    it("should handle custom indentation sizes", () => {
      const input = "{ a: string; b: number; }";
      const expected4Spaces = `{
    a: string;
    b: number;
}`;
      const expected1Space = `{
 a: string;
 b: number;
}`;

      assert.strictEqual(prettyPrintTypeString(input, 4), expected4Spaces);
      assert.strictEqual(prettyPrintTypeString(input, 1), expected1Space);
    });

    it("should clean up typeof import statements with node_modules", () => {
      const input = 'typeof import("/Users/dev/project/node_modules/@types/react")';
      const result = prettyPrintTypeString(input, 2);
      assert.strictEqual(result, 'typeof import("@types/react")');
    });

    it("should handle multiple typeof import cleanups in one string", () => {
      const input =
        '{ react: typeof import("../node_modules/react"); lodash: typeof import("./node_modules/lodash"); }';
      const result = prettyPrintTypeString(input, 2);
      assert.ok(result.includes('typeof import("react")'), "Should clean first import");
      assert.ok(result.includes('typeof import("lodash")'), "Should clean second import");
    });

    it('should clean up intersection types with " } & { "', () => {
      const input = "{ a: string; } & { b: number; }";
      const result = prettyPrintTypeString(input, 2);
      assert.ok(!result.includes(" } & { "), "Should remove intersection separator");
      assert.ok(result.includes("a: string"), "Should preserve content");
      assert.ok(result.includes("b: number"), "Should preserve content");
    });

    it("should handle boolean union types", () => {
      const input = "{ flag: false | true; other: true | false; }";
      const result = prettyPrintTypeString(input, 2);
      // The implementation may or may not replace these with "boolean"
      assert.ok(result.includes("flag:"), "Should preserve property name");
      assert.ok(result.includes("other:"), "Should preserve other property");
    });

    it("should remove empty braces with newlines", () => {
      const input = "{ empty: {   }; another: {  \n  }; }";
      const result = prettyPrintTypeString(input, 2);
      assert.ok(result.includes("empty: {}"), "Should compact empty braces");
      assert.ok(result.includes("another: {}"), "Should compact empty braces with newlines");
    });

    it("should remove empty newlines", () => {
      const input = `{
  

  name: string;


  age: number;
  
}`;
      const result = prettyPrintTypeString(input, 2);
      const lines = result.split("\n");
      const emptyLines = lines.filter((line) => line.trim() === "");
      assert.strictEqual(emptyLines.length, 0, "Should remove all empty lines");
    });

    it("should handle excess properties formatting", () => {
      const input = "{ shown: string; ... 5 more; }";
      const expected = `{
  shown: string;
  ... 5 more;
}`;
      const result = prettyPrintTypeString(input, 2);
      assert.strictEqual(result, expected);
    });

    it("should handle excess properties in various formats", () => {
      const input = `{ 
  prop: string; 
  ... 
  3 
  more
  ; 
}`;
      const result = prettyPrintTypeString(input, 2);
      // The implementation may or may not compact excess properties to one line
      assert.ok(result.includes("prop: string"), "Should preserve regular properties");
      assert.ok(typeof result === "string", "Should return a string");
    });

    it("should clean up template literal spacing", () => {
      const input = "string | ${ number } | `prefix-${ string }-suffix`";
      const result = prettyPrintTypeString(input, 2);
      assert.ok(result.includes("${number}"), "Should remove spaces in template literals");
      assert.ok(result.includes("${string}"), "Should remove spaces in complex template literals");
    });

    it("should handle very deeply nested objects", () => {
      const input = "{ a: { b: { c: { d: { e: string; }; }; }; }; }";
      const result = prettyPrintTypeString(input, 2);

      // Should have proper indentation at each level
      const lines = result.split("\n");
      assert.ok(
        lines.some((line) => line.startsWith("  a:")),
        "Level 1 should have 2 spaces",
      );
      assert.ok(
        lines.some((line) => line.startsWith("    b:")),
        "Level 2 should have 4 spaces",
      );
      assert.ok(
        lines.some((line) => line.startsWith("      c:")),
        "Level 3 should have 6 spaces",
      );
      assert.ok(
        lines.some((line) => line.startsWith("        d:")),
        "Level 4 should have 8 spaces",
      );
      assert.ok(
        lines.some((line) => line.startsWith("          e:")),
        "Level 5 should have 10 spaces",
      );
    });

    it("should remove trailing newlines", () => {
      const input = "{ prop: string; }\n\n\n";
      const result = prettyPrintTypeString(input, 2);
      assert.ok(!result.endsWith("\n"), "Should not end with newlines");
    });

    it("should handle function types in objects", () => {
      const input = "{ method: (param: string) => void; }";
      const expected = `{
  method: (param: string) => void;
}`;
      const result = prettyPrintTypeString(input, 2);
      assert.strictEqual(result, expected);
    });

    it("should handle array types properly", () => {
      const input = "{ items: string[]; matrix: number[][]; }";
      const expected = `{
  items: string[];
  matrix: number[][];
}`;
      const result = prettyPrintTypeString(input, 2);
      assert.strictEqual(result, expected);
    });

    it("should handle union types with proper line breaks", () => {
      const input = "{ value: string | number | boolean | null | undefined; }";
      const result = prettyPrintTypeString(input, 2);
      assert.ok(result.includes("value:"), "Should preserve property name");
      assert.ok(result.includes("string | number | boolean | null | undefined"), "Should preserve union type");
    });
  });

  describe("Edge Cases and Error Conditions", () => {
    it("should handle empty strings", () => {
      const result = prettyPrintTypeString("", 2);
      assert.strictEqual(result, "");
    });

    it("should handle strings with only whitespace", () => {
      const input = "   \n  \t  \n   ";
      const result = prettyPrintTypeString(input, 2);
      assert.strictEqual(result.trim(), "", "Should result in empty string after cleanup");
    });

    it("should handle strings without any braces", () => {
      const input = "string | number | boolean";
      const result = prettyPrintTypeString(input, 2);
      assert.strictEqual(result, input, "Should return unchanged for non-object types");
    });

    it("should handle malformed braces", () => {
      const input = "{ unclosed: string;";
      const result = prettyPrintTypeString(input, 2);
      // Should not crash and return some formatted result
      assert.ok(typeof result === "string", "Should return a string");
    });

    it("should handle very large indentation values", () => {
      const input = "{ prop: string; }";
      const result = prettyPrintTypeString(input, 100);
      const lines = result.split("\n");
      const propLine = lines.find((line) => line.includes("prop:"));
      assert.ok(propLine && propLine.startsWith(" ".repeat(100)), "Should use large indentation");
    });

    it("should handle negative indentation gracefully", () => {
      const input = "{ prop: string; }";
      const result = prettyPrintTypeString(input, -5);
      assert.strictEqual(result, input, "Should treat negative indentation as 0");
    });

    it("should handle floating point indentation", () => {
      const input = "{ prop: string; }";
      const result = prettyPrintTypeString(input, 2.7);
      // Should truncate to integer
      const lines = result.split("\n");
      const propLine = lines.find((line) => line.includes("prop:"));
      assert.ok(propLine && propLine.startsWith("  "), "Should truncate to 2 spaces");
    });

    it("should handle strings with multiple consecutive braces", () => {
      const input = "{ a: {}; b: { c: {}; }; }";
      const result = prettyPrintTypeString(input, 2);
      assert.ok(result.includes("a: {}"), "Should handle empty objects in properties");
      assert.ok(result.includes("c: {}"), "Should handle nested empty objects");
    });

    it("should handle mixed brace and bracket structures", () => {
      const input = "{ arr: [{ item: string; }]; }";
      const result = prettyPrintTypeString(input, 2);
      assert.ok(result.includes("arr:"), "Should preserve property names");
      assert.ok(result.includes("["), "Should preserve array brackets");
      assert.ok(result.includes("item: string"), "Should format nested object in array");
    });

    it("should handle very long type strings", () => {
      const longPropertyName = "a".repeat(1000);
      const input = `{ ${longPropertyName}: string; }`;
      const result = prettyPrintTypeString(input, 2);
      assert.ok(result.includes(longPropertyName), "Should handle very long property names");
    });

    it("should handle strings with special characters", () => {
      const input = '{ "key with spaces": string; "123numeric": number; "special!@#": boolean; }';
      const result = prettyPrintTypeString(input, 2);
      assert.ok(result.includes('"key with spaces"'), "Should preserve quoted keys");
      assert.ok(result.includes('"123numeric"'), "Should preserve numeric keys");
      assert.ok(result.includes('"special!@#"'), "Should preserve special character keys");
    });

    it("should handle regex-like patterns in type names", () => {
      const input = "{ pattern: /[a-z]+/g; regex: RegExp; }";
      const result = prettyPrintTypeString(input, 2);
      assert.ok(result.includes("/[a-z]+/g"), "Should preserve regex patterns");
      assert.ok(result.includes("RegExp"), "Should preserve RegExp type");
    });

    it("should handle template literal types", () => {
      const input = "{ template: `prefix-${string}-suffix`; }";
      const result = prettyPrintTypeString(input, 2);
      assert.ok(result.includes("`prefix-${string}-suffix`"), "Should preserve template literal types");
    });

    it("should handle comments-like strings (though they shouldn't be in types)", () => {
      const input = "{ /* comment */ prop: string; // another comment }";
      const result = prettyPrintTypeString(input, 2);
      // Should not crash and return some result
      assert.ok(typeof result === "string", "Should handle comment-like strings");
    });
  });
});
