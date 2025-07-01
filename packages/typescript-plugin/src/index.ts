import type * as ts from "typescript";

import { isPrettifyRequest } from "./request";
import type { PrettifyCompletionsTriggerCharacter, PrettifyResponse } from "./request";
import { getTypeInfoAtPosition } from "./type-tree";

function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    info.project.projectService.logger.info("Prettify LSP is starting");

    // Set up decorator object
    const proxy: ts.LanguageService = Object.create(null);
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const x = info.languageService[k]!;
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: unknown[]) => x.apply(info.languageService, args);
    }

    /**
     * Override getCompletionsAtPosition to provide prettify type information
     * This is a hack to allow us to use the completions API to trigger type information requests
     * TS does not provide a direct way to get type information otherwise, so we use the completions API
     */
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const requestBody = options?.triggerCharacter as PrettifyCompletionsTriggerCharacter;
      if (!isPrettifyRequest(requestBody)) {
        // If the request is not a prettify request, call the original method
        return info.languageService.getCompletionsAtPosition(fileName, position, options);
      }

      const program = info.project["program"] as ts.Program | undefined;
      if (!program) return undefined;

      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile) return undefined;

      const checker = program.getTypeChecker();

      const projectName = info.project.getProjectName();

      const prettifyResponse = getTypeInfoAtPosition(
        ts,
        checker,
        sourceFile,
        position,
        requestBody.options,
        program,
        projectName,
      );

      const response: PrettifyResponse = {
        // Follow the same structure as ts.CompletionInfo
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
        // Add metadata to the response
        __prettifyResponse: prettifyResponse,
      };

      return response;
    };

    return proxy;
  }

  return { create };
}

export = init;
