import { Position, TextDocuments } from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import * as parser from 'git-commit-parser'
import { Workspace } from './server'
import { Config, loadConfig } from './commitlint-config'
import * as url from 'url'

export interface ParsedCommit {
  parseOutcome?: parser.ParseOutcome
  version: number
  text: string
  config: null | {
    configUri: ConfigurationUri | null
  }
}

export interface ConfigSet {
  config: Config
  configUri: ConfigurationUri | null
  configPath: string
  isDefaultConfig: boolean
  workspaceUri: string | null
  messages: Set<DocumentUri>
}

export type PartialTextDocument = Pick<
  TextDocument,
  'uri' | 'version' | 'getText'
>

type DocumentUri = string
type ConfigurationUri = string

const defaultConfigUri = 'file:///default-config'

export class CommitMessageProvider {
  private readonly documentDidCloseEventListeners: ((
    documentUri: string
  ) => void)[] = []
  private readonly parsedMessages = new Map<DocumentUri, ParsedCommit>()
  private readonly loadedConfigurations = new Map<ConfigurationUri, ConfigSet>()

  constructor(
    private readonly documents: TextDocuments<TextDocument>,
    private readonly workspace: Workspace
  ) {
    documents.onDidClose((event) => {
      this.documentDidCloseEventListeners.forEach((listener) =>
        listener(event.document.uri)
      )
    })

    // create/open/update commit message document
    //  -> identify configuration file
    //  -> if config not loaded: load configuration file
    //  -> parse commit message
    //  -> reference commit message <-> configuration

    // close commit message document
    //  -> dereference commit message <-> configuration

    // delete configuration file
    //  -> dereference commit message <-> configuration

    // create/update configuration file
    //  -> if new: identify commit message documents
    //  -> re-parse commit messages

    // const useWorkspaceConfig = doc.isUntitled || doc.uri.scheme !== 'file';
    // const path = useWorkspaceConfig
    //   ? workspace.workspaceFolders?.[0]?.uri.fsPath
    //   : doc.uri.fsPath;
    // const workspacePath = workspace.workspaceFolders?.[0]?.uri.fsPath;

    // const workspaceSettings: WorkspaceSettings = {
    //   commitlintConfigFilePath: ,
    //   workspacePath,
    // }

    // loadConfig(workspaceSettings).then((loadedConfig) => {
    //   commitlintConfig = loadedConfig
    //   documentParsedAstProvider.configChanged(
    //     loadedConfig?.parserOpts as parser.ParseOptions
    //   )
    // })

    // load default config
  }

  addDocumentDidCloseListener(listener: (documentUri: string) => void) {
    this.documentDidCloseEventListeners.push(listener)
  }

  enableWorkspaceFolderFeature() {
    this.workspace.onDidChangeWorkspaceFolders((event) => {
      console.log('workspace DID change', event)
    })
  }

  async getParsedTreeForDocument(
    document: PartialTextDocument,
    options?: { forceReload?: boolean }
  ): Promise<ParsedCommit | undefined> {
    const currentDocumentVersion = document.version
    const treeForDocumentUri = this.parsedMessages.get(document.uri)

    if (
      treeForDocumentUri &&
      treeForDocumentUri.version === currentDocumentVersion &&
      !options?.forceReload
    ) {
      return treeForDocumentUri
    }

    const {
      config,
      configUri,
      messages: messagesForConfig,
    } = await this.getConfig(
      treeForDocumentUri?.config?.configUri,
      document.uri
    )
    messagesForConfig.add(document.uri)

    const documentText = document.getText()
    const parseOutcome = parser.parseCommit(documentText, {
      ...(config.parserOpts ?? {}),
      strict: false,
    })
    const parsedTree: ParsedCommit = {
      version: currentDocumentVersion,
      text: documentText,
      parseOutcome,
      config: { configUri },
    }
    this.parsedMessages.set(document.uri, parsedTree)
    return parsedTree
  }

  async getParsedTreeForDocumentUri(
    documentUri: string,
    options?: { forceReload?: boolean }
  ): Promise<ParsedCommit | undefined> {
    const document = this.documents.get(documentUri)

    if (!document) {
      this.parsedMessages.delete(documentUri)
      return undefined
    }

    return await this.getParsedTreeForDocument(document, options)
  }

