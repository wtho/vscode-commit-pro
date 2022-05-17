import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  SemanticTokensRegistrationOptions,
  SemanticTokensRegistrationType,
  FileChangeType,
  CodeActionKind,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { EventEmitter } from 'stream'

import { SemanticTokensProvider } from './semantic-tokens-provider'
import { CommitMessageProvider, } from './commit-message-provider'
import { CompletionProvider, WorkspaceScope } from './completion-provider'
import {
  BaseCommit,
  GitClientRepositoryCloseEvent,
  GitClientRepostoryUpdateEvent,
  GitService,
} from './git-service'
import { CodeActionProvider } from './code-action-provider'
import { DiagnosticsProvider } from './diagnostics-provider'

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all)

export type Workspace = typeof connection['workspace']

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

const commitMessageProvider = new CommitMessageProvider(
  documents,
  connection.workspace
)
const gitService = new GitService()
const semanticTokensProvider = new SemanticTokensProvider(commitMessageProvider)
const completionProvider = new CompletionProvider(
  commitMessageProvider,
  gitService,
  () =>
    new Promise<WorkspaceScope[]>((resolve, reject) => {
      connection.sendNotification('gitCommit/requestScopeWorkspaceSuggestions')
      workspaceScopeEventTarget.once(
        'gitCommit/scopeWorkspaceSuggestions',
        (scopes: WorkspaceScope[]) => resolve(scopes)
      )
    })
)

const codeActionProvider = new CodeActionProvider(
  commitMessageProvider,
  gitService
)

const diagnosticsProvider = new DiagnosticsProvider(
  commitMessageProvider,
  connection.languages.diagnostics,
  documents
)

let hasConfigurationCapability = false
let hasWorkspaceFolderCapability = false
let hasDiagnosticRelatedInformationCapability = false

connection.onInitialize((params: InitializeParams) => {
  console.log('initializing language server')
  const capabilities = params.capabilities

  const semanticTokensCapabilities = capabilities.textDocument?.semanticTokens
  if (!semanticTokensCapabilities) {
    throw new Error('semantic tokens not supported')
  }

  semanticTokensProvider.setCapabilities(semanticTokensCapabilities)

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  )
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  )
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  )

  let result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // hoverProvider: true,
      completionProvider: {
        resolveProvider: true,
        // allCommitCharacters: ['.', ','],
      },
      signatureHelpProvider: {},
      definitionProvider: true,
      // referencesProvider: { workDoneProgress: true },
      // documentHighlightProvider: true,
      // documentSymbolProvider: true,
      // workspaceSymbolProvider: true,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix],
        resolveProvider: true,
      },
      // codeLensProvider: {
      // 	resolveProvider: true
      // },
      // documentFormattingProvider: true,
      // documentRangeFormattingProvider: true,
      // documentOnTypeFormattingProvider: {
      // 	firstTriggerCharacter: ';',
      // 	moreTriggerCharacter: ['{', '\n']
      // },
      // renameProvider: true,
      workspace: {
        workspaceFolders: {
          supported: hasWorkspaceFolderCapability,
          changeNotifications: true,
        },
      },
      // implementationProvider: {
      // 	id: 'AStaticImplementationID',
      // 	documentSelector: ['bat']
      // },
      typeDefinitionProvider: true,
      declarationProvider: { workDoneProgress: true },
      // executeCommandProvider: {
      // 	commands: ['testbed.helloWorld']
      // },
      // callHierarchyProvider: true,
      selectionRangeProvider: { workDoneProgress: true },
      diagnosticProvider: {
        // identifier: 'testbed',
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
    },
  }
  return result
})

connection.onInitialized((params) => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    )
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log('Workspace folder change event received.')
    })
    commitMessageProvider.enableWorkspaceFolderFeature()
  }
  const registrationOptions: SemanticTokensRegistrationOptions = {
    documentSelector: ['git-commit'],
    legend: semanticTokensProvider.legend!,
    range: false,
    full: {
      delta: true,
    },
  }
  connection.client.register(
    SemanticTokensRegistrationType.type,
    registrationOptions
  )
})

