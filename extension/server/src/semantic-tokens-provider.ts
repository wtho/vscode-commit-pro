import * as parser from 'git-commit-parser'
import {
  SemanticTokensLegend,
  SemanticTokensBuilder,
  CancellationToken,
  ResponseError,
  ResultProgressReporter,
  SemanticTokensDelta,
  SemanticTokensDeltaParams,
  SemanticTokensDeltaPartialResult,
  WorkDoneProgressReporter,
  SemanticTokens,
  SemanticTokensClientCapabilities,
  SemanticTokensParams,
  SemanticTokensPartialResult,
} from 'vscode-languageserver/node'
import { CommitMessageProvider } from './commit-message-provider'

const range = (start: number, end: number) => Array.from({length: end - start}, (_, i) => i + start)

const standardTokens = [
  'namespace',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'type',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'decorator',
  'event',
  'function',
  'method',
  'macro',
  'label',
  'comment',
  'string',
  'keyword',
  'number',
  'regexp',
  'operator',
] as const

const standardModifiers = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'abstract',
  'async',
  'modification',
  'documentation',
  'defaultLibrary',
] as const

type StandardToken = typeof standardTokens[number]

const tokenMap: { [P in parser.NodeType]: StandardToken | null } = {
  type: 'type',
  'scope-paren-open': 'operator',
  scope: 'class',
  'scope-paren-close': 'operator',
  'breaking-exclamation-mark': 'interface',
  'breaking-change-literal': 'interface',
  description: 'string',
  message: null,
  header: null,
  body: null,
  footer: null,
  'footer-token': 'property',
  'footer-value': 'string',
  comment: 'comment',
  number: 'number',
  'issue-reference': 'function',
  punctuation: null,
  word: null,
  whitespace: null,
}

export class SemanticTokensProvider {
  private readonly tokensBuilders: Map<string, SemanticTokensBuilder> =
    new Map()
  public legend: SemanticTokensLegend | undefined
  private tokenNumberMap: { [P in parser.NodeType]: number } | undefined

  constructor(private readonly commitMessageProvider: CommitMessageProvider) {
    commitMessageProvider.addDocumentDidCloseListener((documentUri) => {
      this.tokensBuilders.delete(documentUri)
    })
  }

  setCapabilities(clientCapabilities: SemanticTokensClientCapabilities) {
    const clientTokenTypes = new Set<string>(clientCapabilities.tokenTypes)
    const clientTokenModifiers = new Set<string>(
      clientCapabilities.tokenModifiers
    )

    const usedTokens = Object.fromEntries(
      [...new Set<StandardToken | null>(Object.values(tokenMap))]
        .filter(
          (standardToken): standardToken is StandardToken =>
            standardToken !== null
        )
        .map((token, idx) => [token, idx])
    )
    const tokenNumberMap = Object.fromEntries(
      Object.entries(tokenMap)
        .filter((el): el is [string, StandardToken] => el[1] !== null)
        .map(([key, value]) => [key, usedTokens[value]])
    ) as { [P in parser.NodeType]: number }

    // TODO: only use token types if they are in client capabilities
    // otherwise select sensible alternatives

    // const tokenTypes: string[] = [];
    // for (let i = 0; i < TokenTypes._; i++) {
    //   const str = TokenTypes[i];
    //   if (clientTokenTypes.has(str)) {
    //     tokenTypes.push(str);
    //   } else {
    //     if (str === 'lambdaFunction') {
    //       tokenTypes.push('function');
    //     } else {
    //       tokenTypes.push('type');
    //     }
    //   }
    // }

    // const tokenModifiers: string[] = [];
    // for (let i = 0; i < TokenModifiers._; i++) {
    //   const str = TokenModifiers[i];
    //   if (clientTokenModifiers.has(str)) {
    //     tokenModifiers.push(str);
    //   }
    // }

    const legend = { tokenTypes: Object.keys(usedTokens), tokenModifiers: [] }
    this.legend = legend
    this.tokenNumberMap = tokenNumberMap
  }

  getTokensBuilder(documentUri: string): SemanticTokensBuilder {
    const builder = this.tokensBuilders.get(documentUri)
    if (builder) {
      return builder
    }
    const tokensBuilder = new SemanticTokensBuilder()
    this.tokensBuilders.set(documentUri, tokensBuilder)
    return tokensBuilder
  }

  buildTokens(
    tokensBuilder: SemanticTokensBuilder,
    tree: parser.Node
  ): SemanticTokensBuilder {
    const precedenceTypes: parser.NodeType[] = [
      'type',
      'scope',
      // 'description',
      // 'footer-token',
      // 'footer-value',
      // 'comment',
      'breaking-change-literal',
    ]

    const availableTokens = Object.keys(this.tokenNumberMap!)

    const hasChildren = (node: parser.Node): node is parser.InnerNode =>
      'children' in node && node.children?.length > 0

    const walk = (node: parser.Node) => {
      if (availableTokens.includes(node.type)) {
        // multiline tokens are not supported by vscode
        // create multiple tokens for each line
        range(node.range.start.line, node.range.end.line + 1).map(lineIdx => {
          const lineOffset = lineIdx === node.range.start.line ? node.range.start.character : 0
          const lineEndOffset = lineIdx === node.range.end.line ? node.range.end.character : Number.MAX_SAFE_INTEGER
          tokensBuilder.push(
            lineIdx,
            lineOffset,
            lineEndOffset - lineOffset,
            this.tokenNumberMap![node.type],
            0 // uses bitmask
          )
        })
      }
      if (!precedenceTypes.includes(node.type) && hasChildren(node)) {
        for (const child of node.children) {
          walk(child)
        }
      }
    }

    walk(tree)

    return tokensBuilder
  }

  async onDelta(
    params: SemanticTokensDeltaParams,
    token: CancellationToken,
    workDoneProgress: WorkDoneProgressReporter,
    resultProgress?: ResultProgressReporter<SemanticTokensDeltaPartialResult>
  ): Promise<SemanticTokens | SemanticTokensDelta | ResponseError<void>> {
    // analyze the document and return semantic tokens

    if (!this.tokenNumberMap) {
      return { edits: [] }
    }

    const parsed = await this.commitMessageProvider.getParsedTreeForDocumentUri(
      params.textDocument.uri
    )

    if (!parsed?.parseOutcome?.root) {
      return { edits: [] }
    }

    const tokensBuilder = this.getTokensBuilder(params.textDocument.uri)
    tokensBuilder.previousResult(params.previousResultId)

    const builtTokensBuilder = this.buildTokens(tokensBuilder, parsed.parseOutcome.root)

    return builtTokensBuilder.buildEdits()
  }

  async on(
    params: SemanticTokensParams,
    token: CancellationToken,
    workDoneProgress: WorkDoneProgressReporter,
    resultProgress?: ResultProgressReporter<SemanticTokensPartialResult>
  ): Promise<SemanticTokens | ResponseError<void>> {
    // analyze the document and return semantic tokens

    if (!this.tokenNumberMap) {
      return { data: [] }
    }

    const parsed = await this.commitMessageProvider.getParsedTreeForDocumentUri(
      params.textDocument.uri
    )

    if (!parsed?.parseOutcome?.root) {
      return { data: [] }
    }

    const tokensBuilder = this.getTokensBuilder(params.textDocument.uri)

    const builtTokensBuilder = this.buildTokens(tokensBuilder, parsed.parseOutcome.root)
    return builtTokensBuilder.build()
  }
}
