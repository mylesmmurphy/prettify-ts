import { LRUCache } from 'lru-cache'
import { Project } from 'ts-morph'
import { getTsConfigPath } from './helpers'

const projectCache = new LRUCache<string, Project>({
  max: 3,
  ttl: 1000 * 60 * 60 * 24 // 1 day
})

export function getProject (fileName: string): Project {
  const tsConfigFilePath = getTsConfigPath(fileName)
  if (tsConfigFilePath === undefined) {
    throw new Error('Could not find tsconfig.json')
  }

  const cachedProject = projectCache.get(tsConfigFilePath)
  if (cachedProject !== undefined) {
    return cachedProject
  }

  const project = new Project({ tsConfigFilePath })
  projectCache.set(tsConfigFilePath, project)

  return project
}
