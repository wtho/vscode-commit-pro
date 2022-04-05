import * as parser from 'git-commit-parser'
import {
  SemanticTokensLegend,
  SemanticTokensBuilder,
  CancellationToken,
  HandlerResult,
  ResponseError,
  ResultProgressReporter,
  SemanticTokensDelta,
  SemanticTokensDeltaParams,
  SemanticTokensDeltaPartialResult,
  TextDocuments,
  WorkDoneProgressReporter,
  SemanticTokens,
  SemanticTokensClientCapabilities,
  SemanticTokensParams,
  SemanticTokensPartialResult,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'

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

const tokenMap: { [P in parser.NodeType]: StandardToken } = {
  type: 'type',
  'scope-paren-open': 'operator',
  scope: 'class',
  'scope-paren-close': 'operator',
  'breaking-exclamation-mark': 'macro',
  'breaking-change-literal': 'macro',
  description: 'label',
  message: 'string',
  header: 'string',
  body: 'string',
  footer: 'string',
  'footer-token': 'string',
  'footer-word-token': 'function',
  'footer-word': 'keyword',
  number: 'number',
  symbol: 'string',
  word: 'string',
  whitespace: 'string',
}

// client way
// export const semanticTokensLegend = new SemanticTokensLegend(
//   Object.values(tokenMap),
//   standardModifiers.map((x) => x)
// )

export class SemanticTokensProvider {
  private readonly tokensBuilders: Map<string, SemanticTokensBuilder> =
    new Map()
  public legend: SemanticTokensLegend | undefined
  private tokenNumberMap: { [P in parser.NodeType]: number } | undefined

  constructor(private readonly documents: TextDocuments<TextDocument>) {
    documents.onDidClose((event) => {
      this.tokensBuilders.delete(event.document.uri)
    })
  }

  setCapabilities(clientCapabilities: SemanticTokensClientCapabilities) {
    console.log(clientCapabilities)
    const clientTokenTypes = new Set<string>(clientCapabilities.tokenTypes)
    const clientTokenModifiers = new Set<string>(
      clientCapabilities.tokenModifiers
    )

    const usedTokens = Object.fromEntries(
      [...new Set<StandardToken>(Object.values(tokenMap))].map((token, idx) => [
        token,
        idx,
      ])
    )
    const tokenNumberMap = Object.fromEntries(
      Object.entries(tokenMap).map(([key, value]) => [key, usedTokens[value]])
    ) as { [P in parser.NodeType]: number }

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

  getTokenBuilder(document: TextDocument): SemanticTokensBuilder {
    const builder = this.tokensBuilders.get(document.uri)
    if (builder) {
      return builder
    }
    const tokensBuilder = new SemanticTokensBuilder()
    this.tokensBuilders.set(document.uri, tokensBuilder)
    return tokensBuilder
  }

  async onDelta(
    params: SemanticTokensDeltaParams,
    token: CancellationToken,
    workDoneProgress: WorkDoneProgressReporter,
    resultProgress?: ResultProgressReporter<SemanticTokensDeltaPartialResult>
  ): Promise<SemanticTokens | SemanticTokensDelta | ResponseError<void>> {
    console.log('semantic token provider running')
    // analyze the document and return semantic tokens

    if (!this.tokenNumberMap) {
      return { edits: [] }
    }

    const document = this.documents.get(params.textDocument.uri)

    if (!document) {
      return { edits: [] }
    }

    const tree = parser.parseTree(document.getText())

    if (!tree) {
      return { edits: [] }
    }

    const tokensBuilder = this.getTokenBuilder(document)
    tokensBuilder.previousResult(params.previousResultId)

    const precedenceTypes: parser.NodeType[] = ['type', 'scope', 'description']

    const walk = (node: parser.Node) => {
      if (
        precedenceTypes.includes(node.type) ||
        !node.children ||
        node.children.length === 0
      ) {
        tokensBuilder.push(
          node.range.start.line,
          node.range.start.character,
          node.length,
          this.tokenNumberMap![node.type],
          0 // uses bitmask
        )
      } else {
        for (const child of node.children) {
          walk(child)
        }
      }
    }

    walk(tree)
    return tokensBuilder.buildEdits()
  }

  async on(
    params: SemanticTokensParams,
    token: CancellationToken,
    workDoneProgress: WorkDoneProgressReporter,
    resultProgress?: ResultProgressReporter<SemanticTokensPartialResult>
  ): Promise<SemanticTokens | ResponseError<void>> {
    console.log('semantic token provider running')
    // analyze the document and return semantic tokens

    if (!this.tokenNumberMap) {
      return { data: [] }
    }

    const document = this.documents.get(params.textDocument.uri)

    if (!document) {
      return { data: [] }
    }

    const tree = parser.parseTree(document.getText())

    if (!tree) {
      return { data: [] }
    }

    const tokensBuilder = this.getTokenBuilder(document)

    const precedenceTypes: parser.NodeType[] = ['type', 'scope', 'description']

    const walk = (node: parser.Node) => {
      if (
        precedenceTypes.includes(node.type) ||
        !node.children ||
        node.children.length === 0
      ) {
        tokensBuilder.push(
          node.range.start.line,
          node.range.start.character,
          node.length,
          this.tokenNumberMap![node.type],
          0 // uses bitmask
        )
      } else {
        for (const child of node.children) {
          walk(child)
        }
      }
    }

    walk(tree)
    return tokensBuilder.build()
  }

  // params.previousResultId
  // const tokensBuilder = new SemanticTokensBuilder(semanticTokensLegend)
  // const tokensData = tokensBuilder.build()
  // const semanticTokensDelta: SemanticTokensDelta = {
  //   edits: [
  //     {
  //       deleteCount: 0,
  //       start: 0,
  //       data: tokensData,
  //     },
  //   ],
  // }
  // const semanticTokens: SemanticTokens = {
  //   data: tokensData,
  // }

  // if (Math.random() > 0.5) {
  //   return semanticTokensDelta
  // } else if (Math.random() > 0.5) {
  //   return semanticTokensDelta
  // }
  // const responseError: ResponseError<void> = new ResponseError<void>(
  //   123,
  //   'Some error message'
  // )
  // return responseError
}
