import {
  CodeAction,
  CodeActionParams,
  Command,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  TextEdit,
} from 'vscode-languageserver'
import { CommitMessageProvider } from './commit-message-provider'
import { GitService } from './git-service'
import similarity from 'similarity'
import { Case, caseArray, textToCase } from './utils'
import * as parser from 'git-commit-parser'
import { Rule, RuleConfigSeverity } from '@commitlint/types'

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
    const mustBeInCase = condition === 'always'

    if (typeof ruleArgs !== 'string' || !caseArray.includes(ruleArgs as Case)) {
      return []
    }

    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(
        textDocumentUri
      )

    const currentHeaderValue = parsedCommit?.parseOutcome?.body

    if (!currentHeaderValue) {
      return []
    }

    const definedCase = ruleArgs as Case
    const desiredCase: Case = mustBeInCase
      ? definedCase
      : definedCase === 'lower-case'
      ? 'sentence-case'
      : 'lower-case'

    const bodyInDesiredCase = textToCase(currentHeaderValue, desiredCase)

    return [
      {
        title: `Change body applying case '${desiredCase}'.`,
        edit: {
          changes: {
            [textDocumentUri]: [
              {
                newText: bodyInDesiredCase,
                range: diagnostic.range,
              },
            ],
          },
        },
      },
    ]
  }

  async provideCodeActionBodyEmpty(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    const mustBeEmpty = condition === 'always'

    if (!mustBeEmpty) {
      // there is no way to suggest a body
      // except of machine learning analysis some day
      return []
    }

    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(
        textDocumentUri
      )

    const rootNode = parsedCommit?.parseOutcome?.root
    if (!rootNode || rootNode.type !== 'message') {
      return []
    }
    const bodyNode = (rootNode as parser.InnerNode).children.find(
      (child) => child.type === 'body'
    )

    const bodyStart = bodyNode?.range?.start
    const bodyEnd = bodyNode?.range?.end

    if (!bodyStart || !bodyEnd) {
      return []
    }

    const editChange: TextEdit = {
      newText: ``,
      range: {
        start: bodyStart,
        end: bodyEnd,
      },
    }

    return [
      {
        title: `Delete the body.`,
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

  async provideCodeActionBodyFullStop(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    if (typeof ruleArgs !== 'string' || ruleArgs.length < 1) {
      return []
    }

    const fullStopChar = ruleArgs
    const addFullStop = condition === 'always'

    const title = addFullStop
      ? `Add '${fullStopChar}' to body end.`
      : `Remove '${fullStopChar}' from body end.`

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

  async provideCodeActionBodyLeadingBlank(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    const mustBeLeadingBlank = condition === 'always'
    const mustNotBeLeadingBlank = condition === 'never'

    // body location
    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(
        textDocumentUri
      )
    const root = parsedCommit?.parseOutcome?.root
    if (!root) {
      return []
    }
    const bodyStart = parser.getFirstNodeOfType(root, 'footer')?.range?.start
    if (!bodyStart) {
      return []
    }

    if (mustBeLeadingBlank) {
      return [
        {
          title: `Insert blank line before body.`,
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [textDocumentUri]: [
                {
                  newText: '\n',
                  range: {
                    start: bodyStart,
                    end: bodyStart,
                  },
                },
              ],
            },
          },
        },
      ]
    }

    if (mustNotBeLeadingBlank) {
      // find all blank lines before body
      const messageNode = root as parser.InnerNode
      const indexOfBody = messageNode.children.findIndex(
        (child) => child.type === 'body'
      )
      let currentStartLine = bodyStart.line
      const linesToRemove: Range[] = []
      for (let i = indexOfBody - 1; i >= 0; i--) {
        const child = messageNode.children.at(i)!
        if (child.type === 'header') {
          if (child.range.end.line + 1 < currentStartLine) {
            linesToRemove.push({
              start: {
                line: child.range.end.line + 1,
                character: 0,
              },
              end: {
                line: currentStartLine,
                character: 0,
              },
            })
          }
          break
        }
        if (child.type === 'comment') {
          if (child.range.end.line + 1 < currentStartLine) {
            linesToRemove.push({
              start: {
                line: child.range.end.line + 1,
                character: 0,
              },
              end: {
                line: currentStartLine,
                character: 0,
              },
            })
          }
          currentStartLine = child.range.start.line
          continue
        }
      }

      if (linesToRemove.length === 0) {
        return []
      }

      const lineOrLinesText = linesToRemove.length > 1 ? 'lines' : 'line'

      return [
        {
          title: `Remove blank ${lineOrLinesText} before body.`,
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [textDocumentUri]: linesToRemove.map((lineToRemove) => ({
                newText: '',
                range: lineToRemove,
              })),
            },
          },
        },
      ]
    }

    return []
  }

  async provideCodeActionFooterEmpty(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    const mustBeEmpty = condition === 'always'

    if (!mustBeEmpty) {
      // there is no way to suggest a footer
      // except of machine learning analysis some day
      return []
    }

    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(
        textDocumentUri
      )

    const rootNode = parsedCommit?.parseOutcome?.root
    if (!rootNode || rootNode.type !== 'message') {
      return []
    }
    const footerNodes = (rootNode as parser.InnerNode).children.filter(
      (child) => child.type === 'footer'
    )

    if (footerNodes?.length === 0) {
      return []
    }
    const footersStart = footerNodes.at(0)?.range?.start
    const footersEnd = footerNodes.at(-1)?.range?.end

    if (!footersStart || !footersEnd) {
      return []
    }

    const title =
      footerNodes.length === 1 ? `Delete the footer.` : `Delete all footers.`
    const editChange: TextEdit = {
      newText: ``,
      range: {
        start: footersStart,
        end: footersEnd,
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

  async provideCodeActionFooterLeadingBlank(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    const mustBeLeadingBlank = condition === 'always'
    const mustNotBeLeadingBlank = condition === 'never'

    // first footer location
    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(
        textDocumentUri
      )
    const root = parsedCommit?.parseOutcome?.root
    if (!root) {
      return []
    }
    const footerStart = parser.getFirstNodeOfType(root, 'footer')?.range?.start
    if (!footerStart) {
      return []
    }

    const footerOrFootersText =
      (parsedCommit.parseOutcome?.footers.length ?? 0) > 1
        ? 'footers'
        : 'footer'

    if (mustBeLeadingBlank) {
      return [
        {
          title: `Insert blank line before ${footerOrFootersText}.`,
          edit: {
            changes: {
              [textDocumentUri]: [
                {
                  newText: '\n',
                  range: {
                    start: footerStart,
                    end: footerStart,
                  },
                },
              ],
            },
          },
        },
      ]
    }

    if (mustNotBeLeadingBlank) {
      // find all blank lines before footer
      const messageNode = root as parser.InnerNode
      const indexOfFirstFooter = messageNode.children.findIndex(
        (child) => child.type === 'footer'
      )
      let currentStartLine = footerStart.line
      const linesToRemove: Range[] = []
      for (let i = indexOfFirstFooter - 1; i >= 0; i--) {
        const child = messageNode.children.at(i)!
        if (child.type === 'body' || child.type === 'header') {
          if (child.range.end.line + 1 < currentStartLine) {
            linesToRemove.push({
              start: {
                line: child.range.end.line + 1,
                character: 0,
              },
              end: {
                line: currentStartLine,
                character: 0,
              },
            })
          }
          break
        }
        if (child.type === 'comment') {
          if (child.range.end.line + 1 < currentStartLine) {
            linesToRemove.push({
              start: {
                line: child.range.end.line + 1,
                character: 0,
              },
              end: {
                line: currentStartLine,
                character: 0,
              },
            })
          }
          currentStartLine = child.range.start.line
          continue
        }
      }

      if (linesToRemove.length === 0) {
        return []
      }

      const lineOrLinesText = linesToRemove.length > 1 ? 'lines' : 'line'

      return [
        {
          title: `Remove blank  ${lineOrLinesText} before ${footerOrFootersText}.`,
          edit: {
            changes: {
              [textDocumentUri]: linesToRemove.map((lineToRemove) => ({
                newText: '',
                range: lineToRemove,
              })),
            },
          },
        },
      ]
    }

    return []
  }

  async provideCodeActionHeaderCase(
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

    const currentHeaderValue = parsedCommit?.parseOutcome?.header?.raw

    if (!currentHeaderValue) {
      return []
    }

    const definedCase = ruleArgs as Case
    const desiredCase: Case = mustBeInCase
      ? definedCase
      : definedCase === 'lower-case'
      ? 'sentence-case'
      : 'lower-case'

    const headerInDesiredCase = textToCase(currentHeaderValue, desiredCase)

    return [
      {
        title: `Change header to '${headerInDesiredCase}', applying case '${desiredCase}'.`,
        edit: {
          changes: {
            [textDocumentUri]: [
              {
                newText: headerInDesiredCase,
                range: diagnostic.range,
              },
            ],
          },
        },
      },
    ]
  }

  async provideCodeActionHeaderFullStop(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    if (typeof ruleArgs !== 'string' || ruleArgs.length < 1) {
      return []
    }

    const fullStopChar = ruleArgs
    const addFullStop = condition === 'always'

    const title = addFullStop
      ? `Add '${fullStopChar}' to header end.`
      : `Remove '${fullStopChar}' from header end.`

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

  async provideCodeActionScopeCase(
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

    const currentScopeValue = parsedCommit?.parseOutcome?.header?.scope

    if (!currentScopeValue) {
      return []
    }

    const definedCase = ruleArgs as Case
    const desiredCase: Case = mustBeInCase
      ? definedCase
      : definedCase === 'lower-case'
      ? 'pascal-case'
      : 'lower-case'

    const scopeInDesiredCase = textToCase(currentScopeValue, desiredCase)

    return [
      {
        title: `Change scope to '${scopeInDesiredCase}', applying case '${desiredCase}'.`,
        edit: {
          changes: {
            [textDocumentUri]: [
              {
                newText: scopeInDesiredCase,
                range: diagnostic.range,
              },
            ],
          },
        },
      },
    ]
  }

  async provideCodeActionScopeEmpty(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    const mustBeEmpty = condition === 'always'

    if (!mustBeEmpty) {
      // edit-in the parens
      const parsedCommit =
        await this.commitMessageProvider.getParsedTreeForDocumentUri(
          textDocumentUri
        )
      const root = parsedCommit?.parseOutcome?.root
      if (!root) {
        return []
      }
      const typeRange = parser.getFirstNodeOfType(root, 'type')?.range
      const hasScopeParenOpen = !!parser.getFirstNodeOfType(root, 'scope-paren-open')
      const hasScopeParenClose = !!parser.getFirstNodeOfType(root, 'scope-paren-close')
      if (!typeRange || hasScopeParenOpen || hasScopeParenClose) {
        return []
      }

      return [
        {
          title: 'Insert parentheses for scope in header.',
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [textDocumentUri]: [TextEdit.insert(typeRange.end, '()')],
            },
          },
        },
      ]
    }

    const title = `Delete scope from header.`
    const editChange: TextEdit = {
      newText: ``,
      range: {
        start: {
          line: diagnostic.range.start.line,
          // this should be work, as the scope only starts with a '(',
          character: diagnostic.range.start.character - 1,
        },
        end: {
          line: diagnostic.range.end.line,
          // this should be work, as the scope only ends with a ')',
          // or goes on until the end of the line
          character: diagnostic.range.end.character + 1,
        },
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

  async provideCodeActionScopeEnum(
    diagnostic: Diagnostic,
    textDocumentUri: string,
    condition: 'always' | 'never',
    severity: 'error' | 'warning',
    ruleArgs: unknown
  ): Promise<CodeAction[]> {
    if (
      !Array.isArray(ruleArgs) ||
      ruleArgs.length < 1 ||
      ruleArgs.some((arg) => typeof arg !== 'string')
    ) {
      return []
    }

    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(
        textDocumentUri
      )

    // if blocklist: suggest removing (if not in conflict with scope-empty:never)
    // or other suggestions (history based)
    if (condition === 'never') {
      const suggestions: CodeAction[] = []
      const config = await this.commitMessageProvider.getConfig(
        parsedCommit?.config?.configUri,
        textDocumentUri
      )

      const scopeEmptyCondition = config?.config.rules?.['scope-empty']?.[1]
      const scopeEmptyDisabled =
        config?.config.rules?.['scope-empty']?.[0] ===
        RuleConfigSeverity.Disabled
      const scopeMustBeEmpty =
        !scopeEmptyDisabled && scopeEmptyCondition === 'always'
      const scopeMustNotBeEmpty =
        !scopeEmptyDisabled && scopeEmptyCondition === 'never'

      if (!scopeMustBeEmpty) {
        // TODO get suggestions from history if they don't collide with blocklist
      }

      if (!scopeMustNotBeEmpty) {
        suggestions.push({
          title: 'Remove scope from header.',
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [textDocumentUri]: [
                {
                  newText: ``,
                  range: {
                    start: {
                      line: diagnostic.range.start.line,
                      character: diagnostic.range.start.character - 1,
                    },
                    end: {
                      line: diagnostic.range.end.line,
                      character: diagnostic.range.end.character + 1,
                    },
                  },
                },
              ],
            },
          },
        })
      }

      return suggestions
    }

    const enumValues: string[] = ruleArgs

    const currentScopeValue = parsedCommit?.parseOutcome?.header?.scope

    // 1. suggest allowed scopes which begin with currentScopeValue
    if (currentScopeValue) {
      const startWithCurrentScope = enumValues.filter((value) =>
        value.startsWith(currentScopeValue)
      )
      if (startWithCurrentScope.length > 0) {
        return startWithCurrentScope.map((scope) => ({
          title: `Change scope to '${scope}'.`,
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [textDocumentUri]: [
                {
                  newText: scope,
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
    if (currentScopeValue) {
      const similarities = enumValues.map((scope, index) => ({
        type: scope,
        score: similarity(currentScopeValue, scope),
        index,
      }))
      const closeMatches = similarities.filter(({ score }) => score > 0.3)

      if (closeMatches.length > 0) {
        const sortedMatches = closeMatches.sort((a, b) =>
          a.score !== b.score ? b.score - b.score : a.index - a.index
        )
        return sortedMatches.map(({ type: scope }) => ({
          title: `Change scope to '${scope}'.`,
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [textDocumentUri]: [
                {
                  newText: scope,
                  range: diagnostic.range,
                },
              ],
            },
          },
        }))
      }
    }

    // 3. else suggest all allowed types
    return enumValues.map((scope) => ({
      title: `Change scope to '${scope}'.`,
      kind: 'quickfix',
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [textDocumentUri]: [
            {
              newText: scope,
              range: diagnostic.range,
            },
          ],
        },
      },
    }))
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

    const currentDescriptionValue =
      parsedCommit?.parseOutcome?.header?.description

    if (!currentDescriptionValue) {
      return []
    }

    const definedCase = ruleArgs as Case
    const desiredCase: Case = mustBeInCase
      ? definedCase
      : definedCase === 'lower-case'
      ? 'sentence-case'
      : 'lower-case'

    const descriptionInDesiredCase = textToCase(
      currentDescriptionValue,
      desiredCase
    )

    return [
      {
        title: `Change description to '${descriptionInDesiredCase}', applying case '${desiredCase}'.`,
        edit: {
          changes: {
            [textDocumentUri]: [
              {
                newText: descriptionInDesiredCase,
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
