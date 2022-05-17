import {
  CodeAction,
  CodeActionParams,
  Command,
  Diagnostic,
  DiagnosticSeverity,
  TextEdit,
} from 'vscode-languageserver'
import { CommitMessageProvider } from './commit-message-provider'
import { GitService } from './git-service'
import similarity from 'similarity'
import { Case, caseArray, textToCase } from './utils'

export interface RuleData {
  ruleName: string
  condition: 'never' | 'always' | undefined
  severity: DiagnosticSeverity
  ruleArgs: unknown
}

export class CodeActionProvider {
  private codeActionsForRules: {
    [rule: string]: (
      diagnostic: Diagnostic,
      textDocumentUri: string,
      condition: 'always' | 'never',
      severity: 'error' | 'warning',
      ruleArgs: unknown
    ) => Promise<CodeAction[]>
  } = {
    'body-case': this.provideCodeActionBodyCase.bind(this),
    'body-empty': this.provideCodeActionBodyEmpty.bind(this),
    'body-full-stop': this.provideCodeActionBodyFullStop.bind(this),
    'body-leading-blank': this.provideCodeActionBodyLeadingBlank.bind(this),
    'footer-empty': this.provideCodeActionFooterEmpty.bind(this),
    'footer-leading-blank': this.provideCodeActionFooterLeadingBlank.bind(this),
    'header-case': this.provideCodeActionHeaderCase.bind(this),
    'header-full-stop': this.provideCodeActionHeaderFullStop.bind(this),
    'scope-case': this.provideCodeActionScopeCase.bind(this),
    'scope-empty': this.provideCodeActionScopeEmpty.bind(this),
    'scope-enum': this.provideCodeActionScopeEnum.bind(this),
    'subject-case': this.provideCodeActionSubjectCase.bind(this),
    'subject-empty': this.provideCodeActionSubjectEmpty.bind(this),
    'subject-full-stop': this.provideCodeActionSubjectFullStop.bind(this),
    'type-case': this.provideCodeActionTypeCase.bind(this),
    'type-empty': this.provideCodeActionTypeEmpty.bind(this),
    'type-enum': this.provideCodeActionTypeEnum.bind(this),
  }

  constructor(
    private readonly commitMessageProvider: CommitMessageProvider,
    private readonly gitService: GitService
  ) {}

  async provideCodeActions(
    params: CodeActionParams
  ): Promise<(Command | CodeAction)[]> {
    const codeActions: CodeAction[] = (
      await Promise.all(
        params.context.diagnostics.map(async (diagnostic) => {
          // code actions specifically for commitlint rule errors/warnings
          const rule: RuleData = diagnostic.data.rule
          const { ruleName, condition, severity, ruleArgs } = rule
          const relevantSeverities: DiagnosticSeverity[] = [
            DiagnosticSeverity.Error,
            DiagnosticSeverity.Warning,
          ]
          if (
            !ruleName ||
            !(ruleName in this.codeActionsForRules) ||
            condition === undefined ||
            !relevantSeverities.includes(severity)
          ) {
            return []
          }
          const verbalizedSeverity =
            severity === DiagnosticSeverity.Error ? 'error' : 'warning'
          const codeActionResolver = this.codeActionsForRules[ruleName]
          return await codeActionResolver(
            diagnostic,
            params.textDocument.uri,
            condition,
            verbalizedSeverity,
            ruleArgs
          )
        })
      )
    ).flat()

    return codeActions
  }

