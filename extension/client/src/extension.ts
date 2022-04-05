import * as path from 'path'
import { workspace, ExtensionContext, commands } from 'vscode'
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node'

let client: LanguageClient

workspace.onDidOpenTextDocument(doc => {
  const text = doc.getText()
  const docFirstLineIsEmpty = text.length === 0 || text.startsWith('\n')
  if (doc.languageId === 'git-commit' && docFirstLineIsEmpty) {
    commands.executeCommand('editor.action.triggerSuggest')
  }
})

export function activate(context: ExtensionContext) {
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

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [
      { language: 'git-commit', scheme: 'file' },
      { language: 'git-commit', scheme: 'untitled' },
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      // fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
      // TODO: notify about commitlint changes
    },
  }

  // Create the language client and start the client.
  client = new LanguageClient(
    'conventionalCommits',
    'Conventional Commits',
    serverOptions,
    clientOptions
  )

  // Start the client. This will also launch the server
  client.start()
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined
  }
  return client.stop()
}
