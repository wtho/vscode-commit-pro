import { QuickPickItem, window, workspace } from 'vscode'
import {
  commitlintConfigFileData,
  CommitlintConfigFileNamesContext,
} from './commitlint-config-file-names'
import { LspClientService } from './lsp-client-service'
import { WorkspaceClientService } from './workspace-client-service'

type Workspace = typeof workspace
type Window = typeof window

export class CreateCommitlintConfigFileCommand {
  public readonly command = 'commitPro.command.createCommitlintConfigFile'

  constructor(
    private readonly workspace: Workspace,
    private readonly window: Window,
    private readonly workspaceClientService: WorkspaceClientService,
    private readonly lspClientService: LspClientService
  ) {}

  public async run(): Promise<void> {
    const workspaceUri = this.workspace.workspaceFolders?.[0]?.uri
    if (!workspaceUri) {
      throw new Error(`${this.command} requires a vscode workspace`)
    }

    const rootPackageJsonPromise = await this.workspace.findFiles(
      'package.json'
    )
    const hasRootPackageJson = rootPackageJsonPromise.length > 0

    const quickPickItems = Object.entries(commitlintConfigFileData)
      .map<QuickPickItem>(([label, { detail, description }]) => ({
        label,
        detail,
        description,
      }))
      .filter(({ label }) => label !== 'package.json' || hasRootPackageJson)

    try {
      const pickingItem = this.window.showQuickPick(quickPickItems)

      const [workspaceScopes, gitScopes] = await Promise.all([
        this.workspaceClientService.getScopeSuggestions(),
        this.lspClientService.requestHistoryScopes(),
      ])
      // TODO keep them separated and add comments to templates to explain
      // origin of each scope (for template languages where comments are allowed)
      const scopes = [
        ...workspaceScopes.map(({ label, origin, type }) => label),
        ...gitScopes.map(({ scope, count, lastUsed }) => scope),
      ]

      const context: CommitlintConfigFileNamesContext = {
        workspaceUri,
        scopes,
        getFileContent: (fileUri) =>
          new Promise((resolve) =>
            this.workspace.fs
              .readFile(fileUri)
              .then((uint8Array) => resolve(uint8Array.toString()))
          ),
      }

      const pickedItem = await pickingItem

      if (!pickedItem) {
        return
      }

      const workspaceEdit = await commitlintConfigFileData[
        pickedItem.label
      ].getEdit(context)

      await this.workspace.applyEdit(workspaceEdit)

    } catch (err) {
      console.log('error', err)
    }
  }
}
