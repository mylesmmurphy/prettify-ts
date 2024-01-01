import { LRUCache } from 'lru-cache'
import { Project } from 'ts-morph'
import { getTsconfig } from 'get-tsconfig'

const projectCache = new LRUCache<string, Project>({
  max: 3,
  ttl: 1000 * 60 * 60 * 24 // 1 day
})

export function getProject (fileName: string): Project {
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
  projectCache.set(tsConfigFilePath, project)

  return project
}
