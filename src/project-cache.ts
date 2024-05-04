import { LRUCache } from 'lru-cache'
import { Project } from 'ts-morph'
import { getTsconfig } from 'get-tsconfig'
import { ulid } from 'ulid'
import * as vscode from 'vscode'

import { EXTENSION_ID } from './consts'

interface ProjectCacheEntry {
  project: Project
  ignoredTypes: string[]
}

const projectCache = new LRUCache<string, ProjectCacheEntry>({
  max: 3,
  ttl: 1000 * 60 * 60 * 24 // 1 day
})

export function getProject (fileName: string): ProjectCacheEntry {
  const tsConfig = getTsconfig(fileName)
  if (tsConfig === null) {
    throw new Error('Could not find tsconfig.json')
  }

  const tsConfigFilePath = tsConfig.path

  const cachedProject = projectCache.get(tsConfigFilePath)
  if (cachedProject !== undefined) {
    return cachedProject
  }

  const project = new Project({ tsConfigFilePath })

  /**
   * Get the ignored types from the user settings and validate they are defined
   * If the type is not defined, it will be removed from the ignored types list for the project
   *
   * Dev Note:
   * This works by creating a temporary source file with the types and getting the diagnostics
   * Each line looks like this: `let type0: Type;`
   * If a line in the source file has a diagnostic, it means the type is not defined / has errors
   * This is hacky, better solutions are welcome
   */
  const config = vscode.workspace.getConfiguration(EXTENSION_ID)
  const settingsIgnoredTypes: string[] = config.get('ignoredNestedTypes', [])

  const testTypesArray = settingsIgnoredTypes.map((type, index) => `let type${index}: ${type};`)
  const testTypes = testTypesArray.join('\n')

  const sourceFileName = ulid()
  const sourceFile = project.createSourceFile(`${sourceFileName}.ts`, testTypes) // Use the type in some code
  const diagnostics = sourceFile.getPreEmitDiagnostics() // Get the diagnostics to see if the type is defined / has errors
  project.removeSourceFile(sourceFile)

  const invalidTypes = diagnostics.map(diagnostic => {
    const start = diagnostic.compilerObject.start
    if (start === undefined) return ''

    const line = testTypes.slice(0, start).split('\n').length
    return settingsIgnoredTypes[line - 1]
  })

  const validIgnoredTypes = settingsIgnoredTypes.filter(type => !invalidTypes.includes(type))

  const projectCacheEntry = { project, ignoredTypes: validIgnoredTypes }
  projectCache.set(tsConfigFilePath, projectCacheEntry)

  return projectCacheEntry
}
