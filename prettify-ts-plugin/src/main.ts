import type * as ts from 'typescript'
import type * as tsserver from 'typescript/lib/tsserverlibrary'

import { PluginCreator } from './pluginCreator'

export = function init (modules: { typescript: typeof ts }): tsserver.server.PluginModule {
  return new PluginCreator(modules.typescript)
}
