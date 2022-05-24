import type { workspace } from 'vscode'

type Workspace = typeof workspace

export class EnableDefaultCommitlintRulesDiagnosticsCommand {
  public readonly command =
    'commitPro.command.enableDefaultCommitlintRulesDiagnostics'

  constructor(private readonly workspace: Workspace) {}

  public async run(): Promise<void> {
    try {
      const configuration = this.workspace.getConfiguration('commitPro')

      if (
        configuration.get('enableDefaultCommitlintRulesDiagnostics') === true
      ) {
        return
      }
      await configuration.update(
        'enableDefaultCommitlintRulesDiagnostics',
        true,
        false
      )
    } catch (err) {
      console.log('error', err)
    }
  }
}
