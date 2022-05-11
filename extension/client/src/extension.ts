import * as path from 'path'
import { workspace, ExtensionContext, commands } from 'vscode'
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node'
import { OpenEditorCommand } from './command-open-editor'
import { GitClientService } from './git-client-service'

let client: LanguageClient

workspace.onDidOpenTextDocument((doc) => {
  const text = doc.getText()
  const docFirstLineIsEmpty = text.length === 0 || text.startsWith('\n')
  if (doc.languageId === 'git-commit' && docFirstLineIsEmpty) {
    commands.executeCommand('editor.action.triggerSuggest')
  }
})

export async function activate(context: ExtensionContext) {
  // context.subscriptions.push()

  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join('server', 'out', 'server.js')
  )
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] }

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  }

  // taken from
  // https://github.com/conventional-changelog/commitlint/blob/4682b059bb8c78c45f10960435c0bd01194421fa/%40commitlint/load/src/utils/load-config.ts#L17-L33
  const commitlintConfigFileNames = [
    'package.json',
    `.commitlintrc`,
    `.commitlintrc.json`,
    `.commitlintrc.yaml`,
    `.commitlintrc.yml`,
    `.commitlintrc.js`,
    `.commitlintrc.cjs`,
    `commitlint.config.js`,
    `commitlint.config.cjs`,
    // files supported by TypescriptLoader
    `.commitlintrc.ts`,
    `commitlint.config.ts`,
  ]
  const commitlintConfigFileGlobPattern = `**/{${commitlintConfigFileNames.join(
    ','
  )}}`

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [
      { language: 'git-commit', scheme: 'file' },
      { language: 'git-commit', scheme: 'untitled' },
    ],
    synchronize: {
      // Notify the server about file changes to commiltlint config files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher(
        commitlintConfigFileGlobPattern
      ),
    },
  }


  const gitClientService = new GitClientService()

  const openEditorCommand = new OpenEditorCommand()

  context.subscriptions.push(
    gitClientService,
    commands.registerCommand(
      openEditorCommand.command,
      async () => {
        const repoUris = await gitClientService.getRepoUris()
        openEditorCommand.run(repoUris)
      }
    )
  )

  // Create the language client and start the client.
  client = new LanguageClient(
    'conventionalCommits',
    'Conventional Commits',
    serverOptions,
    clientOptions
  )

  gitClientService.event((event) => {
    if (event.type === 'repository-update') {
      client.sendNotification('gitCommit/repoUpdate', event)
    } else if (event.type === 'repository-close') {
      client.sendNotification('gitCommit/repoClose', event)
    }
  })

  // Start the client. This will also launch the server
  context.subscriptions.push(client.start())

  await client.onReady()

  context.subscriptions.push(
    client.onNotification('gitCommit/requestRepoCommits', async (event) => {
      try {
        const commitData = await gitClientService.getCommitData(event.uri, event.commitIds)
        client.sendNotification('gitCommit/repoCommits', commitData)
      } catch { /* it's ok, server is outdated and is already getting notified */}
    })
  )

  gitClientService.fireInitialRepoUpdates()
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined
  }
  return client.stop()
}
