import type * as ts from 'typescript'

function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const ts = modules.typescript

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    info.project.projectService.logger.info('TypeScript Plugin is starting')

    // Set up decorator object
    const proxy: ts.LanguageService = Object.create(null)
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const x = info.languageService[k]!
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: unknown[]) => x.apply(info.languageService, args)
    }

    /**
     * Override getQuickInfoAtPosition to log debug information
     */
    // @ts-expect-error - JS runtime trickery which is tricky to type tersely
    proxy.getQuickInfoAtPosition = (fileName, position, verbosityLevel: number | undefined) => {      
      // Call the original method
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      const quickInfo = info.languageService.getQuickInfoAtPosition(fileName, position, verbosityLevel)

      if (!quickInfo?.displayParts || !verbosityLevel) return quickInfo;

      function removeSequence(displayParts: ts.SymbolDisplayPart[]): ts.SymbolDisplayPart[] {
        const sequence = [
          { text: '}', kind: 'punctuation' },
          { text: ' ', kind: 'space' },
          { text: '&', kind: 'punctuation' },
          { text: ' ', kind: 'space' },
          { text: '{', kind: 'punctuation' },
          { text: '\n', kind: 'lineBreak' }
        ];
      
        // Function to check if part of the array matches the sequence
        const matchesSequence = (index: number) => {
          for (let i = 0; i < sequence.length; i++) {
            if (index + i >= displayParts.length || displayParts[index + i]?.text !== sequence[i]?.text || displayParts[index + i]?.kind !== sequence[i]?.kind) {
              return false;
            }
          }
          return true;
        };
      
        // Iterate through the array and filter out the matching sequence
        let result: ts.SymbolDisplayPart[] = [];
        let i = 0;
        while (i < displayParts.length) {
          if (matchesSequence(i)) {
            i += sequence.length; // Skip the sequence if matched
          } else {
            result.push(displayParts[i] as ts.SymbolDisplayPart);
            i++;
          }
        }
      
        return result;
      }

      quickInfo.displayParts = removeSequence(quickInfo.displayParts);

      // Return the original quick info response without modification
      return quickInfo
    }

    return proxy
  }

  return { create }
}

export = init
