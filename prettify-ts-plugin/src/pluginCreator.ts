import type * as ts from 'typescript'
import type * as tsserver from 'typescript/lib/tsserverlibrary'

import { Plugin } from './plugin'

export interface PluginConfig {
  /**
     * Enable or disable the Prettify TS hover tooltip.
     * @defaultValue `true`
     */
  enableHover: boolean

  /**
     * Show or hide nested types.
     * @defaultValue `false`
     */
  viewNestedTypes: boolean

  /**
     * Indentations for type previews.
     * @defaultValue `4`
     */
  typeIndentation: number

  /**
     * Types that won't be expanded when viewing deeply nested types. These types need to be in the global or local scope, or else the plugin will fail.
     * @defaultValue `["String", "Number", "Boolean", "Date", "RegExp", "Function", "Symbol"]`
     */
  ignoredNestedTypes: string[]
}

export class PluginCreator {
  ts: typeof ts
  config: PluginConfig

  constructor (typescript: typeof ts) {
    this.ts = typescript
    this.config = PluginCreator.configsDefault
  }

  static configsDefault = {
    enableHover: true,
    viewNestedTypes: false,
    typeIndentation: 4,
    ignoredNestedTypes: ['String', 'Number', 'Boolean', 'Date', 'RegExp', 'Function', 'Symbol']
  } satisfies PluginConfig

  create (
    info: tsserver.server.PluginCreateInfo
  ): tsserver.LanguageService {
    return Plugin.createLanguageService(this, info)
  }

  onConfigurationChanged (config: unknown): void {
    if (config == null || typeof config !== 'object') {
      this.config = PluginCreator.configsDefault
      return
    }

    this.config = {
      enableHover: this.getPropertyOfType(config, 'enableHover', 'boolean') ?? PluginCreator.configsDefault.enableHover,
      viewNestedTypes: this.getPropertyOfType(config, 'viewNestedTypes', 'boolean') ?? PluginCreator.configsDefault.viewNestedTypes,
      typeIndentation: this.getPropertyOfType(config, 'typeIndentation', 'number') ?? PluginCreator.configsDefault.typeIndentation,
      ignoredNestedTypes: this.getArray(config, 'ignoredNestedTypes', 'string') ?? PluginCreator.configsDefault.ignoredNestedTypes
    }
  }

  // The type `object` is usually a bad fit because it includes arrays and other types.
  // However it's not straightforward to narrow from `unknown` to a type like `Record<string, unknown>` without a cast.
  // For example `typeof x === "object" && !Array.isArray(x)` does not narrow `x` to `Record<string, unknown>`
  getPropertyOfType (config: object, key: keyof PluginConfig, type: 'boolean'): boolean | undefined
  getPropertyOfType (config: object, key: keyof PluginConfig, type: 'number'): number | undefined

  // This is made generic to allow indexing `config` by `key`.
  // `key in config` doesn't even work as a type guard in this situation.
  getPropertyOfType <K extends keyof PluginConfig>(config: { [_ in K]?: unknown }, key: K, type: 'boolean' | 'number'): boolean | number | undefined {
    const value = config[key]

    // Type guards only work with literal strings, so simplifying this to `typeof value === type` doesn't work.
    if (type === 'boolean' && typeof value === 'boolean') {
      return value
    }

    if (type === 'number' && typeof value === 'number') {
      return value
    }

    if (value == null) {
      return undefined
    }

    console.warn(`Expected config property ${key} to be a ${type} and not a ${typeof value}`)

    return undefined
  }

  // See `getPropertyOfType` for implementation oddities.
  getArray (config: object, key: string, type: 'boolean'): boolean[] | undefined
  getArray (config: object, key: string, type: 'number'): number[] | undefined
  getArray (config: object, key: string, type: 'string'): string[] | undefined

  getArray <K extends string>(config: { [_ in K]?: unknown }, key: K, type: 'boolean' | 'number' | 'string'): boolean[] | number[] | string[] | undefined {
    const value = config[key]

    if (!Array.isArray(value)) {
      console.warn(`Expected config property ${key} to be an array of ${type} and not a ${typeof value}`)
      return undefined
    }

    for (const [i, item] of Object.entries(value)) {
      // eslint-disable-next-line valid-typeof
      const isValid = item == null || typeof value === type
      if (!isValid) {
        console.warn(`Expected config property ${key} to be an array of ${type} but at index ${i} has value with type ${typeof value}`)
        return undefined
      }
    }

    return value
  }
}
