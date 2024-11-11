export type PrettifyOptions = {
  hidePrivateProperties: boolean
  maxDepth: number
  maxProperties: number
  maxSubProperties: number
  maxUnionMembers: number
  skippedTypeNames: string[]
  unwrapArrays: boolean
  unwrapFunctions: boolean
  unwrapPromises: boolean
}

export type PrettifyRequest = {
  meta: 'prettify-type-info-request'
  options: PrettifyOptions
}
