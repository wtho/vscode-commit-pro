import {
  CompletionItem,
  CompletionItemKind,
  MarkupContent,
  TextDocumentPositionParams,
  TextEdit,
} from 'vscode-languageserver'
import { CommitMessageProvider, ConfigSet } from './commit-message-provider'
import * as parser from 'git-commit-parser'
import { GitService } from './git-service'
import { WorkspaceScopeProvider } from './workspace-scope-provider'

const defaultTypeCompletions = [
  {
    label: 'feat',
    title: 'Features',
    description: 'Introduces a new feature to the codebase',
  },
  {
    label: 'fix',
    title: 'Bug Fixes',
    description: 'Patches a bug in the codebase',
  },
  {
    label: 'build',
    title: 'Builds',
    description: 'Affects the build system or external dependencies',
  },
  {
    label: 'chore',
    title: 'Chores',
    description: 'Changes that do not modify src or test files',
  },
  {
    label: 'ci',
    title: 'Continuous Integration',
    description: 'CI configuration files and scripts changes',
  },
  {
    label: 'docs',
    title: 'Documentation',
    description: 'Documentation only changes',
  },
  {
    label: 'style',
    title: 'Styles',
    description:
      'Formatting and code-style changes not affecting meaning of code',
  },
  {
    label: 'refactor',
    title: 'Code Refactoring',
    description: 'Refactorings of existing code, no bug fixing or new features',
  },
  {
    label: 'perf',
    title: 'Performance Improvements',
    description: 'Performance improvements in the codebase',
  },
  {
    label: 'test',
    title: 'Tests',
    description: 'Adding missing tests or correcting existing tests',
  },
]

const getTypeTitle = (type: string) =>
  defaultTypeCompletions.find((data) => data.label === type) ?? type

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
    private readonly workspaceScopeProvider: WorkspaceScopeProvider
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
    const breakingExclamationMarkAllowed =
      parser.doesConfigAllowBreakingExclamationMark(
        configSet.config.parserOpts,
        false
      )

    const typeEnumRule = configSet?.config?.rules?.['type-enum']
    const ruleDisabled = (typeEnumRule?.[0] ?? 0) === 0
    const ruleAlways = typeEnumRule?.[1] === 'always'
    const typeEnumValues = typeEnumRule?.[2] ?? []
    const textEditForNewText = getNewTextEdit(root, 'type')

    const enrichWithBreakingExclamationMark = (
      completions: CompletionItem[]
    ): CompletionItem[] => {
      if (
        hasScope ||
        hasBreakingExclamationMark ||
        !breakingExclamationMarkAllowed
      ) {
        return completions
      }
      return completions.flatMap((completion) => {
        if (completion.label !== parseOutcome.header?.type) {
          return [completion]
        }

        // this label is already fully written-out, offer the same completion with breaking exclamation mark
        const existingDocumentation =
          (completion.documentation as MarkupContent).value ?? ''
        return [
          completion,
          {
            ...completion,
            documentation: {
              kind: 'markdown',
              value: [
                '### Breaking Exclamation Mark',
                `Adds a "!" to the end of the commit message type "${completion.label}" to indicate a breaking change and enforce a new major version:`,
                '```git-commit',
                `${completion.label}!: updated file`,
                '```',
                '',
                existingDocumentation,
              ].join('\n'),
            },
            // TODO: detail?
            // TODO: labelDetails?
            label: `${completion.label}!`,
            kind: CompletionItemKind.Operator,
            textEdit: textEditForNewText(`${completion.label}!`),
          },
        ]
      })
    }

    if (!ruleDisabled && ruleAlways && typeEnumValues.length > 0) {
      return enrichWithBreakingExclamationMark(
        typeEnumValues.map((type, index) => {
          const typeLower = type.toLocaleLowerCase()
          const data = defaultTypeCompletions.find(typeData => typeData.label === typeLower)
          const title = data?.title ? `\`${data.label}\` - ${data.title}` : `\`${type}\``
          const description = data?.description ?? '*unknown type*'
          return {
            documentation: {
              kind: 'markdown',
              value: [
                `### ${title}`,
                `${description}`,
              ].join('\n'),
            },
            label: type,
            kind: CompletionItemKind.Enum,
            // TODO: detail?
            // TODO: labelDetails?
            sortText: sortTextFromIndex(index),
            textEdit: textEditForNewText(type),
          }
        })
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
          detail: completion.description,
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
      return scopeEnumValues.map((scope, index) => ({
        label: scope,
        kind: CompletionItemKind.Enum,
        // TODO: documentation - how?
        // TODO: detail
        // TODO: labelDetails
        sortText: sortTextFromIndex(index),
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
        this.workspaceScopeProvider.requestScopes(),
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
        // TODO: ensure consolidated duplicates
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
    // check if breaking exclamation mark is not wanted
    const breakingExclamationMarkAllowed =
      parser.doesConfigAllowBreakingExclamationMark(
        configSet.config.parserOpts,
        false
      )
    if (!breakingExclamationMarkAllowed) {
      return []
    }

    // check if breaking exclamation mark is already there
    const existingBreakingExclamationMark =
      parseOutcome.header?.breakingExclamationMark
    if (existingBreakingExclamationMark) {
      return []
    }

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