  async provideCodeActionBodyCase(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionBodyEmpty(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionBodyFullStop(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionBodyLeadingBlank(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionFooterEmpty(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionFooterLeadingBlank(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionHeaderCase(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionHeaderFullStop(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionScopeCase(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionScopeEmpty(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionScopeEnum(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    // TODO implementation
    return []
  }

  async provideCodeActionSubjectCase(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    const mustBeInCase = condition === 'always'

    if (typeof ruleArgs !== 'string' || !caseArray.includes(ruleArgs as Case)) {
      return []
    }

    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(
        textDocumentUri
      )

    const currentDescriptionValue = parsedCommit?.parseOutcome?.header?.description

    if (!currentDescriptionValue) {
      return []
    }

    const definedCase = ruleArgs as Case
    const desiredCase: Case = mustBeInCase
      ? definedCase
      : definedCase === 'lower-case'
      ? 'sentence-case'
      : 'lower-case'

    const typeInDesiredCase = textToCase(currentDescriptionValue, desiredCase)

    return [
      {
        title: `Change description to '${typeInDesiredCase}', applying case '${desiredCase}'.`,
        edit: {
          changes: {
            [textDocumentUri]: [
              {
                newText: typeInDesiredCase,
                range: diagnostic.range,
              },
            ],
          },
        },
      },
    ]
  }

  async provideCodeActionSubjectEmpty(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    const mustBeEmpty = condition === 'always'

    if (!mustBeEmpty) {
      // there is no way to suggest a description
      // except of machine learning analysis some day
      return []
    }

    const title = `Delete description from header.`
    const editChange: TextEdit = {
      newText: ``,
      range: diagnostic.range,
    }

    return [
      {
        title,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [textDocumentUri]: [editChange],
          },
        },
      },
    ]
  }

  async provideCodeActionSubjectFullStop(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown = '.'
  ): Promise<CodeAction[]> {
    if (typeof ruleArgs !== 'string' || ruleArgs.length < 1) {
      return []
    }

    const fullStopChar = ruleArgs
    const addFullStop = condition === 'always'

    const title = addFullStop
      ? `Add '${fullStopChar}' to description end.`
      : `Remove '${fullStopChar}' from description end.`

    const editChange = addFullStop
      ? {
          newText: fullStopChar,
          range: {
            start: diagnostic.range.end,
            end: diagnostic.range.end,
          },
        }
      : {
          newText: ``,
          range: {
            start: {
              line: diagnostic.range.end.line,
              character: diagnostic.range.end.character - fullStopChar.length,
            },
            end: diagnostic.range.end,
          },
        }

    return [
      {
        title,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [textDocumentUri]: [editChange],
          },
        },
      },
    ]
  }

  async provideCodeActionTypeCase(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    const mustBeInCase = condition === 'always'

    if (typeof ruleArgs !== 'string' || !caseArray.includes(ruleArgs as Case)) {
      return []
    }

    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(
        textDocumentUri
      )

    const currentTypeValue = parsedCommit?.parseOutcome?.header?.type

    if (!currentTypeValue) {
      return []
    }

    const definedCase = ruleArgs as Case
    const desiredCase: Case = mustBeInCase
      ? definedCase
      : definedCase === 'lower-case'
      ? 'pascal-case'
      : 'lower-case'

    const typeInDesiredCase = textToCase(currentTypeValue, desiredCase)

    return [
      {
        title: `Change type to '${typeInDesiredCase}', applying case '${desiredCase}'.`,
        edit: {
          changes: {
            [textDocumentUri]: [
              {
                newText: typeInDesiredCase,
                range: diagnostic.range,
              },
            ],
          },
        },
      },
    ]
  }

  async provideCodeActionTypeEmpty(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning'
  ): Promise<CodeAction[]> {
    const mustBeEmpty = condition === 'always'

    if (!mustBeEmpty) {
      // there is no simple way to suggest a type
      return []
    }

    const title = `Delete type from header.`
    const editChange: TextEdit = {
      newText: ``,
      range: diagnostic.range,
    }

    return [
      {
        title,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [textDocumentUri]: [editChange],
          },
        },
      },
    ]
  }

  async provideCodeActionTypeEnum(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown = []
  ): Promise<CodeAction[]> {
    if (
      !Array.isArray(ruleArgs) ||
      ruleArgs.length < 1 ||
      ruleArgs.some((arg) => typeof arg !== 'string')
    ) {
      return []
    }

    // if blocklist: don't suggest anything
    // removing type completely is not productive
    // TODO maybe consider proposing history types if not in blocklist
    if (condition === 'never') {
      return []
    }

    const enumValues: string[] = ruleArgs

    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(
        textDocumentUri
      )

    const currentTypeValue = parsedCommit?.parseOutcome?.header?.type

    // 1. suggest allowed types which begin with currentTypeValue
    if (currentTypeValue) {
      const startWithCurrentType = enumValues.filter((value) =>
        value.startsWith(currentTypeValue)
      )
      if (startWithCurrentType.length > 0) {
        return startWithCurrentType.map((type) => ({
          title: `Change type to '${type}'.`,
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [textDocumentUri]: [
                {
                  newText: type,
                  range: diagnostic.range,
                },
              ],
            },
          },
        }))
      }
    }
    // 2. else suggest allowed types with small difference
    // using levenshtein difference
    if (currentTypeValue) {
      const similarities = enumValues.map((type, index) => ({
        type,
        score: similarity(currentTypeValue, type),
        index,
      }))
      const closeMatches = similarities.filter(({ score }) => score > 0.3)

      if (closeMatches.length > 0) {
        const sortedMatches = closeMatches.sort((a, b) =>
          a.score !== b.score ? b.score - b.score : a.index - a.index
        )
        return sortedMatches.map(({ type }) => ({
          title: `Change type to '${type}'.`,
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [textDocumentUri]: [
                {
                  newText: type,
                  range: diagnostic.range,
                },
              ],
            },
          },
        }))
      }
    }

    // 3. else suggest all allowed types
    return enumValues.map((type) => ({
      title: `Change type to '${type}'.`,
      kind: 'quickfix',
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [textDocumentUri]: [
            {
              newText: type,
              range: diagnostic.range,
            },
          ],
        },
      },
    }))
  }
}
