import {
  Commit,
  LintOptions,
  LintOutcome,
  LintRuleOutcome,
  ParserOptions,
  RuleConfigQuality,
  RuleConfigSeverity,
  RulesConfig,
} from '@commitlint/types'
import lint from '@commitlint/lint'
import parse from '@commitlint/parse'
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node'
import * as parser from 'git-commit-parser'

type CommitPositionId = 'header' | 'type' | 'scope' | 'description' | 'body' | 'footer'

type CommitPositions = Partial<Record<CommitPositionId, parser.Range>>
const cachedPositionsForParsedCommitTree = new WeakMap<parser.Node, CommitPositions>()

type GetRange = (commitPart: CommitPositionId) => parser.Range

interface ConverterContext {
  getRange: GetRange,
  rules?: Partial<RulesConfig<RuleConfigQuality.Qualified>>,
}

export interface MessageSemVerUpdateState {
  major: boolean
  minor: boolean
  patch: boolean
}
const messageSemVerUpdateStateNoUpdate: MessageSemVerUpdateState = {
  major: false,
  minor: false,
  patch: false,
}

export const validate = async ({
  parsedTree,
  commitMessage,
  rules = {},
  options,
}: {
  parsedTree: parser.Node | undefined
  commitMessage: string | undefined
  rules?: Partial<RulesConfig<RuleConfigQuality.Qualified>>,
  options?: LintOptions
}): Promise<{
  diagnostics: Diagnostic[]
  semVerUpdate: MessageSemVerUpdateState
  configErrors: string[]
}> => {
  if (!commitMessage || !commitMessage.trim()) {
    return { diagnostics: [], semVerUpdate: messageSemVerUpdateStateNoUpdate, configErrors: [] }
  }
  let linted: LintOutcome
  let parsed: Commit
  try {
    const [lintOutcome, parsedCommit] = await Promise.all([
      lint(commitMessage, rules, options),
      parse(commitMessage, undefined, options?.parserOpts),
    ])
    linted = lintOutcome
    parsed = parsedCommit
  } catch (err: unknown) {
    const error = err as Error;
    return { diagnostics: [], semVerUpdate: messageSemVerUpdateStateNoUpdate, configErrors: [error?.message] }
  }

  // TODO go through tree instead of using regexp
  const lineStartsWithBreakingChange = /^BREAKING[- ]CHANGE:/
  const hasLineThatStartsWithBreakingChange = (text?: string | null) =>
    text?.split('\n').some((line) => lineStartsWithBreakingChange.test(line))
  const parserOpts = options?.parserOpts as
    | (ParserOptions & { breakingHeaderPattern?: RegExp })
    | undefined
  const breakingHeaderPattern = parserOpts?.breakingHeaderPattern
  const major =
    (breakingHeaderPattern?.test(parsed.header) ||
      hasLineThatStartsWithBreakingChange(parsed.footer) ||
      hasLineThatStartsWithBreakingChange(parsed.body)) ??
    false
  const minor = !major && parsed.type === 'feat'
  const patch = !major && !minor && parsed.type === 'fix'
  const semVerUpdate: MessageSemVerUpdateState = { major, minor, patch }

  if (linted.errors.length === 0 && linted.warnings.length === 0) {
    return { diagnostics: [], semVerUpdate: semVerUpdate, configErrors: [] }
  }

  const getRange: GetRange = parsedTree ? (part: CommitPositionId) => getRangeForCommitPart(part, parsedTree) : () => ({
    start: { line: 0, character: 0 },
    end: { line: Number.MAX_SAFE_INTEGER, character: Number.MAX_SAFE_INTEGER },
  })

  const diagnostics = [...linted.errors, ...linted.warnings]
    .map((lintedRuleOutcome) => getDiagnosticForMarker(lintedRuleOutcome, { getRange, rules }))
    .filter((diagnostic: Diagnostic | null): diagnostic is Diagnostic => !!diagnostic)
  return { diagnostics, semVerUpdate: semVerUpdate, configErrors: [] }
}

function getRangeForCommitPart(part: CommitPositionId, commit: parser.Node): parser.Range {
  if (cachedPositionsForParsedCommitTree.has(commit)) {
    const cachedPositions = cachedPositionsForParsedCommitTree.get(commit)!
    if (part in cachedPositions) {
      const cachedRange = cachedPositions[part]!
      if (cachedRange) {
        return cachedRange
      }
    }
  }
  const range = parser.getRangeForCommitPosition(commit, part)

  cachedPositionsForParsedCommitTree.set(commit, {
    ...(cachedPositionsForParsedCommitTree.get(commit) ?? {}),
    [part]: range,
  })

  return range
}

function toDiagnosticsSeverity(commitlintSeverity: RuleConfigSeverity): DiagnosticSeverity {
  if (commitlintSeverity === RuleConfigSeverity.Disabled) {
    throw new Error('Disabled rules should not lead to a lint rule outcome')
  }
  if (commitlintSeverity === RuleConfigSeverity.Warning) {
    return DiagnosticSeverity.Warning
  }
  if (commitlintSeverity === RuleConfigSeverity.Error) {
    return DiagnosticSeverity.Error
  }
  throw new Error(`Unspecified commitlint rule outcome severity: ${commitlintSeverity}`)
}

function getDiagnosticForMarker(lintRuleOutcome: LintRuleOutcome, converterContext: ConverterContext): Diagnostic | null {
  const severity = toDiagnosticsSeverity(lintRuleOutcome.level)
  const message = `${lintRuleOutcome.message} (${lintRuleOutcome.name})`
  const lintRuleOutcomePrefixes = Object.keys(lintRuleOutcomeConversions)
  const lintRuleOutcomePrefix = lintRuleOutcomePrefixes.find((prefix) => lintRuleOutcome.name.startsWith(prefix))
  if (!lintRuleOutcomePrefix) {
    // TODO log error?
    return null
  }
  const converter = lintRuleOutcomeConversions[lintRuleOutcomePrefix]
  return converter({ severity, message }, converterContext)
}

const lintRuleOutcomeConversions: {
  [ruleStartsWith: string]: (
    data: { severity: DiagnosticSeverity, message: string },
    context: ConverterContext,
  ) => Diagnostic
} = {
  'header-max-length': ({ severity, message }, { rules, getRange }) => ({
    range: getRange('header'),
    startColumn:
      rules?.['header-max-length']?.[2] ?? getRange('header').start.character,
    severity,
    message,
  }),
  'header-': ({ severity, message }, { getRange }) => ({
    range: getRange('header'),
    severity,
    message,
  }),
  'type-': ({ severity, message }, { getRange }) => ({
    range: getRange('type'),
    severity,
    message,
  }),
  'scope-': ({ severity, message}, { getRange }) => ({
    range: getRange('scope'),
    severity,
    message,
  }),
  'subject-': ({ severity, message }, { getRange }) => ({
    range: getRange('description'),
    severity,
    message,
  }),
  'body-': ({ severity, message }, { getRange }) => ({
    range: getRange('body'),
    severity,
    message,
  }),
  'footer-': ({ severity, message }, { getRange }) => ({
    range: getRange('footer'),
    severity,
    message,
  }),
}

