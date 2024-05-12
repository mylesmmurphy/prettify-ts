/* eslint-disable @typescript-eslint/no-unused-vars */
import type * as ts from 'typescript/lib/tsserverlibrary'

function init (modules: { typescript: typeof ts }): ts.server.PluginModule {
  const ts = modules.typescript
  console.log('Plugin initialized test')

  function create (info: ts.server.PluginCreateInfo): ts.LanguageService {
    // Set up decorator object
    const proxy: ts.LanguageService = Object.create(null)
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const x = info.languageService[k]!
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: unknown[]) => x.apply(info.languageService, args)
    }

    // Remove specified entries from completion list
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const prior = info.languageService.getCompletionsAtPosition(fileName, position, options)
      if (!prior) return

      const oldLength = prior.entries.length
      const whatToRemove = ['foo', 'bar']
      prior.entries = prior.entries.filter(e => !whatToRemove.includes(e.name))

      // Sample logging for diagnostic purposes
      if (oldLength !== prior.entries.length) {
        const entriesRemoved = oldLength - prior.entries.length
        info.project.projectService.logger.info(
            `Removed ${entriesRemoved} entries from the completion list`
        )
      }

      return prior
    }

    return proxy
  }

  return { create }
}

export = init