  async getConfig(
    configUri: string | null | undefined,
    documentUri: string,
    options?: { forceReload?: boolean }
  ): Promise<ConfigSet> {
    if (
      configUri &&
      this.loadedConfigurations.has(configUri) &&
      !options?.forceReload
    ) {
      return this.loadedConfigurations.get(configUri)!
    }

    // TODO: identify config file for document
    const workspaceFolders = await this.workspace.getWorkspaceFolders()
    // for each ws folder:
    //   if document uri is part of ws folder
    //     if config file exists in ws folder root
    //       load config
    const workspacesForDoc = workspaceFolders?.filter((workspaceFolder) =>
      documentUri.startsWith(workspaceFolder.uri)
    )
    const workspacesWithMaybeConfig = await Promise.all(
      workspacesForDoc?.map(async (workspaceFolder) => {
        const workspaceSettings = {
          commitlintConfigFilePath: undefined,
          workspacePath: url.fileURLToPath(workspaceFolder.uri),
        }
        const config = await loadConfig(workspaceSettings)
        return { config, workspaceFolder }
      }) ?? []
    )
    const workspacesWithConfig = workspacesWithMaybeConfig.filter(ws => ws.config.path !== 'unknown')

    if (workspacesWithConfig.length > 0) {
      // TODO: what if there are multiple configs?
      const workspaceWithConfig = workspacesWithConfig[0]

      const configUri =
        workspaceWithConfig.config.path !== 'unknown'
          ? url.pathToFileURL(workspaceWithConfig.config.path).href
          : null

      const configSet: ConfigSet = {
        config: workspaceWithConfig.config.config,
        configPath: workspaceWithConfig.config.path,
        configUri,
        isDefaultConfig: workspaceWithConfig.config.default,
        workspaceUri: workspaceWithConfig.workspaceFolder.uri,
        messages: new Set<DocumentUri>(),
      }
      if (configSet.configUri) {
        this.loadedConfigurations.set(configSet.configUri, configSet)
      }
      return configSet
    }

    return this.getDefaultConfig()
  }

  async getDefaultConfig(): Promise<ConfigSet> {
    if (this.loadedConfigurations.has(defaultConfigUri)) {
      return this.loadedConfigurations.get(defaultConfigUri)!
    }

    const defaultConfig = await loadConfig({
      commitlintConfigFilePath: undefined,
      workspacePath: undefined,
    })
    const defaultConfigSet: ConfigSet = {
      config: defaultConfig.config,
      configUri: defaultConfigUri,
      configPath: defaultConfig.path,
      isDefaultConfig: defaultConfig.default,
      workspaceUri: null,
      messages: new Set<DocumentUri>(),
    }
    this.loadedConfigurations.set(defaultConfigUri, defaultConfigSet)
    return defaultConfigSet
  }

  getDocuments(): PartialTextDocument[] {
    return [...this.parsedMessages.entries()].map(([uri, tree]) => ({
      version: tree.version,
      uri,
      getText: () => tree.text,
    }))
  }

  async configsChanged(configUris: string[]) {
    // invalidate all documents for these configs

    for (const configUri of this.loadedConfigurations.keys()) {
      if (configUris.includes(configUri)) {
        // invalidate documents
        const configSet = this.loadedConfigurations.get(configUri)!
        const documentUris = [...configSet.messages]
        if (documentUris.length > 0) {
          await this.getConfig(configSet.configUri, documentUris[0], { forceReload: true })
          await Promise.all(
            documentUris.map((documentUri) =>
              this.getParsedTreeForDocumentUri(documentUri, { forceReload: true })
            )
          )
        }
      }
    }
  }

  async configCreatedOrDeleted() {
    // invalidate all documents for all configs
    this.loadedConfigurations.clear()
    const documentUris = [...this.parsedMessages.keys()]
    this.parsedMessages.clear()
    if (documentUris.length > 0) {
      await Promise.all(
        documentUris.map((documentUri) =>
          this.getParsedTreeForDocumentUri(documentUri, { forceReload: true })
        )
      )
    }
  }

  offsetAtPosition(documentUri: string, position: Position): number {
    const document = this.documents.get(documentUri)
    return document?.offsetAt(position) ?? -1
  }
}
