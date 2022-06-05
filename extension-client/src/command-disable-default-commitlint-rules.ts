import type { workspace } from 'vscode'

type Workspace = typeof workspace

export class DisableDefaultCommitlintRulesDiagnosticsCommand {
  public readonly command = 'commitPro.command.disableDefaultCommitlintRulesDiagnostics'

  constructor(private readonly workspace: Workspace) {}

  public async run(): Promise<void> {
    try {
      const configuration = this.workspace.getConfiguration('commitPro')

      if (configuration.get('enableDefaultCommitlintRulesDiagnostics') === false) {
        return
      }
      await configuration.update('enableDefaultCommitlintRulesDiagnostics', false, false)

    } catch (err) {
      console.log('error', err)
    }
  }
}
