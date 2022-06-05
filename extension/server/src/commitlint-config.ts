import configConventional from '@commitlint/config-conventional'
import configConventionalParserOpts from 'conventional-changelog-conventionalcommits'

import type {
  ParserOptions,
  ParserPreset,
  QualifiedConfig,
} from '@commitlint/types'
import { basename, dirname, isAbsolute } from 'path'
import type { LoadConfigResult } from '@commitlint/load/lib/utils/load-config'
import * as commitlintLoadLoadConfig from '@commitlint/load/lib/utils/load-config'
import commitlintLoad from '@commitlint/load'
import commitlintLint from '@commitlint/lint'
import commitlintParse from '@commitlint/parse'

export type Config = Partial<QualifiedConfig & { parserOpts: ParserOptions }>

type LibAtCommitlintLoad = typeof import('@commitlint/load')
type LibAtCommitlintLoadUtilLoadConfig =
  typeof import('@commitlint/load/lib/utils/load-config')
type LibAtCommitlintLint = typeof import('@commitlint/lint')
type LibAtCommitlintParse = typeof import('@commitlint/parse')
export interface WorkspaceSettings {
  commitlintConfigFilePath: string | undefined
  workspacePath: string | undefined
}

export async function loadConfig({
  commitlintConfigFilePath,
  workspacePath,
}: WorkspaceSettings): Promise<{
  config: Config
  path: string
  default: boolean
}> {
  const cwd =
    commitlintConfigFilePath && isAbsolute(commitlintConfigFilePath)
      ? dirname(commitlintConfigFilePath)
      : workspacePath

  const file =
    commitlintConfigFilePath && isAbsolute(commitlintConfigFilePath)
      ? basename(commitlintConfigFilePath)
      : commitlintConfigFilePath

  const commitlintLoad = loadAtCommitlintLoad(cwd)
  const commitlintLoadConfig = loadAtCommitlintLoadUtilLoadConfig(cwd)

  let [config, configPath]: [Config, LoadConfigResult | null] =
    await Promise.all([
      commitlintLoad({}, { cwd, file }),
      commitlintLoadConfig(cwd!),
    ])

  if (config && configPath) {
    return { config, path: configPath?.filepath ?? 'unknown', default: false }
  }

  // default config
  config = {
    ...configConventional,
    parserPreset:
      availableParserPresets['conventional-changelog-conventionalcommits'],
  }
  if (!config) {
    return { config, path: 'unknown', default: true }
  }
  if (
    typeof config?.parserPreset === 'string' &&
    config.parserPreset in availableParserPresets
  ) {
    config.parserPreset = availableParserPresets[config.parserPreset]
  }
  let parserOpts = config?.parserPreset?.parserOpts as ParserOptions | undefined
  if (typeof parserOpts === 'function') {
    parserOpts = await new Promise((rs) => {
      let resolved = false
      const maybePromise: Promise<{ parserOpts?: ParserOptions }> = (parserOpts as Function)(
        (_: unknown, opts: { parserOpts?: ParserOptions }) => {
          if (resolved) {
            return
          }
          resolved = true
          rs(opts.parserOpts)
        }
      )
      if (maybePromise?.then && typeof maybePromise.then === 'function') {
        maybePromise.then(result => {
          if (resolved) {
            return
          }
          resolved = true
          rs(result.parserOpts)
        })
      }
    }
    )
  }
  if (parserOpts && typeof parserOpts.commentChar !== 'string') {
    parserOpts.commentChar = '#'
  }
  if (parserOpts) {
    if (config.parserPreset) {
      config.parserPreset.parserOpts = parserOpts
    }
    config.parserOpts = parserOpts
  }
  return { config, path: 'default', default: true }
}

export const availableParserPresets: Record<string, ParserPreset> = {
  'conventional-changelog-conventionalcommits': {
    name: 'conventional-changelog-conventionalcommits',
    path: './dependencies/conventional-changelog-conventionalcommits',
    parserOpts: configConventionalParserOpts as ParserOptions,
  },
}

interface LoadResult<T> {
  result: T
  path: string
}

export function isNodeExceptionCode<T extends string>(
  e: unknown,
  code: T
): e is NodeJS.ErrnoException & { code: T } {
  return !!(
    e &&
    typeof e === 'object' &&
    (e as NodeJS.ErrnoException).code === code
  )
}

export const loadAtCommitlintLoad = (workspacePath: string | undefined) => {
  try {
    const { result } = loadLibrary<LibAtCommitlintLoad>(
      '@commitlint/load',
      workspacePath
    )
    return result.default
  } catch (err) {
    if (isNodeExceptionCode(err, 'MODULE_NOT_FOUND')) {
      return commitlintLoad
    }
    throw err
  }
}
export const loadAtCommitlintParse = (workspacePath: string | undefined) => {
  try {
    const { result } = loadLibrary<LibAtCommitlintParse>(
      '@commitlint/parse',
      workspacePath
    )
    return result.default
  } catch (err) {
    if (isNodeExceptionCode(err, 'MODULE_NOT_FOUND')) {
      return commitlintParse
    }
    throw err
  }
}
export const loadAtCommitlintLint = (workspacePath: string | undefined) => {
  try {
    const { result } = loadLibrary<LibAtCommitlintLint>(
      '@commitlint/lint',
      workspacePath
    )
    return result.default
  } catch (err) {
    if (isNodeExceptionCode(err, 'MODULE_NOT_FOUND')) {
      return commitlintLint
    }
    throw err
  }
}
export const loadAtCommitlintLoadUtilLoadConfig = (
  workspacePath: string | undefined
) => {
  try {
    const { result } = loadLibrary<LibAtCommitlintLoadUtilLoadConfig>(
      '@commitlint/load/lib/utils/load-config',
      workspacePath
    )
    return result.loadConfig
  } catch (err) {
    return commitlintLoadLoadConfig.loadConfig
  }
}

export const loadLibrary = <T>(
  name: string,
  path: string | undefined
): LoadResult<T> => {
  if (path) {
    try {
      const resolvePath = require.resolve(name, { paths: [path] })

      return {
        result: require(resolvePath) as T,
        path: resolvePath,
      }
    } catch (e) {
      if (!isNodeExceptionCode(e, 'MODULE_NOT_FOUND')) {
        throw e
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bundle = require(name) as T
  return { result: bundle, path: `bundled://${name}` }
}
