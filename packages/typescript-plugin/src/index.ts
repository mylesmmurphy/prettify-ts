import type * as ts from "typescript";

import type { PrettifyOptions } from "@prettify-ts/core/src/options";
import { renderHoverPreview } from "@prettify-ts/core/src/preview";
import { mergeQuickInfo } from "./merge-quick-info";
import { isPrettifyRequest } from "./request";
import type { PrettifyCompletionsTriggerCharacter, PrettifyResponse } from "./request";
import { resolveHoverSettings } from "./settings";
import type { PluginConfiguration } from "./settings";
import { getTypeInfoAtPosition } from "./type-tree";
import { getVueLanguage } from "./type-tree/vue";

function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const ts = modules.typescript;
  // tsconfig `plugins` settings, replaced by the VS Code extension's settings when it sends them.
  let configuration: PluginConfiguration = {};

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const logger = info.project.projectService.logger;
    logger.info("Prettify LSP is starting");
    if (info.config && typeof info.config === "object") configuration = { ...(info.config as PluginConfiguration) };

    // Set up decorator object
    const proxy: ts.LanguageService = Object.create(null);
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      // Preserve the language service receiver when forwarding methods.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const x = info.languageService[k]!;
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: unknown[]) => x.apply(info.languageService, args);
    }

    function typeInfoAt(fileName: string, position: number, options: PrettifyOptions) {
      const program = info.languageService.getProgram();
      if (!program) return undefined;
      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile) return undefined;
      return getTypeInfoAtPosition(
        ts,
        program.getTypeChecker(),
        sourceFile,
        position,
        options,
        getVueLanguage(info.project) || getVueLanguage(program),
        {
          compilerOptions: program.getCompilerOptions(),
          isCancellationRequested: () => info.project.getCancellationToken().isCancellationRequested(),
          onError: (error) => logger.info("Prettify analysis failed: " + String(error)),
        },
      );
    }

    /**
     * Override getCompletionsAtPosition to provide prettify type information
     * This is a hack to allow us to use the completions API to trigger type information requests
     * TS does not provide a direct way to get type information otherwise, so we use the completions API
     */
    proxy.getCompletionsAtPosition = (fileName, position, options, formattingSettings) => {
      const requestBody = options?.triggerCharacter as PrettifyCompletionsTriggerCharacter;
      if (!isPrettifyRequest(requestBody)) {
        // If the request is not a prettify request, call the original method
        return info.languageService.getCompletionsAtPosition(fileName, position, options, formattingSettings);
      }
      if (!info.languageService.getProgram()?.getSourceFile(fileName)) return undefined;

      const response: PrettifyResponse = {
        // Follow the same structure as ts.CompletionInfo
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
        // Add metadata to the response
        __prettifyResponse: typeInfoAt(fileName, position, requestBody.options),
      };

      return response;
    };

    /** Merged hovers: the preview becomes part of TypeScript's own quick info, for any editor. */
    proxy.getQuickInfoAtPosition = (fileName, position, ...rest) => {
      const quickInfo = info.languageService.getQuickInfoAtPosition(fileName, position, ...rest);
      // Vue hovers go through Vue's own language server, so Vue files keep the separate hover.
      if (!quickInfo || /\.vue$/i.test(fileName)) return quickInfo;
      try {
        const settings = resolveHoverSettings(configuration, fileName, ts.sys?.useCaseSensitiveFileNames ?? true);
        if (!settings.enabled || settings.mode !== "merged") return quickInfo;
        const typeInfo = typeInfoAt(fileName, position, settings.options);
        if (!typeInfo || settings.options.skippedTypeNames.includes(typeInfo.name)) return quickInfo;
        return mergeQuickInfo(ts, quickInfo, renderHoverPreview(typeInfo, settings), settings.placement);
      } catch (error) {
        logger.info("Prettify hover failed: " + String(error));
        return quickInfo;
      }
    };

    return proxy;
  }

  function onConfigurationChanged(config: unknown): void {
    if (config && typeof config === "object") configuration = { ...(config as PluginConfiguration) };
  }

  return { create, onConfigurationChanged };
}

export = init;
