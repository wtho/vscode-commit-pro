import {
  ParseOptions,
  InnerNode,
  ParseError,
  DEFAULT_PARSE_OPTIONS,
  NodeType,
  ParseErrorCode,
  ValueNode,
  NodeValueType,
} from './parser'
import { MutRange } from './parser-full-message'
import { createScanner, ScanError, SyntaxKind } from './scanner'

export type LineWiseNodeType =
  | Exclude<NodeType, 'body' | 'footer' | 'footer-token' | 'footer-value'>
  | 'line'

export type LineWiseNode = LineWiseValueNode<NodeValueType> | LineWiseInnerNode

export interface LineWiseValueNode<T>
  extends Omit<ValueNode<T>, 'type' | 'parent'> {
  type: LineWiseNodeType
  parent: LineWiseNode | undefined
}

export interface LineWiseInnerNode
  extends Omit<InnerNode, 'type' | 'parent' | 'children'> {
  type: LineWiseNodeType
  parent: LineWiseNode | undefined
  children: LineWiseNode[]
}

interface MutNode extends LineWiseInnerNode {
  type: LineWiseNodeType
  offset: number
  length: number
  range: MutRange
  parent: MutNode | undefined
  children: (MutNode | LineWiseValueNode<NodeValueType>)[]
}

