import { parseTreeFullMessage } from './parser-full-message'
import { LineWiseNode, parseTreeLineWise } from './parser-line-wise'

export interface ParseOptions {
  issuePrefixesCaseSensitive?: boolean
  strict?: boolean
  breakingExclamationMarkAllowed?: boolean

  // original commitlint parser options
  commentChar?: string
  headerCorrespondence?: string[]
  headerPattern?: RegExp
  breakingHeaderPattern?: RegExp
  issuePrefixes?: string[]
  mergeCorrespondence?: string[]
  mergePattern?: RegExp
  noteKeywords?: string[]
  revertCorrespondence?: string[]
  revertPattern?: RegExp
}

export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  issuePrefixes: ['#'],
  issuePrefixesCaseSensitive: false,
  noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
  commentChar: '#',
  strict: false,
  breakingExclamationMarkAllowed: true,
}

export interface ParseError {
  error: ParseErrorCode
  offset: number
  length: number
}

export const enum ParseErrorCode {
  InvalidSymbol = 1,
  InvalidNumberFormat = 2,
  PropertyNameExpected = 3,
  ValueExpected = 4,
  ColonExpected = 5,
  CommaExpected = 6,
  CloseParenExpected = 7,
  CloseBracketExpected = 8,
  EndOfFileExpected = 9,
  InvalidCommentToken = 10,
  UnexpectedEndOfComment = 11,
  UnexpectedEndOfString = 12,
  UnexpectedEndOfNumber = 13,
  InvalidUnicode = 14,
  InvalidEscapeCharacter = 15,
  InvalidCharacter = 16,
}

export function printParseErrorCode(code: ParseErrorCode) {
  switch (code) {
    case ParseErrorCode.InvalidSymbol:
      return 'InvalidSymbol'
    case ParseErrorCode.InvalidNumberFormat:
      return 'InvalidNumberFormat'
    case ParseErrorCode.PropertyNameExpected:
      return 'PropertyNameExpected'
    case ParseErrorCode.ValueExpected:
      return 'ValueExpected'
    case ParseErrorCode.ColonExpected:
      return 'ColonExpected'
    case ParseErrorCode.CommaExpected:
      return 'CommaExpected'
    case ParseErrorCode.CloseParenExpected:
      return 'CloseParenExpected'
    case ParseErrorCode.CloseBracketExpected:
      return 'CloseBracketExpected'
    case ParseErrorCode.EndOfFileExpected:
      return 'EndOfFileExpected'
    case ParseErrorCode.InvalidCommentToken:
      return 'InvalidCommentToken'
    case ParseErrorCode.UnexpectedEndOfComment:
      return 'UnexpectedEndOfComment'
    case ParseErrorCode.UnexpectedEndOfString:
      return 'UnexpectedEndOfString'
    case ParseErrorCode.UnexpectedEndOfNumber:
      return 'UnexpectedEndOfNumber'
    case ParseErrorCode.InvalidUnicode:
      return 'InvalidUnicode'
    case ParseErrorCode.InvalidEscapeCharacter:
      return 'InvalidEscapeCharacter'
    case ParseErrorCode.InvalidCharacter:
      return 'InvalidCharacter'
  }
  return '<unknown ParseErrorCode>'
}

export type NodeType =
  | 'message'
  | 'header'
  | 'type'
  | 'scope-paren-open'
  | 'scope'
  | 'scope-paren-close'
  | 'breaking-exclamation-mark'
  | 'description'
  | 'body'
  | 'breaking-change-literal'
  | 'issue-reference'
  | 'footer'
  | 'footer-token'
  | 'footer-value'
  | 'comment'
  | 'word'
  | 'whitespace'
  | 'number'
  | 'punctuation'

export interface Position {
  readonly line: number
  readonly character: number
}
export interface Range {
  readonly start: Position
  readonly end: Position
}

export type NodeValueType = string | number | boolean | null | unknown

export type Node = ValueNode<NodeValueType> | InnerNode
export interface ValueNode<T> {
  readonly type: NodeType
  readonly offset: number
  readonly length: number
  readonly range: Range
  readonly parent: Node | undefined
  readonly value?: T
}