// The example settings
interface ExampleSettings {
  // maxNumberOfProblems: number
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = {}
let globalSettings: ExampleSettings = defaultSettings

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map()

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear()
  } else if (typeof change.settings === 'object') {
    globalSettings = <ExampleSettings>(
      ((change.settings as any)['languageServerExample'] || defaultSettings)
    )
  }

  // Revalidate all open text documents
  diagnosticsProvider.refreshDiagnostics()
})

connection.onDefinition((params) => {
  console.log('definition request', params)
  return []
})

// function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
//   if (!hasConfigurationCapability) {
//     return Promise.resolve(globalSettings)
//   }
//   let result = documentSettings.get(resource)
//   if (!result) {
//     result = connection.workspace.getConfiguration({
//       scopeUri: resource,
//       section: 'languageServerExample',
//     })
//     documentSettings.set(resource, result)
//   }
//   return result
// }

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri)
})

// In this simple example we get the settings for every validate run.
// const settings = await getDocumentSettings(textDocument.uri)

connection.onDidChangeWatchedFiles(async (change) => {
  // taken from
  // https://github.com/conventional-changelog/commitlint/blob/4682b059bb8c78c45f10960435c0bd01194421fa/%40commitlint/load/src/utils/load-config.ts#L17-L33
  // compare if up-to-date with master:
  // https://github.com/conventional-changelog/commitlint/blob/master/%40commitlint/load/src/utils/load-config.ts
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

  const createdConfigChanges =
    change.changes
      .filter((change) => change.type === FileChangeType.Created)
      .map((change) => change.uri)
      .filter((uri) =>
        commitlintConfigFileNames.some((fileName) =>
          uri.endsWith(`/${fileName}`)
        )
      ).length > 0

  if (!createdConfigChanges) {
    const changedConfigUris = change.changes
      .map((change) => change.uri)
      .filter((uri) =>
        commitlintConfigFileNames.some((fileName) =>
          uri.endsWith(`/${fileName}`)
        )
      )

    await commitMessageProvider.configsChanged(changedConfigUris)
  } else {
    // invalidate all documents, as the new config could be used for any document
    await commitMessageProvider.configCreated()
  }

  const documents = commitMessageProvider.getDocuments()

  // re-evaluate diagnostics
  diagnosticsProvider.refreshDiagnostics()
})

// connection.onDidOpenTextDocument((handler) => {
//   const doc = documents.get(handler.textDocument.uri)
//   doc.
// })

connection.languages.semanticTokens.on(
  (params, token, workDoneProgress, resultProgress) =>
    semanticTokensProvider.on(params, token, workDoneProgress, resultProgress)
)
connection.languages.semanticTokens.onDelta(
  (params, token, workDoneProgress, resultProgress) =>
    semanticTokensProvider.onDelta(
      params,
      token,
      workDoneProgress,
      resultProgress
    )
)

connection.onCompletion(
  (
    textDocumentPosition: TextDocumentPositionParams
  ): Promise<CompletionItem[]> => {
    return completionProvider.provideCompletion(textDocumentPosition)
  }
)

connection.onCompletionResolve((item) =>
  completionProvider.resolveCompletion(item)
)

connection.onCodeAction((params) =>
  codeActionProvider.provideCodeActions(params)
)

connection.onNotification(
  'gitCommit/repoUpdate',
  (event: GitClientRepostoryUpdateEvent) => {
    const { commitIds, uri } = gitService.updateRepo(event.uri, event)
    if (commitIds.length === 0) {
      return
    }
    connection.sendNotification('gitCommit/requestRepoCommits', {
      uri,
      commitIds,
    })
  }
)

connection.onNotification(
  'gitCommit/repoCommits',
  (event: { uri: string; commits: BaseCommit[] }) => {
    gitService.addRepoCommits(event.uri, event.commits)
  }
)

connection.onNotification(
  'gitCommit/repoClose',
  (event: GitClientRepositoryCloseEvent) => {
    gitService.closeRepo(event.uri)
  }
)

const workspaceScopeEventTarget = new EventEmitter()

connection.onNotification(
  'gitCommit/scopeWorkspaceSuggestions',
  (event: { scopes: WorkspaceScope[] }) => {
    workspaceScopeEventTarget.emit('gitCommit/scopeWorkspaceSuggestions', event)
  }
)

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection)

// Listen on the connection
connection.listen()
