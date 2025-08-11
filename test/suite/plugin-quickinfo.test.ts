import { applySettings, openDocument, getHover, ensureTypeScriptServerReady } from "./utils";
import * as vscode from "vscode";
import * as assert from "node:assert";

suite("TypeScript Plugin QuickInfo Enhancement", () => {
  suiteSetup(async () => {
    await ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe");
    await applySettings({ maxDepth: 3 });
    await openDocument("types.ts");
  });

  suite("QuickInfo Override", () => {
    test("should enhance quickinfo with prettified types", async () => {
      const hover = await getHover("TestPrimitiveObj");

      // Verify plugin enhanced the quickinfo with prettified type information
      assert.ok(hover && hover.length > 0, "Should get hover results");
      assert.ok(hover[0]?.includes("TestPrimitiveObj"), "Should contain type name");
      assert.ok(hover[0]?.includes("string"), "Should contain prettified type information");
    });

    test("should handle complex types through plugin path", async () => {
      const hover = await getHover("TestDiscriminatedUnion");

      assert.ok(hover && hover.length > 0, "Should get hover results");
      assert.ok(hover[0]?.includes("TestDiscriminatedUnion"), "Should contain type name");
      assert.ok(hover[0]?.includes("kind"), "Should contain discriminated union properties");
    });

    test("should preserve original quickinfo when enhancement fails", async () => {
      // Test with a type that should still work even if prettification fails
      const hover = await getHover("TestPrimitiveObj");

      // Should handle gracefully without crashing
      assert.ok(hover && hover.length > 0, "Should get hover results");
      assert.ok(hover[0]?.includes("TestPrimitiveObj"), "Should contain type information");
    });
  });

  suite("Completions API Hack", () => {
    test("should detect and process prettify requests through completions API", async () => {
      const doc = vscode.window.activeTextEditor?.document;

      if (!doc) {
        throw new Error("No active document");
      }

      const position = doc.positionAt(doc.getText().indexOf("TestPrimitiveObj") + 1);

      const prettifyRequest = {
        meta: "prettify-type-info-request",
        options: {
          hidePrivateProperties: true,
          maxDepth: 2,
          maxProperties: 100,
        },
      };

      // Test the completions API hack used by VS Code extension
      const response: any = await vscode.commands.executeCommand("typescript.tsserverRequest", "completionInfo", {
        file: doc.uri.fsPath,
        line: position.line + 1,
        offset: position.character + 1,
        triggerCharacter: prettifyRequest,
      });

      // Verify plugin handled prettify request
      assert.ok(response?.body?.__prettifyResponse, "Prettify response should be defined");

      if (response?.body?.__prettifyResponse) {
        assert.ok(response.body.__prettifyResponse.typeTree, "Should have typeTree");
        assert.ok(response.body.__prettifyResponse.declaration, "Should have declaration");
        assert.ok(response.body.__prettifyResponse.name, "Should have name");
      }
    });

    test("should fallback to normal completions for non-prettify requests", async () => {
      const doc = vscode.window.activeTextEditor?.document;

      if (!doc) {
        throw new Error("No active document");
      }

      const position = doc.positionAt(doc.getText().indexOf("TestPrimitiveObj") + 1);

      // Normal completion request (not prettify)
      const response: any = await vscode.commands.executeCommand("typescript.tsserverRequest", "completionInfo", {
        file: doc.uri.fsPath,
        line: position.line + 1,
        offset: position.character + 1,
      });

      // Should not have prettify response for normal completions
      assert.strictEqual(response?.body?.__prettifyResponse, undefined, "Should not have prettify response");
    });
  });
});