export interface InnerNode {
  readonly type: NodeType
  readonly offset: number
  readonly length: number
  readonly range: Range
  readonly parent: Node | undefined
  readonly children: Node[]
}

export interface ParseOutcome {
  root: Node | undefined
  errors: ParseError[]
  raw: string
  header:
    | {
        raw: string
        type: string | undefined
        scope: string | undefined
        breakingExclamationMark: boolean
        description: string | undefined
      }
    | undefined
  body: string | undefined
  footers: {
    raw: string
    token: string
    value: string
  }[]
}

export function parseCommit(
  text: string,
  parseOptions: ParseOptions = DEFAULT_PARSE_OPTIONS
): ParseOutcome {

  const breakingExclamationMarkAllowed = doesConfigAllowBreakingExclamationMark(parseOptions, DEFAULT_PARSE_OPTIONS.breakingExclamationMarkAllowed ?? true)

  const options = {
    ...DEFAULT_PARSE_OPTIONS,
    ...(parseOptions ?? {}),
    breakingExclamationMarkAllowed
  }

  const isMessage = (node: Node | undefined): node is InnerNode =>
    node?.type === 'message'
  const isHeader = (node: Node | undefined): node is InnerNode =>
    node?.type === 'header'
  const isBody = (node: Node | undefined): node is InnerNode =>
    node?.type === 'body'
  const isFooter = (node: Node | undefined): node is InnerNode =>
    node?.type === 'footer'

  const { root: parsedLineWise, errors: parseErrorsLineWise } =
    parseTreeLineWise(text, options)

  const { root: parsedFullMessage, errors: parseErrorsFullMessage } =
    parseTreeFullMessage(parsedLineWise, options)

  let header: ParseOutcome['header']
  let body: ParseOutcome['body']
  let footers: ParseOutcome['footers'] = []

  if (isMessage(parsedFullMessage)) {
    for (const child of parsedFullMessage.children) {
      if (isHeader(child)) {
        header = {
          raw: getStringContentOfNode(child),
          type: getStringContentOfNode(
            child.children.find(({ type }) => type === 'type')
          ),
          scope: getStringContentOfNode(
            child.children.find(({ type }) => type === 'scope')
          ),
          breakingExclamationMark: child.children.some(
            ({ type }) => type === 'breaking-exclamation-mark'
          ),
          description: getStringContentOfNode(
            child.children.find(({ type }) => type === 'description')
          ),
        }
      }
      if (isBody(child)) {
        body = getStringContentOfNode(child)
      }
      if (isFooter(child)) {
        footers.push({
          raw: getStringContentOfNode(child),
          token: getStringContentOfNode(
            child.children.find(({ type }) => type === 'footer-token')
          ),
          value: getStringContentOfNode(
            child.children.find(({ type }) => type === 'footer-value')
          ),
        })
      }
    }
  }

  return {
    root: parsedFullMessage,
    errors: [...parseErrorsLineWise, ...parseErrorsFullMessage],
    raw: text,
    header,
    body,
    footers,
  }
}

export function getFirstNodeOfType(
  rootNode: Node,
  type: NodeType
): Node | undefined {
  if (!('children' in rootNode)) {
    return undefined
  }
  if (['header', 'body', 'footer'].includes(type)) {
    // smart search for whole body
    const sectionNode = rootNode.children?.find((node) => node.type === type)
    if (sectionNode) {
      return sectionNode
    }
  }
  if (
    ['type', 'scope', 'description', 'breaking-exclamation-mark'].includes(type)
  ) {
    // smart search in header
    const headerNode = rootNode.children?.find((node) => node.type === 'header')
    if (headerNode && 'children' in headerNode && headerNode.children?.length) {
      const searchedForNode = headerNode.children.find(
        (node) => node.type === type
      )
      if (searchedForNode) {
        return searchedForNode
      }
    }
    // otherwise get first line
    return undefined
  }
  // generic search
  const searchRecursively = (targetNode: Node): Node | undefined => {
    if (targetNode.type === type) {
      return targetNode
    }
    if (!('children' in targetNode)) {
      return undefined
    }
    const innerTarget = targetNode.children?.find((node) =>
      searchRecursively(node)
    )
    if (innerTarget) {
      return innerTarget
    }
    return undefined
  }
  const result = searchRecursively(rootNode)
  if (result) {
    return result
  }
  return undefined
}

