declare module '@commitlint/config-*' {
  import type { ParserOptions, QualifiedConfig } from '@commitlint/types'
  export type Config = Partial<QualifiedConfig & { parserOpts: ParserOptions }>

  export const parserPreset: Config['parserPreset']
  export const rules: Config['rules']
  export const prompt: Config['prompt']
  export const defaultIgnores: Config['defaultIgnores']
  // export const extends: Config['extends']
  export const formatter: Config['formatter']
  export const helpUrl: Config['helpUrl']
  export const ignores: Config['ignores']
  export const parserOpts: Config['parserOpts']
  export const plugins: Config['plugins']
}
