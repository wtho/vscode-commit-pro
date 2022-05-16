import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextEdit,
} from 'vscode-languageserver'
import { CommitMessageProvider, ConfigSet } from './commit-message-provider'
import * as parser from 'git-commit-parser'
import { GitService } from './git-service'

export interface WorkspaceScope {
  label: string
  origin: string
  type: string
}

const defaultTypeCompletions = [
  {
    label: 'feat',
    detail: 'A feature',
  },
  {
    label: 'fix',
    detail: 'A bug fix',
  },
  {
    label: 'build',
    detail: 'A build',
  },
  {
    label: 'chore',
    detail: 'A chore',
  },
  {
    label: 'ci',
    detail: 'A CI',
  },
  {
    label: 'docs',
    detail: 'Documentation',
  },
  {
    label: 'style',
    detail: 'A style',
  },
  {
    label: 'refactor',
    detail: 'A refactor',
  },
  {
    label: 'perf',
    detail: 'A performance',
  },
  {
    label: 'test',
    detail: 'A test',
  },
]

const sortTextFromIndex = (index: number) => `${`${index}`.padStart(3, '0')}`

const sortTextFromCountAndIndex = (count: number, index: number) =>
  `${`${999 - count}`.padStart(3, '0')}-${`${index}`.padStart(3, '0')}`

const getNewTextEdit = (rootNode: parser.Node, nodeType: parser.NodeType) => {
  const node = parser.getRangeForCommitPosition(rootNode, nodeType)
  const textEdit: Omit<TextEdit, 'newText'> | undefined = node
    ? {
        range: {
          start: node.start,
          end: node.end,
        },
      }
    : undefined

  return (newText: string): TextEdit | undefined => {
    if (!textEdit) {
      return undefined
    }
    return {
      range: textEdit.range,
      newText,
    }
  }
}

export class CompletionProvider {
  constructor(
    private readonly commitMessageProvider: CommitMessageProvider,
    private readonly gitService: GitService,
    private readonly workspaceScopeRequester: () => Promise<WorkspaceScope[]>
  ) {}
  // This handler provides the initial list of the completion items.
  async provideCompletion(
    textDocumentPosition: TextDocumentPositionParams
  ): Promise<CompletionItem[]> {
    const documentUri = textDocumentPosition.textDocument.uri

    const parsedCommit =
      await this.commitMessageProvider.getParsedTreeForDocumentUri(documentUri)
    if (!parsedCommit) {
      return []
    }
    const configSet = await this.commitMessageProvider.getConfig(
      parsedCommit.config?.configUri,
      documentUri
    )
    const offset = this.commitMessageProvider.offsetAtPosition(
      textDocumentPosition.textDocument.uri,
      textDocumentPosition.position
    )

    const parseOutcome = parsedCommit.parseOutcome
    const rootNode = parseOutcome?.root

    if (!parseOutcome || !rootNode) {
      return []
    }

    const node = parser.findNodeAtOffset(rootNode, offset, true)

    if (!node) {
      return []
    }

    const completions: {
      [key: string]: () => CompletionItem[] | Promise<CompletionItem[]>
    } = {
      type: () => this.getCompletionTypes(configSet, rootNode, parseOutcome),
      scope: () => this.getCompletionScopes(configSet, rootNode),
      'scope-paren-open': () => this.getCompletionScopes(configSet, rootNode),
      'scope-paren-close': () =>
        this.getCompletionBreakingExclamationMark(configSet, parseOutcome),
    }

    const completionItemKeys = Object.keys(completions)

    let upNode: parser.Node | undefined = node
    while (upNode) {
      if (completionItemKeys.includes(upNode.type)) {
        return completions[upNode.type]()
      }
      upNode = upNode.parent
    }
    return []
  }

