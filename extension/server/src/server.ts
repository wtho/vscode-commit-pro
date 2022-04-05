import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  SemanticTokensRegistrationOptions,
  SemanticTokensRegistrationType,
  Proposed,
  CodeActionKind,
  LSPObject,
} from 'vscode-languageserver/node'

import { TextDocument } from 'vscode-languageserver-textdocument'

import * as parser from 'git-commit-parser'
import * as commitlint from './commitlint'
import { loadConfig } from './commitlint-config'
import { SemanticTokensProvider } from './semantic-tokens'

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all)

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

const semanticTokensProvider = new SemanticTokensProvider(documents)

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

  let result: InitializeResult & { capabilities: Proposed.$DiagnosticServerCapabilities } = {
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
      // codeActionProvider: {
      // 	codeActionKinds: [CodeActionKind.Refactor, CodeActionKind.Source, CodeActionKind.SourceOrganizeImports],
      // 	resolveProvider: true
      // },
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
      // notebookDocumentSync: {
      // 	notebookSelector: [{
      // 		cells: [{ language: 'bat'}]
      // 	}],
      // 	mode: 'notebook'
      // }
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
      ((change.settings as LSPObject)['languageServerExample'] ||
        defaultSettings)
    )
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument)
})

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings)
  }
  let result = documentSettings.get(resource)
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'languageServerExample',
    })
    documentSettings.set(resource, result)
  }
  return result
}

// Only keep settings for open documents
documents.onDidClose((e) => {
  // TODO tell external git process to close program so commit gets added to log
  documentSettings.delete(e.document.uri)
})

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document)
})

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // TODO: do not reload config every time
  const config = await loadConfig()

  // In this simple example we get the settings for every validate run.
  // const settings = await getDocumentSettings(textDocument.uri)

  // The validator creates diagnostics for all uppercase words length 2 and more
  const text = textDocument.getText()

  const rootNode = parser.parseTree(text)

  if (!rootNode) {
    console.warn(
      `OnValidate: Could not parse tree from input ${text.slice(0, 50)}...`
    )
    return
  }

  const { rules, ...options } = config

  const { diagnostics, configErrors, semVerUpdate } = await commitlint.validate(
    {
      parsedTree: rootNode,
      commitMessage: text,
      options,
      rules,
    }
  )

  const enrichedDiagnostics = diagnostics.map((diagnostic) => {
    diagnostic.source = 'commitlint'
    return diagnostic
  })

  // const diagnostic: Diagnostic = {
  //   severity: DiagnosticSeverity.Warning,
  //   range: {
  //     start: textDocument.positionAt(m.index),
  //     end: textDocument.positionAt(m.index + m[0].length),
  //   },
  //   message: `${m[0]} is all uppercase.`,
  //   source: 'ex',
  // }
  // if (hasDiagnosticRelatedInformationCapability) {
  //   diagnostic.relatedInformation = [
  //     {
  //       location: {
  //         uri: textDocument.uri,
  //         range: Object.assign({}, diagnostic.range),
  //       },
  //       message: 'Spelling matters',
  //     },
  //     {
  //       location: {
  //         uri: textDocument.uri,
  //         range: Object.assign({}, diagnostic.range),
  //       },
  //       message: 'Particularly for names',
  //     },
  //   ]
  // }

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({
    uri: textDocument.uri,
    diagnostics: enrichedDiagnostics,
  })
}

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  connection.console.log('We received an file change event')
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

// This handler provides the initial list of the completion items.
connection.onCompletion(
  (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.

    const document = documents.get(textDocumentPosition.textDocument.uri)
    if (!document) {
      return []
    }

    const parsed = parser.parseTree(document.getText())

    const offset = document.offsetAt(textDocumentPosition.position)

    return getCompletions(parsed, offset)
  }
)

function getCompletions(rootNode: parser.Node | undefined, offset: number) {
  if (!rootNode) {
    return []
  }

  const node = parser.findNodeAtOffset(rootNode, offset, true)

  if (!node) {
    return []
  }

  const completions: { [key: string]: CompletionItem[] } = {
    type: [
      {
        label: 'feat',
        kind: CompletionItemKind.Field,
      },
      {
        label: 'fix',
        kind: CompletionItemKind.Field,
      },
      {
        label: 'refactor',
        kind: CompletionItemKind.Field,
      },
    ],
  }

  const completionItemKeys = Object.keys(completions)

  let upNode: parser.Node | undefined = node
  while (upNode) {
    if (completionItemKeys.includes(upNode.type)) {
      return completions[upNode.type]
    }
    upNode = upNode.parent
  }
  return []
}

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  if (item.data === 1) {
    item.detail = 'TypeScript details'
    item.documentation = 'TypeScript documentation'
  } else if (item.data === 2) {
    item.detail = 'JavaScript details'
    item.documentation = 'JavaScript documentation'
  }
  return item
})

// let tokenBuilders: Map<string, SemanticTokensBuilder> = new Map();
// documents.onDidClose((event) => {
// 	tokenBuilders.delete(event.document.uri);
// });
// function getTokenBuilder(document: TextDocument): SemanticTokensBuilder {
// 	const builder = tokenBuilders.get(document.uri);
// 	if (builder !== undefined) {
// 		return builder;
// 	}
// 	const newBuilder = new SemanticTokensBuilder();
// 	tokenBuilders.set(document.uri, newBuilder);
// 	return newBuilder;
// }
// function buildTokens(builder: SemanticTokensBuilder, document: TextDocument) {
// 	const text = document.getText();
// 	const regexp = /\w+/g;
// 	let match: RegExpMatchArray | null = regexp.exec(text);
// 	let tokenCounter: number = 0;
// 	let modifierCounter: number = 0;
// 	while (match !== null && match.index !== undefined) {
// 		const word = match[0];
// 		const position = document.positionAt(match.index);
// 		const tokenType = tokenCounter % TokenTypes._;
// 		const tokenModifier = 1 << modifierCounter % TokenModifiers._;
// 		builder.push(position.line, position.character, word.length, tokenType, tokenModifier);
// 		tokenCounter++;
// 		modifierCounter++;
//     match = regexp.exec(text)
// 	}
// }
// connection.languages.semanticTokens.onDelta((params) => {
// 	const document = documents.get(params.textDocument.uri);
// 	if (document === undefined) {
// 		return { edits: [] };
// 	}
// 	const builder = getTokenBuilder(document);
// 	builder.previousResult(params.previousResultId);
// 	buildTokens(builder, document);
// 	return builder.buildEdits();
// });

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection)

// Listen on the connection
connection.listen()