export function parseTreeLineWise(
  text: string,
  parseOptions: ParseOptions = DEFAULT_PARSE_OPTIONS
): { root: LineWiseNode | undefined; errors: ParseError[] } {
  const options = {
    ...DEFAULT_PARSE_OPTIONS,
    ...(parseOptions ?? {})
  }
  const scanner = createScanner(text, options)
  const errors: ParseError[] = []

  // root
  const root: MutNode = {
    type: 'message',
    offset: 0,
    length: text.length,
    children: [],
    parent: undefined,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
  }

  let currentParent = root

  function onElement(valueNode: LineWiseNode): LineWiseNode {
    currentParent.children!.push(valueNode)
    return valueNode
  }

  // inline visitor
  function onInnerNodeBegin(
    nodeType: LineWiseNodeType,
    offset: number,
    startLine: number,
    startCharacter: number
  ) {
    currentParent = onElement({
      type: nodeType,
      offset,
      length: -1,
      parent: currentParent,
      children: [],
      range: {
        start: { line: startLine, character: startCharacter },
        end: { line: 0, character: 0 },
      },
    }) as MutNode
  }
  function onInnerNodeEnd(
    nodeType: LineWiseNodeType,
    offset: number,
    length: number,
    startLine: number,
    startCharacter: number
  ) {
    currentParent.range.end = { line: startLine, character: startCharacter }
    currentParent.length = offset /* + length */ - currentParent.offset
    currentParent = currentParent.parent!
  }
  function onValueNode(
    type: LineWiseNodeType,
    value: string,
    offset: number,
    length: number,
    startLine: number,
    startCharacter: number
  ) {
    onElement({
      type,
      offset,
      length,
      parent: currentParent,
      value,
      range: {
        start: { line: startLine, character: startCharacter },
        end: { line: startLine, character: startCharacter + value.length },
      },
    })
  }
  function onError(
    error: ParseErrorCode,
    offset: number,
    length: number,
    startLine: number,
    startCharacter: number
  ) {
    errors.push({ error, offset, length })
  }
  const toInnerNodeBegin = (nodeType: LineWiseNodeType) => () =>
    onInnerNodeBegin(
      nodeType,
      scanner.getTokenOffset(),
      scanner.getTokenStartLine(),
      scanner.getTokenStartCharacter()
    )
  const toInnerNodeEnd = (nodeType: LineWiseNodeType) => () =>
    onInnerNodeEnd(
      nodeType,
      scanner.getTokenOffset(),
      scanner.getTokenLength(),
      scanner.getTokenStartLine(),
      scanner.getTokenStartCharacter()
    )
  const toValue = (nodeType: LineWiseNodeType) => (value: string) =>
    onValueNode(
      nodeType,
      value,
      scanner.getTokenOffset(),
      scanner.getTokenLength(),
      scanner.getTokenStartLine(),
      scanner.getTokenStartCharacter()
    )
  const toFixedValue = (nodeType: LineWiseNodeType, value: string) => () =>
    onValueNode(
      nodeType,
      value,
      scanner.getTokenOffset(),
      scanner.getTokenLength(),
      scanner.getTokenStartLine(),
      scanner.getTokenStartCharacter()
    )

  const onHeaderBegin = toInnerNodeBegin('header')
  const onHeaderEnd = toInnerNodeEnd('header')
  const onTypeBegin = toInnerNodeBegin('type')
  const onTypeEnd = toInnerNodeEnd('type')
  const onScopeBegin = toInnerNodeBegin('scope')
  const onScopeEnd = toInnerNodeEnd('scope')
  const onScopeParenOpen = toFixedValue('scope-paren-open', '(')
  const onScopeParenClose = toFixedValue('scope-paren-close', ')')
  const onBreakingExclamationMark = toFixedValue(
    'breaking-exclamation-mark',
    '!'
  )
  const onHeaderColon = toFixedValue('punctuation', ':')
  const onDescriptionBegin = toInnerNodeBegin('description')
  const onDescriptionEnd = toInnerNodeEnd('description')
  const onLineBegin = toInnerNodeBegin('line')
  const onLineEnd = toInnerNodeEnd('line')
  const onCommentBegin = toInnerNodeBegin('comment')
  const onCommentEnd = toInnerNodeEnd('comment')

  const onBreakingChangeLiteral = toValue('breaking-change-literal')
  const onIssueRefLiteral = toValue('issue-reference')
  const onWordValue = toValue('word')
  const onWhitespaceValue = toValue('whitespace')
  const onNumber = toValue('number')
  const onPunctuation = toValue('punctuation')

  // const onBodyBegin = toCopyFromTokenNoArg(visitor.onBodyBegin)
  // const onBodyEnd = toCopyFromTokenNoArg(visitor.onBodyEnd)
  // const onFooterBegin = toCopyFromTokenNoArg(visitor.onFooterBegin)
  // const onFooterEnd = toCopyFromTokenNoArg(visitor.onFooterEnd)
  // const onFooterTokenBegin = toInnerNodeBegin('footer-token')
  // const onFooterTokenEnd = toInnerNodeEnd('footer-token')
  // const onFooterValueBegin = toCopyFromTokenNoArg(visitor.onFooterValueBegin)
  // const onFooterValueEnd = toCopyFromTokenNoArg(visitor.onFooterValueEnd)

  // const onLiteralValue = toOneArgVisitWithPath(visitor.onLiteralValue)

  function scanNext(): SyntaxKind {
    while (true) {
      const token = scanner.scan()
      switch (scanner.getTokenError()) {
        case ScanError.InvalidUnicode:
          handleError(ParseErrorCode.InvalidUnicode)
          break
        case ScanError.InvalidCharacter:
          handleError(ParseErrorCode.InvalidCharacter)
          break
      }
      return token
    }
  }

  function handleError(
    error: ParseErrorCode,
    skipUntilAfter: SyntaxKind[] = [],
    skipUntil: SyntaxKind[] = []
  ): void {
    onError(
      error,
      scanner.getTokenOffset(),
      scanner.getTokenLength(),
      scanner.getTokenStartLine(),
      scanner.getTokenStartCharacter()
    )
    if (skipUntilAfter.length + skipUntil.length > 0) {
      let token = scanner.getToken()
      while (token !== SyntaxKind.EOF) {
        if (skipUntilAfter.indexOf(token) !== -1) {
          scanNext()
          break
        } else if (skipUntil.indexOf(token) !== -1) {
          break
        }
        token = scanNext()
      }
    }
  }

  function parseWord(): boolean {
    const word = scanner.getTokenValue()
    onWordValue(word)
    scanNext()
    return true
  }

  function parseWhitespace(): boolean {
    const whitespace = scanner.getTokenValue()
    onWhitespaceValue(whitespace)
    scanNext()
    return true
  }

  function parseNumber(): boolean {
    const num = scanner.getTokenValue()
    onNumber(num)
    scanNext()
    return true
  }

  function parsePunctuation(): boolean {
    const punctuation = scanner.getTokenValue()
    onPunctuation(punctuation)
    scanNext()
    return true
  }

  function parseBreakingChangeLiteral(): boolean {
    const breakingChange = scanner.getTokenValue()
    onBreakingChangeLiteral(breakingChange)
    scanNext()
    return true
  }

  function parseIssueRefLiteral(): boolean {
    const issueRef = scanner.getTokenValue()
    onIssueRefLiteral(issueRef)
    scanNext()
    return true
  }

  function parseValue(): boolean {
    switch (scanner.getToken()) {
      case SyntaxKind.SpaceLiteral:
        return parseWhitespace()
      case SyntaxKind.NumericLiteral:
        return parseNumber()
      case SyntaxKind.BreakingChangeLiteral:
        return parseBreakingChangeLiteral()
      case SyntaxKind.IssueRefLiteral:
        return parseIssueRefLiteral()
      case SyntaxKind.WordLiteral:
        return parseWord()
      default:
        return parsePunctuation()
    }
  }

  function parseBreakingExclamationMark(): boolean {
    if (scanner.getToken() === SyntaxKind.ExclamationMark) {
      onBreakingExclamationMark()
      scanNext()
      return true
    }
    return false
  }

  function parseHeaderColon(): boolean {
    if (scanner.getToken() === SyntaxKind.ColonMark) {
      onHeaderColon()
      scanNext()
      if (scanner.getToken() === SyntaxKind.SpaceLiteral) {
        scanNext()
      }
      return true
    }
    return false
  }

  function parseComment(): boolean {
    // this method is only called at line beginning
    if (scanner.getTokenStartCharacter() !== 0) {
      throw new Error(
        `parseComment can only begin at line beginning, not at ${scanner.getTokenStartCharacter()} chars in`
      )
    }

    if (scanner.getToken() !== SyntaxKind.CommentStartCharacter) {
      return false
    }

    onCommentBegin()

    while (
      scanner.getToken() !== SyntaxKind.LineBreak &&
      scanner.getToken() !== SyntaxKind.EOF
    ) {
      // comment tokenization - maybe take inspiration from
      // https://github.com/vim/vim/blob/master/runtime/syntax/gitcommit.vim

      // idea for now: simpler approach
      //   1. comment variables:
      //       On branch *main*
      //       Your branch is up to date with '*origin/main*'

      //   2. comment keywords:
      //            *modified*:   src/main.ts
      //            *deleted*:    src/main.ts
      //            *new file*:   src/main.ts

      //   3. comment paths:
      //            modified:   *src/main.ts*
      parseValue()
    }

    onCommentEnd()

    return true
  }

  function parseHeader(): boolean {
    // maybe first line is comment
    if (parseComment()) {
      return false
    }

    onHeaderBegin()
    onTypeBegin()
    while (
      scanner.getToken() !== SyntaxKind.ExclamationMark &&
      scanner.getToken() !== SyntaxKind.ColonMark &&
      scanner.getToken() !== SyntaxKind.OpenParenMark &&
      scanner.getToken() !== SyntaxKind.EOF
    ) {
      if (!parseValue()) {
        // TODO: should not contain whitespace
        // TODO: should only contain single word
        // TODO: should not contain punctuations
        handleError(
          ParseErrorCode.ValueExpected,
          [],
          [
            SyntaxKind.ExclamationMark,
            SyntaxKind.ColonMark,
            SyntaxKind.OpenParenMark,
          ]
        )
      }
    }
    onTypeEnd()
    if (scanner.getToken() === SyntaxKind.OpenParenMark) {
      onScopeParenOpen()
      scanNext()
      onScopeBegin()
      while (
        scanner.getToken() !== SyntaxKind.ColonMark &&
        scanner.getToken() !== SyntaxKind.CloseParenMark &&
        scanner.getToken() !== SyntaxKind.EOF
      ) {
        if (!parseValue()) {
          handleError(
            ParseErrorCode.ValueExpected,
            [],
            [SyntaxKind.ColonMark, SyntaxKind.CloseParenMark]
          )
        }
      }
      if (scanner.getToken() !== SyntaxKind.CloseParenMark) {
        handleError(ParseErrorCode.CloseParenExpected, [], [])
      }
      onScopeEnd()
      if (scanner.getToken() === SyntaxKind.CloseParenMark) {
        onScopeParenClose()
        scanNext()
      }
    }
    while (
      scanner.getToken() !== SyntaxKind.ExclamationMark &&
      scanner.getToken() !== SyntaxKind.ColonMark &&
      scanner.getToken() !== SyntaxKind.EOF
    ) {
      // TODO: error?
      parseValue()
    }
    if (scanner.getToken() === SyntaxKind.ExclamationMark) {
      parseBreakingExclamationMark()
    }
    while (
      scanner.getToken() !== SyntaxKind.ColonMark &&
      scanner.getToken() !== SyntaxKind.EOF
    ) {
      // TODO: error?
      parseValue()
    }
    if (scanner.getToken() === SyntaxKind.ColonMark) {
      parseHeaderColon()
    }
    onDescriptionBegin()
    while (
      scanner.getToken() !== SyntaxKind.LineBreak &&
      scanner.getToken() !== SyntaxKind.EOF
    ) {
      parseValue()
    }
    onDescriptionEnd()
    onHeaderEnd()
    return true
  }

  function parseLine(): void {
    onLineBegin()
    while (
      scanner.getToken() !== SyntaxKind.LineBreak &&
      scanner.getToken() !== SyntaxKind.EOF
    ) {
      parseValue()
    }
    onLineEnd()
  }

  function parseLines(): boolean {
    while (scanner.getToken() === SyntaxKind.LineBreak) {
      scanNext()
    }
    if (scanner.getToken() === SyntaxKind.EOF) {
      return true
    }

    while (scanner.getToken() !== SyntaxKind.EOF) {
      if (scanner.getToken() === SyntaxKind.LineBreak) {
        scanNext() // consume line break

        // try to parse comment from newline on
        const parsedComment = parseComment()
        if (parsedComment) {
          continue
        }
      }
      parseLine()
    }

    return true
  }

  // here the actual scanning happens
  // 1.: check if file is empty
  scanNext()
  if (scanner.getToken() === SyntaxKind.EOF) {
    handleError(ParseErrorCode.ValueExpected, [], [])
    return { root, errors }
  }

  // 2.: parse header
  if (!parseHeader()) {
    handleError(ParseErrorCode.ValueExpected, [], [])
    return { root, errors }
  }
  // 3.: parse body and footer lines
  parseLines()
  // 5.: check file ends with EOF
  if (scanner.getToken() !== SyntaxKind.EOF) {
    handleError(ParseErrorCode.EndOfFileExpected, [], [])
  }
  return { root, errors }
}
