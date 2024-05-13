/* eslint-disable @typescript-eslint/no-unused-vars */
import type * as ts from 'typescript/lib/tsserverlibrary'

import type { FullPrettifyRequest, FullPrettifyResponse } from './prettify/types'
import { getCompleteTypeInfoAtPosition, isPrettifyRequest } from './prettify/functions'

function init (modules: { typescript: typeof ts }): ts.server.PluginModule {
  const ts = modules.typescript

  /**
   * LSP plugin entry point
   */
  function create (info: ts.server.PluginCreateInfo): ts.LanguageService {
    // Set up decorator object
    const proxy: ts.LanguageService = Object.create(null)
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const x = info.languageService[k]!
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: unknown[]) => x.apply(info.languageService, args)
    }

    /**
     *
     */
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const requestBody = options?.triggerCharacter as FullPrettifyRequest
      if (!isPrettifyRequest(requestBody)) {
        return info.languageService.getCompletionsAtPosition(fileName, position, options)
      }

      const program = info.project['program'] as ts.Program | undefined

      if (!program) return undefined

      const typeChecker = program.getTypeChecker()
      const sourceFile = program.getSourceFile(fileName)

      if (!sourceFile) return undefined

      const typeInfo = getCompleteTypeInfoAtPosition(typeChecker, sourceFile, position)

      const response: FullPrettifyResponse = {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
        __prettifyResponse: {
          typeInfo
        }
      }

      return response
    }

    return proxy
  }

  return { create }
}

export = init
