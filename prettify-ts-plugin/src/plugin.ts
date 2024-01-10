// These should stay type-only imports for two reasons:
// 1) Prevent bundle bloat
// 2) Ensure the plugin uses the version of TypeScript the user has loaded
import type ts from 'typescript'
import type * as tsserver from 'typescript/lib/tsserverlibrary'

import { getNodeForQuickInfo, getValidSourceFile, getSymbolAtLocationForQuickInfo, shouldGetType, CancellationTokenObject } from './typescript-copy'
import type { PluginConfig, PluginCreator } from './pluginCreator'

export class Plugin {
  private readonly languageService: ts.LanguageService
  private readonly cancellationToken: ts.CancellationToken | undefined
  private readonly typeChecker: ts.TypeChecker

  constructor (private readonly pluginCreator: PluginCreator, private readonly info: tsserver.server.PluginCreateInfo, private readonly program: ts.Program) {
    this.languageService = this.info.languageService as unknown as ts.LanguageService
    const cancellationToken = this.info.languageServiceHost.getCancellationToken?.()

    if (cancellationToken !== undefined) {
      this.cancellationToken = new CancellationTokenObject(this.ts, cancellationToken)
    } else {
      this.cancellationToken = undefined
    }

    this.typeChecker = this.program.getTypeChecker()
  }

  get ts (): typeof ts {
    return this.pluginCreator.ts
  }

  get config (): PluginConfig {
    return this.pluginCreator.config
  }

  get defaultTypeFlags (): ts.TypeFormatFlags {
    const ts = this.ts

    // Taken from https://github.com/dsherret/ts-morph/blob/930779a0d3699be35ab17bbe9dd26ec00350fe53/packages/ts-morph/src/compiler/tools/TypeChecker.ts#L257-L265
    return ts.TypeFormatFlags.UseTypeOfFunction |
        ts.TypeFormatFlags.NoTruncation |
        ts.TypeFormatFlags.UseFullyQualifiedType |
        ts.TypeFormatFlags.WriteTypeArgumentsOfSignature
  }

  static createLanguageService (pluginCreator: PluginCreator, info: tsserver.server.PluginCreateInfo): tsserver.LanguageService {
    const program = info.languageService.getProgram()

    // The host isn't running in syntactic mode, so we can't proceed.
    if (program === undefined) {
      return info.languageService
    }

    // `tsserver.Program` is the same as a `ts.Program` at runtime but at the type level it's difficult to prove that.
    // This is because at the type level `ts-expose-internals` has exposed a bunch of internals that `ts.Program` has but `tsserver.Program` doesn't include them at the type level.
    const plugin = new this(pluginCreator, info, program as unknown as ts.Program)

    // This uses a subtle trick.
    // `ts.LanguageServer` and `tsserver.LanguageService` are essentially the same type because they're both created from the same thing in TypeScript's definition files.
    // However an enum like `SyntaxKind` doesn't obey normal structural equivalence rules and so trying to assign `ts.LanguageServer` to `tsserver.LanguageService` will fail.
    // The way this line gets around this is essentially by generating the type `Partial<tsserver.LanguageService> & ts.LanguageService` instead.
    // Later by returning, it checks if it's assignable to `tsserver.LanguageService`. If the types were to fall out of sync this wouldn't work.
    const proxy = Object.assign<Partial<tsserver.LanguageService>, ts.LanguageService>({}, plugin.languageService)

    proxy.getQuickInfoAtPosition = plugin.getQuickInfoAtPosition.bind(plugin)

    return proxy
  }

  getQuickInfoAtPosition (fileName: string, position: number): ts.QuickInfo | undefined {
    const tsserverQuickInfo = this.languageService.getQuickInfoAtPosition.bind(
      this.languageService
    )

    if (!this.config.enableHover) {
      return tsserverQuickInfo(fileName, position)
    }

    const { ts, program, typeChecker } = this

    const sourceFile = getValidSourceFile(program, fileName)
    const node = ts.getTouchingPropertyName(sourceFile, position)
    if (node === sourceFile) return undefined

    const nodeForQuickInfo = getNodeForQuickInfo(ts, node)
    const symbol = getSymbolAtLocationForQuickInfo(this.ts, nodeForQuickInfo, typeChecker)

    if (symbol === undefined || typeChecker.isUnknownSymbol(symbol)) {
      if (shouldGetType(this.ts, sourceFile, nodeForQuickInfo, position)) {
        const type = typeChecker.getTypeAtLocation(nodeForQuickInfo)

        return {
          kind: ts.ScriptElementKind.unknown,
          kindModifiers: ts.ScriptElementKindModifier.none,
          textSpan: ts.createTextSpanFromNode(nodeForQuickInfo, sourceFile),
          displayParts: this.runWithCancellationToken(typeChecker => {
            return ts.typeToDisplayParts(typeChecker, type, ts.getContainerNode(nodeForQuickInfo))
          }),
          documentation: type.symbol?.getDocumentationComment(typeChecker),
          tags: type.symbol?.getJsDocTags(typeChecker)
        }
      } else {
        return undefined
      }
    }

    const { symbolKind, displayParts, documentation, tags } = this.runWithCancellationToken(typeChecker => {
      const enclosingDeclaration = ts.getContainerNode(nodeForQuickInfo)

      return ts.SymbolDisplay.getSymbolDisplayPartsDocumentationAndSymbolKind(typeChecker, symbol, sourceFile, enclosingDeclaration, nodeForQuickInfo)
    })

    return {
      kind: symbolKind,
      kindModifiers: ts.SymbolDisplay.getSymbolModifiers(typeChecker, symbol),
      textSpan: ts.createTextSpanFromNode(nodeForQuickInfo, sourceFile),
      displayParts,
      documentation,
      tags
    }
  }

  runWithCancellationToken<R>(callback: (checker: ts.TypeChecker) => R): R {
    if (this.cancellationToken === undefined) {
      return callback(this.typeChecker)
    }

    return this.typeChecker.runWithCancellationToken(this.cancellationToken, callback)
  }
}
