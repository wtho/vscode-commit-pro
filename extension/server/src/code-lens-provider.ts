import {
  CodeLens,
  CodeLensParams,
  Position,
  Range,
} from 'vscode-languageserver'
import { CommitMessageProvider } from './commit-message-provider'
import type { Workspace } from './server'

export class CodeLensProvider {
  constructor(
    private readonly commitMessageProvider: CommitMessageProvider,
    private readonly workspace: Workspace
  ) {}

  async provideCodeLenses(params: CodeLensParams): Promise<CodeLens[]> {
    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(
        params.textDocument.uri
      )
    const config = await this.commitMessageProvider.getConfig(
      parsedCommit?.config?.configUri,
      params.textDocument.uri
    )

    const defaultCommitlintRulesDiagnosticsEnabled = await this.workspace.getConfiguration(
      'commitPro.enableDefaultCommitlintRulesDiagnostics'
    )

    const hasConfigFile = !config.isDefaultConfig

    const lenses: CodeLens[] = []

    if (!hasConfigFile && defaultCommitlintRulesDiagnosticsEnabled) {
      lenses.push({
        range: Range.create(Position.create(0, 0), Position.create(0, 0)),
        command: {
          title: 'Disable default commitlint rules',
          command: 'commitPro.command.disableDefaultCommitlintRulesDiagnostics',
        }
      })
    }
    if (!hasConfigFile && !defaultCommitlintRulesDiagnosticsEnabled) {
      lenses.push({
        range: Range.create(Position.create(0, 0), Position.create(0, 0)),
        command: {
          title: 'Enable default commitlint rules',
          command: 'commitPro.command.enableDefaultCommitlintRulesDiagnostics',
        }
      })
    }
    if (!hasConfigFile) {
      lenses.push({
        range: Range.create(Position.create(0, 0), Position.create(0, 0)),
        command: {
          title: 'Create commitlint config file',
          command: 'commitPro.command.createCommitlintConfigFile',
        }
      })
    }

    return lenses
  }
}
