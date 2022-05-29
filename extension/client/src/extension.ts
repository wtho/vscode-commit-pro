import * as path from 'path'
import { window, workspace, ExtensionContext, commands } from 'vscode'
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node'
import { CreateCommitlintConfigFileCommand } from './command-create-commitlint-config'
import { DisableDefaultCommitlintRulesDiagnosticsCommand } from './command-disable-default-commitlint-rules'
import { EnableDefaultCommitlintRulesDiagnosticsCommand } from './command-enable-default-commitlint-rules'
import { OpenEditorCommand } from './command-open-editor'
import { commitlintConfigFileGlobPattern } from './commitlint-config-file-names'
import { GitClientService } from './git-client-service'
import { LspClientService } from './lsp-client-service'
import { WorkspaceClientService } from './workspace-client-service'

export type ServerNotifications = Pick<
  LanguageClient,
  'onNotification' | 'sendNotification'
>

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
  // await workspace
  //   .getConfiguration('editor.semanticHighlighting.enabled', {
  //     languageId: 'git-commit',
  //   })
  //   .update('', true, false)

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

  // Create the language client and start the client.
  client = new LanguageClient(
    'commit-pro',
    'Commit Pro',
    serverOptions,
    clientOptions
  )

  client.getFeature

  const gitClientService = new GitClientService()
  const workspaceClientService = new WorkspaceClientService(workspace)
  const lspClientService = new LspClientService(client)

  const openEditorCommand = new OpenEditorCommand(gitClientService)
  const disableDefaultCommitlintRulesDiagnosticsCommand =
    new DisableDefaultCommitlintRulesDiagnosticsCommand(workspace)
  const enableDefaultCommitlintRulesDiagnosticsCommand =
    new EnableDefaultCommitlintRulesDiagnosticsCommand(workspace)
  const createCommitlintConfigFileCommand =
    new CreateCommitlintConfigFileCommand(
      workspace,
      window,
      workspaceClientService,
      lspClientService
    )

  context.subscriptions.push(
    workspaceClientService,
    lspClientService,
    gitClientService,

    commands.registerCommand(openEditorCommand.command, async () => {
      const repoUris = await gitClientService.getRepoUris()
      openEditorCommand.run(repoUris)
    }),
    commands.registerCommand(openEditorCommand.commandAlternate, async () => {
      const repoUris = await gitClientService.getRepoUris()
      openEditorCommand.run(repoUris, { amend: true })
    }),
    commands.registerCommand(
      disableDefaultCommitlintRulesDiagnosticsCommand.command,
      async () => {
        disableDefaultCommitlintRulesDiagnosticsCommand.run()
      }
    ),
    commands.registerCommand(
      enableDefaultCommitlintRulesDiagnosticsCommand.command,
      async () => {
        enableDefaultCommitlintRulesDiagnosticsCommand.run()
      }
    ),
    commands.registerCommand(
      createCommitlintConfigFileCommand.command,
      async () => {
        createCommitlintConfigFileCommand.run()
      }
    )
  )

  gitClientService.event((event) => {
    if (event.type === 'repository-update') {
      client.sendNotification('gitCommit/repoUpdate', event)
    } else if (event.type === 'repository-close') {
      client.sendNotification('gitCommit/repoClose', event)
    }
  })

  // Start the client. This will also launch the server
  await client.start()

  lspClientService.init()

  context.subscriptions.push(
    client.onNotification('gitCommit/requestRepoCommits', async (event) => {
      try {
        const commitData = await gitClientService.getCommitData(
          event.uri,
          event.commitIds
        )
        client.sendNotification('gitCommit/repoCommits', commitData)
      } catch {
        /* it's ok, server is outdated and is already getting notified */
      }
    }),

    client.onNotification(
      'gitCommit/requestScopeWorkspaceSuggestions',
      async (event) => {
        try {
          const suggestions = await workspaceClientService.getScopeSuggestions()
          await client.sendNotification(
            'gitCommit/scopeWorkspaceSuggestions',
            suggestions
          )
        } catch {
          await client.sendNotification(
            'gitCommit/scopeWorkspaceSuggestions',
            []
          )
        }
      }
    )
  )

  gitClientService.fireInitialRepoUpdates()
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined
  }
  return client.stop()
}
