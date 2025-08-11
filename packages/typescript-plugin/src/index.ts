import type * as ts from "typescript";

import type { PrettifyOptions, PrettifyCompletionsTriggerCharacter, PrettifyResponse } from "./request";
import { isPrettifyRequest } from "./request";
import { getTypeInfoAtPosition } from "./type-tree";
import { stringifyTypeTree, prettyPrintTypeString } from "./type-tree/stringify";

function getProgram(info: ts.server.PluginCreateInfo): ts.Program | undefined {
  const project = info.project as any;
  if (project && typeof project === "object" && "program" in project && project.program) {
    return project.program as ts.Program;
  }
  return info.languageService.getProgram();
}

function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const proxy: ts.LanguageService = Object.create(null);
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const x = info.languageService[k]!;
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: unknown[]) => x.apply(info.languageService, args);
    }

    /**
     * Override getQuickInfoAtPosition to provide enhanced type information with display parts.
     * This allows non-VS Code editors to receive semantic token information for syntax highlighting.
     */
    proxy.getQuickInfoAtPosition = (fileName, position) => {
      try {
        const originalQuickInfo = info.languageService.getQuickInfoAtPosition(fileName, position);
        if (!originalQuickInfo) {
          return originalQuickInfo;
        }

        const program = getProgram(info);
        if (program == null) {
          return originalQuickInfo;
        }

        const sourceFile = program.getSourceFile(fileName);
        if (sourceFile == null) {
          return originalQuickInfo;
        }

        const checker = program.getTypeChecker();

        // Read user configuration from the plugin config
        const userOptions = (info.config || {}) as Partial<PrettifyOptions>;

        // Default skipped type names (from VSCode extension package.json)
        const defaultSkippedTypeNames = [
          "Array",
          "ArrayBuffer",
          "Buffer",
          "Date",
          "Element",
          "Error",
          "Map",
          "Number",
          "RegExp",
          "Set",
          "String",
          "Symbol",
        ];

        // Default generic argument type names to unwrap (from VSCode extension package.json)
        const defaultUnwrapGenericArgumentsTypeNames = ["Promise", "Set", "Map", "Observable"];

        // Merge user options with defaults (matching VSCode extension defaults)
        const prettifyOptions: PrettifyOptions = {
          generateDisplayParts: true,
          hidePrivateProperties: userOptions.hidePrivateProperties ?? true,
          maxDepth: userOptions.maxDepth ?? 1, // VSCode default: 1
          maxFunctionSignatures: userOptions.maxFunctionSignatures ?? 5,
          maxProperties: userOptions.maxProperties ?? 1000, // VSCode default: 1000
          maxSubProperties: userOptions.maxSubProperties ?? 10, // VSCode default: 10
          maxUnionMembers: userOptions.maxUnionMembers ?? 15,
          skippedTypeNames: userOptions.skippedTypeNames ?? defaultSkippedTypeNames,
          unwrapArrays: userOptions.unwrapArrays ?? true,
          unwrapFunctions: userOptions.unwrapFunctions ?? true,
          unwrapGenericArgumentsTypeNames:
            userOptions.unwrapGenericArgumentsTypeNames ?? defaultUnwrapGenericArgumentsTypeNames,
        };

        const prettifyTypeInfo = getTypeInfoAtPosition(
          ts,
          checker,
          sourceFile,
          position,
          prettifyOptions,
          program,
          info.project.projectService.logger,
        );

        if (prettifyTypeInfo && prettifyTypeInfo.typeTree) {
          const typeString = stringifyTypeTree(prettifyTypeInfo.typeTree, false);
          const prettyTypeString = prettyPrintTypeString(typeString, 2);
          const enhancedDisplayString = `${prettifyTypeInfo.declaration}${prettyTypeString}`;

          const originalTypeDisplay = originalQuickInfo.displayParts
            ? originalQuickInfo.displayParts.map((p: ts.SymbolDisplayPart) => p.text).join("")
            : "";

          const shouldShowPrettified =
            typeString !== prettifyTypeInfo.name &&
            !typeString.includes("... ") &&
            enhancedDisplayString.trim() !== originalTypeDisplay.trim();

          const newDocumentation: ts.SymbolDisplayPart[] = [];

          if (shouldShowPrettified) {
            newDocumentation.push({ text: "```typescript\n", kind: "text" });
            newDocumentation.push({ text: enhancedDisplayString, kind: "text" });
            newDocumentation.push({ text: "\n```", kind: "text" });

            if (originalTypeDisplay) {
              newDocumentation.push({ text: "\n\n---\n\n", kind: "text" });
            }
          }

          if (originalTypeDisplay) {
            newDocumentation.push({ text: "```typescript\n", kind: "text" });
            newDocumentation.push({ text: originalTypeDisplay, kind: "text" });
            newDocumentation.push({ text: "\n```", kind: "text" });
          }

          if (originalQuickInfo.documentation && originalQuickInfo.documentation.length > 0) {
            newDocumentation.push({ text: "\n\n---\n\n", kind: "text" });
            newDocumentation.push(...originalQuickInfo.documentation);
          }

          const enhancedQuickInfo = {
            ...originalQuickInfo,
            displayParts: [],
            documentation: newDocumentation,
            __prettifyTypeTree: prettifyTypeInfo.typeTree,
            __prettifyDeclaration: prettifyTypeInfo.declaration,
            __prettifyName: prettifyTypeInfo.name,
          };

          return enhancedQuickInfo;
        }

        return originalQuickInfo;
      } catch (error) {
        info.project.projectService.logger.info(
          `[prettify-ts] Error in getQuickInfoAtPosition: ${error instanceof Error ? error.message : String(error)}`,
        );
        return info.languageService.getQuickInfoAtPosition(fileName, position);
      }
    };

    /**
     * Override getCompletionsAtPosition to provide prettify type information for VS Code extension.
     * This is a hack to allow the VS Code extension to use the completions API to trigger type information requests.
     * TS does not provide a direct way to get type information otherwise for VS Code extensions.
     */
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const requestBody = options?.triggerCharacter as PrettifyCompletionsTriggerCharacter;
      if (!isPrettifyRequest(requestBody)) {
        // If the request is not a prettify request, call the original method.
        return info.languageService.getCompletionsAtPosition(fileName, position, options);
      }

      const program = getProgram(info);
      if (program == null) return undefined;

      const sourceFile = program.getSourceFile(fileName);
      if (sourceFile == null) return undefined;

      const checker = program.getTypeChecker();

      const prettifyResponse = getTypeInfoAtPosition(
        ts,
        checker,
        sourceFile,
        position,
        requestBody.options,
        program,
        info.project.projectService.logger,
      );

      const response: PrettifyResponse = {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
        __prettifyResponse: prettifyResponse,
      };

      return response;
    };

    return proxy;
  }

  return { create };
}

export = init;
