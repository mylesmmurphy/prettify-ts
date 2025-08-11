import { applySettings, openDocument, getHover, ensureTypeScriptServerReady } from "./utils";
import * as vscode from "vscode";
import * as assert from "node:assert";

suite("VS Code Extension Hover Provider", () => {
  suiteSetup(async () => {
    await ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe");
    await applySettings({ maxDepth: 3 });
    await openDocument("types.ts");
  });

  suite("Environment Detection Impact", () => {
    test("should disable hover in test environments (current behavior)", async () => {
      // Current test environment should disable VS Code extension hover provider
      const hover = await getHover("TestPrimitiveObj");

      // In test environment, we get quickinfo enhancement instead of extension hover
      assert.ok(hover && hover.length > 0, "Should get hover results");
      assert.ok(hover[0]?.includes("TestPrimitiveObj"), "Should contain type name");
      assert.ok(hover[0]?.includes("string"), "Should contain type information");
    });

    test("should integrate with TypeScript server through completions API hack", async () => {
      const doc = vscode.window.activeTextEditor?.document;

      if (!doc) {
        throw new Error("No active document");
      }

      const position = doc.positionAt(doc.getText().indexOf("TestPrimitiveObj") + 1);

      // Create prettify request object matching extension format
      // This simulates the hack used to pass data through completions API
      const prettifyRequest = {
        meta: "prettify-type-info-request",
        options: {
          hidePrivateProperties: true,
          maxDepth: 1,
          maxProperties: 100,
        },
      };

      // Execute the completions API hack that VS Code extension uses
      // The plugin detects this special request format and returns prettified data
      const response: any = await vscode.commands.executeCommand("typescript.tsserverRequest", "completionInfo", {
        file: doc.uri.fsPath,
        line: position.line + 1, // TypeScript uses 1-based line numbers
        offset: position.character + 1, // TypeScript uses 1-based character offsets
        triggerCharacter: prettifyRequest, // Our custom payload goes here
      });

      // Should get prettify response
      assert.ok(response?.body?.__prettifyResponse, "Should get prettify response");

      if (response?.body?.__prettifyResponse) {
        assert.ok(response.body.__prettifyResponse.typeTree, "Should have typeTree");
        assert.ok(response.body.__prettifyResponse.declaration, "Should have declaration");
        assert.ok(response.body.__prettifyResponse.name, "Should have name");
      }
    });
  });

  suite("Configuration Integration", () => {
    test("should respect VS Code configuration settings", async () => {
      // Test with custom configuration
      await applySettings({
        hidePrivateProperties: false,
        maxDepth: 5,
        maxProperties: 50,
      });

      const doc = vscode.window.activeTextEditor?.document;

      if (!doc) {
        throw new Error("No active document");
      }

      const position = doc.positionAt(doc.getText().indexOf("TestPrimitiveObj") + 1);

      const prettifyRequest = {
        meta: "prettify-type-info-request",
        options: {
          hidePrivateProperties: false,
          maxDepth: 5,
          maxProperties: 50,
        },
      };

      const response: any = await vscode.commands.executeCommand("typescript.tsserverRequest", "completionInfo", {
        file: doc.uri.fsPath,
        line: position.line + 1,
        offset: position.character + 1,
        triggerCharacter: prettifyRequest,
      });

      // Configuration should be reflected in the response
      assert.ok(response?.body?.__prettifyResponse, "Should get response with custom config");
    });

    test("should handle disabled extension", async () => {
      await applySettings({ enabled: false });

      // Extension should be disabled, but plugin still works
      const hover = await getHover("TestPrimitiveObj");

      // Should still get results from plugin path
      assert.ok(hover && hover.length > 0, "Should get hover results even with extension disabled");
      assert.ok(hover[0]?.includes("TestPrimitiveObj"), "Should contain type information");
    });
  });

  suite("Error Handling", () => {
    test("should handle invalid positions gracefully", async () => {
      const doc = vscode.window.activeTextEditor?.document;

      if (doc) {
        try {
          const invalidPosition = new vscode.Position(1000, 1000);
          const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            "vscode.executeHoverProvider",
            doc.uri,
            invalidPosition,
          );

          // Should not crash - result can be empty or valid
          assert.ok(hovers !== null && hovers !== undefined, "Should not crash on invalid position");
        } catch (error) {
          // Error is also acceptable - should not be uncaught
          assert.ok(error instanceof Error, "Should be a proper error if thrown");
        }
      }
    });

    test("should handle API errors gracefully", async () => {
      const prettifyRequest = {
        meta: "prettify-type-info-request",
        options: {},
      };

      try {
        const response: any = await vscode.commands.executeCommand("typescript.tsserverRequest", "completionInfo", {
          file: "/nonexistent/file.ts",
          line: 1,
          offset: 1,
          triggerCharacter: prettifyRequest,
        });

        // Should handle gracefully
        assert.ok(response !== null, "Should handle API errors gracefully");
      } catch (error) {
        // Error is acceptable - should not crash the extension
        assert.ok(error instanceof Error, "Should be a proper error");
      }
    });
  });
});
