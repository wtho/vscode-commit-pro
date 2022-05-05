import { Uri, window, commands } from 'vscode'

type GitService = any

interface GitUri {
  rootUri: Uri
}

function isGitUri(arg: GitUri | unknown): arg is GitUri {
  return (
    typeof arg === 'object' &&
    'rootUri' in arg &&
    (arg as GitUri).rootUri instanceof Uri
  )
}

export class OpenEditorCommand {
  public readonly id = 'todorename.editor.command.openEditor'

  constructor(
    private readonly gitService: GitService,
    private readonly fileScheme: string = 'git-commit',
  ) {}

  public async run(arg: GitUri | unknown): Promise<void> {
    if (this.gitService.api === undefined) return

    let repoRootUri: Uri | undefined = undefined

    if (isGitUri(arg)) {
      repoRootUri = arg.rootUri
    } else {
      const uri = window.activeTextEditor?.document.uri
      const repository =
        this.gitService.getRepository?.(uri) ??
        this.gitService.api?.repositories.find((e) => e.ui.selected) ??
        this.gitService.api?.repositories[0]

      repoRootUri = repository?.rootUri
    }

    if (repoRootUri === undefined) return

    const path = repoRootUri.path + '/.git/COMMIT_EDITMSG'
    const uri = Uri.file(path).with({ scheme: this.fileScheme })

    return commands.executeCommand('vscode.open', uri, {
      preview: false,
    })
  }
}
