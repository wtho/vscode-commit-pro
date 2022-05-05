import { parseTreeFullMessage } from "./parser-full-message"
import { LineWiseNode, parseTreeLineWise } from "./parser-line-wise"

export interface ParseOptions {
  issuePrefixes?: string[]
  issuePrefixesCaseSensitive?: boolean
  noteKeywords?: string[]
  commentChar?: string
  strict?: boolean
}

export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  issuePrefixes: ['#'],
  issuePrefixesCaseSensitive: false,
  noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
  commentChar: '#',
  strict: false,
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

export function parseTree(
  text: string,
  parseOptions: ParseOptions = DEFAULT_PARSE_OPTIONS
): { root: Node | undefined; errors: ParseError[] } {
  const options = {
    ...DEFAULT_PARSE_OPTIONS,
    ...(parseOptions ?? {})
  }

  const { root: parsedLineWise, errors: parseErrorsLineWise } = parseTreeLineWise(text, options)

  const { root: parsedFullMessage, errors: parseErrorsFullMessage } = parseTreeFullMessage(parsedLineWise, options)

  return {
    root: parsedFullMessage,
    errors: [...parseErrorsLineWise, ...parseErrorsFullMessage],
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
    // TODO: multiple footers possible!
    if (sectionNode) {
      return sectionNode
    }
  }
  if (['type', 'scope', 'description', 'breaking-exclamation-mark'].includes(type)) {
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

export function getStringContentOfNode(
  node: Node | LineWiseNode | undefined,
): string {
  if (!node) {
    return ''
  }
  if ('value' in node) {
    return node.value as string
  }
  if ('children' in node) {
    return node.children.map(child => getStringContentOfNode(child)).join('')
  }
  return ''
}

export function getRangeForCommitPosition(
  rootNode: Node,
  type: NodeType
): Range {
  const node = getFirstNodeOfType(rootNode, type)

  if (node) {
    return node.range
  }

  if (['type', 'scope', 'description', 'breaking-exclamation-mark'].includes(type)) {
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
