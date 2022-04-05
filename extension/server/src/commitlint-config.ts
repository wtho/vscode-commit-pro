import * as configConventional from '@commitlint/config-conventional'

import type { ParserOptions, QualifiedConfig } from '@commitlint/types'
export type Config = Partial<QualifiedConfig & { parserOpts: ParserOptions }>

export async function loadConfig(): Promise<Config> {
  return configConventional || {}
}
