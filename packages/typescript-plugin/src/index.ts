import type * as ts from 'typescript'

import { isPrettifyRequest } from './request'
import type { PrettifyCompletionsTriggerCharacter, PrettifyResponse } from './request'
import { getTypeInfoAtPosition } from './type-tree'

function init (modules: { typescript: typeof ts }): ts.server.PluginModule {
  const ts = modules.typescript

  function create (info: ts.server.PluginCreateInfo): ts.LanguageService {
    // Set up decorator object
    const proxy: ts.LanguageService = Object.create(null)
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const x = info.languageService[k]!
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: unknown[]) => x.apply(info.languageService, args)
    }

    proxy.getQuickInfoAtPosition = (fileName, position) => {
      const original = info.languageService.getQuickInfoAtPosition(fileName, position)

      return original
    }

    /**
     * Override getCompletionsAtPosition to provide prettify type information
     */
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const requestBody = options?.triggerCharacter as PrettifyCompletionsTriggerCharacter
      if (!isPrettifyRequest(requestBody)) {
        return info.languageService.getCompletionsAtPosition(fileName, position, options)
      }

      const program = info.project['program'] as ts.Program | undefined
      if (!program) return undefined

      const sourceFile = program.getSourceFile(fileName)
      if (!sourceFile) return undefined

      const typeChecker = program.getTypeChecker()

      const prettifyResponse = getTypeInfoAtPosition(ts, typeChecker, sourceFile, position)

      const response: PrettifyResponse = {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
        __prettifyResponse: prettifyResponse
      }

      return response
    }

    return proxy
  }

  return { create }
}

export = init