  async getCompletionTypes(
    configSet: ConfigSet,
    root: parser.Node,
    parseOutcome: parser.ParseOutcome
  ): Promise<CompletionItem[]> {
    const hasScope = !!parseOutcome.header?.scope
    const hasBreakingExclamationMark =
      !!parseOutcome.header?.breakingExclamationMark

    const typeEnumRule = configSet?.config?.rules?.['type-enum']
    const ruleDisabled = (typeEnumRule?.[0] ?? 0) === 0
    const ruleAlways = typeEnumRule?.[1] === 'always'
    const typeEnumValues = typeEnumRule?.[2] ?? []
    const textEditForNewText = getNewTextEdit(root, 'type')

    const enrichWithBreakingExclamationMark = (
      completions: CompletionItem[]
    ) => {
      if (hasScope || hasBreakingExclamationMark) {
        return completions
      }
      return completions.flatMap((completion) => {
        if (completion.label !== parseOutcome.header?.type) {
          return [completion]
        }

        // this label is already fully written-out, offer the same completion with breaking exclamation mark
        return [
          completion,
          {
            ...completion,
            // TODO: documentation
            // TODO: detail
            // TODO: labelDetails
            label: `${completion.label}!`,
            kind: CompletionItemKind.Operator,
            textEdit: textEditForNewText(`${completion.label}!`),
          },
        ]
      })
    }

    if (!ruleDisabled && ruleAlways && typeEnumValues.length > 0) {
      return enrichWithBreakingExclamationMark(
        typeEnumValues.map((type) => ({
          label: type,
          kind: CompletionItemKind.Enum,
          // TODO: documentation
          // TODO: detail
          // TODO: labelDetails
          // TODO: sortText to ensure order from config
          textEdit: textEditForNewText(type),
        }))
      )
    }

    const skipInDefaults: Set<string> = new Set()
    if (!ruleDisabled && !ruleAlways && typeEnumValues.length > 0) {
      // we do not want to propose default types if they are in the "never" list of the config
      typeEnumValues.forEach((value) => skipInDefaults.add(value))
    }

    // get types from history and defaults
    const completions: CompletionItem[] = []

    if (configSet.workspaceUri) {
      const typeData = await this.gitService.getTypeDataForWorkspace(
        configSet.workspaceUri
      )
      if (typeData.length > 0) {
        completions.push(
          ...typeData.map(({ type, count, lastUsed }, index) => ({
            label: type,
            kind: CompletionItemKind.Interface,
            detail: `git log: ${count}x used, last ${lastUsed}`,
            textEdit: textEditForNewText(type),
            sortText: sortTextFromCountAndIndex(count, index),
          }))
        )
        // we do not want to propose default types again if they are already proposed from the history
        completions.forEach((completion) =>
          skipInDefaults.add(completion.label)
        )
      }
    }
    // add defaults
    completions.push(
      ...defaultTypeCompletions
        .filter((completion) => !skipInDefaults.has(completion.label))
        .map((completion, index) => ({
          label: completion.label,
          kind: CompletionItemKind.Constant,
          detail: completion.detail,
          textEdit: textEditForNewText(completion.label),
          sortText: sortTextFromCountAndIndex(0, index),
        }))
    )

    return enrichWithBreakingExclamationMark(completions)
  }

  async getCompletionScopes(
    configSet: ConfigSet,
    root: parser.Node
  ): Promise<CompletionItem[]> {
    // TODO: check if rule is always applied
    const scopeEnumRule = configSet?.config?.rules?.['scope-enum']
    const ruleDisabled = (scopeEnumRule?.[0] ?? 0) === 0
    const ruleAlways = scopeEnumRule?.[1] === 'always'
    const scopeEnumValues = scopeEnumRule?.[2] ?? []
    const textEditForNewText = getNewTextEdit(root, 'scope')

    if (!ruleDisabled && ruleAlways && scopeEnumValues.length > 0) {
      return scopeEnumValues.map((scope) => ({
        label: scope,
        kind: CompletionItemKind.Enum,
        // TODO: documentation
        // TODO: detail
        // TODO: labelDetails
        // TODO: sortText to ensure order from config
        textEdit: textEditForNewText(scope),
      }))
    }

    // get types from history and workspace completions
    const completions: CompletionItem[] = []

    if (configSet.workspaceUri) {
      // order: TODO
      // * first workspace which have been in history
      // * then history
      // * lastly workspace which have NOT been in history

      const [workspaceCompletions, scopeData] = await Promise.all([
        this.workspaceScopeRequester(),
        this.gitService.getScopeDataForWorkspace(configSet.workspaceUri),
      ])

      completions.push(
        ...workspaceCompletions.map((workspaceCompletion, index) => ({
          label: workspaceCompletion.label,
          kind: CompletionItemKind.Folder,
          // TODO: detail
          textEdit: textEditForNewText(workspaceCompletion.label),
          sortText: sortTextFromCountAndIndex(999, index),
        }))
      )

      if (scopeData.length > 0) {
        completions.push(
          ...scopeData.map(({ scope, count, lastUsed }, index) => ({
            label: scope,
            kind: CompletionItemKind.Enum,
            detail: `git log: ${count}x used, last ${lastUsed}`,
            textEdit: textEditForNewText(scope),
            sortText: sortTextFromCountAndIndex(count, index),
          }))
        )
      }
    }

    return completions
  }

  getCompletionBreakingExclamationMark(
    configSet: ConfigSet,
    parseOutcome: parser.ParseOutcome
  ): CompletionItem[] {
    // TODO: check if breaking exclamation mark is not wanted

    // check if breaking exclamation mark is already there
    const existingBreakingExclamationMark =
      parseOutcome.header?.breakingExclamationMark
    if (existingBreakingExclamationMark) {
      return []
    }

    // TODO: also enable exclamation mark after type, not only after scope brackets

    return [
      {
        label: 'Breaking Change "!"',
        kind: CompletionItemKind.Operator,
        insertText: '!',
      },
    ]
  }

  // This handler resolves additional information for the item selected in
  // the completion list.
  resolveCompletion(item: CompletionItem): CompletionItem {
    if (item.label === 'fantasy') {
      item.detail = 'Fantasy details'
      item.documentation = 'Fantasy documentation'
    } else if (item.data === 2) {
      item.detail = 'JavaScript details'
      item.documentation = 'JavaScript documentation'
    }
    return item
  }
}
