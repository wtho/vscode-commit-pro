declare module 'conventional-changelog-conventionalcommits' {
  import type { ParserOptions } from '@commitlint/types'
  interface DefaultValues {
    context?: unknown;
    gitRawCommitsOpts?: GitRawCommitsOpts;
    parserOpts?: ParserOptions;
    writerOpts?: WriterOptions;
  }
  interface Options {
    config?: Promise<DefaultValues> | (() => DefaultValues) | DefaultValues;
    pkg?: {
      path?: string
      transform?: (_packageJson: object) => object
    }
    append?: boolean
    releaseCount?: number
    skipUnstable?: boolean
    debug?: (_msg: string) => void
    warn?: (_msg: string) => void
    transform?: (_commit: unknown, _callback: (_err: Error | null, _commit: unknown) => void, _through2This: unknown, ) => void
    outputUnreleased?: boolean
    lernaPackage?: unknown
    tagPrefix?: string
  }
  interface Context {
    host?: string
    owner?: string
    repository?: string
    repoUrl?: string
    gitSemverTags?: string[]
    previousTag?: string
    currentTag?: string
    packageData?: object
    linkCompare?: boolean
  }
  interface GitRawCommitsOpts {
    format?: string
    from?: number
    reverse?: boolean
    debug?: (_msg: string) => void
    parserOpts?: ParserOptions
    warn?: (_msg: string) => void
  }
  interface WriterOptions {
    transform?: object | ((_commit: object) => string)
    groupBy?: string
    commitGroupSort?: ((_commitGroup1: object, _commitGroup2: object) => number) | string | string[]
    commitsSort?: ((_commitGroup1: object, _commitGroup2: object) => number) | string | string[]
    noteGroupsSort?: ((_commitGroup1: object, _commitGroup2: object) => number) | string | string[]
    notesSort?: ((_commitGroup1: object, _commitGroup2: object) => number) | string | string[]
    generateOn?: (() => void) | string | any
    finalizeContext?: (_context: Context, _options: object, _commits: object[], _keyCommit: object) => Context 
    debug?: (_msg: string) => void
    reverse?: boolean
    includeDetails?: boolean
    ignoreReverted?: boolean
    doFlush?: boolean
    mainTemplate?: string
    headerPartial?: string
    commitPartial?: string
    footerPartial?: string
    partials?: object
  }
  interface ProcessedOptions {
    gitRawCommitsOpts: {
      noMerges: null
    },
    conventionalChangelog: {
      parserOpts: ParserOptions
      writerOpts: WriterOptions
    },
    parserOpts: ParserOptions
    recommendedBumpOpts: {
      parserOpts: ParserOptions
      whatBump: (..._args: unknown[]) => unknown
    }
    writerOpts: WriterOptions
  }
  const conventionalCommits: (_options?: Options, _gitRawCommitsOpts?: GitRawCommitsOpts, _parserOpts?: ParserOptions, _writerOpts?: WriterOptions) => ProcessedOptions
  export default conventionalCommits
}