export function getLastNodeOfType(
  rootNode: Node,
  type: NodeType
): Node | undefined {
  if (!('children' in rootNode)) {
    return undefined
  }
  if (['header', 'body', 'footer'].includes(type)) {
    // smart search for whole body
    const children = [...rootNode.children].reverse()
    const sectionNode = children.find((node) => node.type === type)
    if (sectionNode) {
      return sectionNode
    }
  }
  if (
    ['type', 'scope', 'description', 'breaking-exclamation-mark'].includes(type)
  ) {
    // smart search in header
    const headerNode = rootNode.children?.find((node) => node.type === 'header')
    if (headerNode && 'children' in headerNode && headerNode.children?.length) {
      const searchedForNode = headerNode.children.find(
        (node) => node.type === type
      )
      if (searchedForNode) {
        return searchedForNode
      }
    }
    // otherwise get first line
    return undefined
  }
  // generic search
  const searchRecursively = (targetNode: Node): Node | undefined => {
    if (targetNode.type === type) {
      return targetNode
    }
    if (!('children' in targetNode)) {
      return undefined
    }
    const children = [...targetNode.children].reverse()
    const innerTarget = children.find((node) => searchRecursively(node))
    if (innerTarget) {
      return innerTarget
    }
    return undefined
  }
  const result = searchRecursively(rootNode)
  if (result) {
    return result
  }
  return undefined
}

export function getStringContentOfNode(
  node: Node | LineWiseNode | undefined
): string {
  if (!node) {
    return ''
  }
  if ('value' in node) {
    return node.value as string
  }
  if ('children' in node) {
    return node.children.map((child) => getStringContentOfNode(child)).join('')
  }
  return ''
}

export function getRangeForCommitPosition(
  rootNode: Node,
  type: NodeType
): Range {
  const node = getFirstNodeOfType(rootNode, type)

  if (type === 'footer') {
    const last = getLastNodeOfType(rootNode, type)
    if (node && last) {
      return {
        start: node?.range.start,
        end: last?.range.end,
      }
    }
  }

  if (node) {
    return node.range
  }

  if (
    ['type', 'scope', 'description', 'breaking-exclamation-mark'].includes(type)
  ) {
    // return first line
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: Number.MAX_SAFE_INTEGER },
    }
  }

  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  }
}

export function contains(
  node: Node,
  offset: number,
  includeRightBound = false
): boolean {
  return (
    (offset >= node.offset && offset < node.offset + node.length) ||
    (includeRightBound && offset === node.offset + node.length)
  )
}

export function findNodeAtOffset(
  node: Node,
  offset: number,
  includeRightBound = false
): Node | undefined {
  if (contains(node, offset, includeRightBound)) {
    const children = 'children' in node ? node.children : []
    if (Array.isArray(children)) {
      for (
        let i = 0;
        i < children.length && children[i].offset <= offset;
        i++
      ) {
        const item = findNodeAtOffset(children[i], offset, includeRightBound)
        if (item) {
          return item
        }
      }
    }
    return node
  }
  return undefined
}

export function doesConfigAllowBreakingExclamationMark(parseOptions: ParseOptions | undefined, defaultValue: boolean): boolean {
  const exclamationMarkRelevantPattern = parseOptions?.headerPattern ?? parseOptions?.breakingHeaderPattern
  if (typeof parseOptions?.breakingExclamationMarkAllowed === 'boolean') {
    return parseOptions.breakingExclamationMarkAllowed
  } else if (exclamationMarkRelevantPattern) {
    // make an educated guess
    return exclamationMarkRelevantPattern.source.includes('!')
  }
  return defaultValue
}
