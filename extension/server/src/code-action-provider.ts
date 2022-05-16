import {
  CodeAction,
  CodeActionParams,
  Command,
  Diagnostic,
  DiagnosticSeverity,
} from 'vscode-languageserver'
import { CommitMessageProvider } from './commit-message-provider'
import { GitService } from './git-service'

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
    ) => CodeAction[]
  } = {
    'subject-full-stop': (diagnostic, textDocumentUri, condition, severity, ruleArgs = '.') => {

      if (typeof ruleArgs !== 'string' || ruleArgs.length < 1) {
        return []
      }

      const fullStopChar = ruleArgs
      const addFullStop = condition === 'always'

      return [
        {
          title: addFullStop
            ? `Add '${fullStopChar}' to description end.`
            : `Remove '${fullStopChar}' from description end.`,
          kind: 'quickfix',
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [textDocumentUri]: [
                addFullStop
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
                    },
              ],
            },
          },
        },
      ]
    },
  }

  constructor(
    private readonly commitMessageProvider: CommitMessageProvider,
    private readonly gitService: GitService
  ) {}

  async provideCodeActions(
    params: CodeActionParams
  ): Promise<(Command | CodeAction)[]> {
    const codeActions: CodeAction[] = params.context.diagnostics.flatMap(
      (diagnostic) => {
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
        return codeActionResolver(
          diagnostic,
          params.textDocument.uri,
          condition,
          verbalizedSeverity,
          ruleArgs,
        )
      }
    )

    return codeActions
  }
}
