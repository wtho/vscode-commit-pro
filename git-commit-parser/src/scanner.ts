/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Thomas Wirth.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Parts of the scanner have been inspired by jsonc-parser
// https://github.com/microsoft/node-jsonc-parser

import { DEFAULT_PARSE_OPTIONS, ParseOptions } from './parser'

export const enum ScanError {
  None = 0,
  InvalidUnicode = 1,
  InvalidCharacter = 2,
}

export const enum SyntaxKind {
  SpaceLiteral = 0,
  WordLiteral = 1,
  NumericLiteral = 2,
  OpenParenMark = 3,
  CloseParenMark = 4,
  ExclamationMark = 5,
  BreakingChangeLiteral = 6,
  ColonMark = 7,
  IssueRefLiteral = 8,
  LineBreak = 9,
  CommentStartCharacter = 10,
  CommentKeyWordLiteral = 11,
  CommentVariableLiteral = 12,
  CommentPathLiteral = 13,
  PunctuationMark = 14,
  EOF = 15,
}

export interface GitCommitScanner {
  setPosition(pos: number): void
  scan(): SyntaxKind
  getPosition(): number
  getToken(): SyntaxKind
  getTokenValue(): string
  getTokenOffset(): number
  getTokenLength(): number
  getTokenStartLine(): number
  getTokenStartCharacter(): number
  getTokenError(): ScanError
}

/**
 * Creates a git commit scanner on the given text.
 */
export function createScanner(
  text: string,
  parseOptions: ParseOptions = DEFAULT_PARSE_OPTIONS
): GitCommitScanner {
  const options = {
    ...DEFAULT_PARSE_OPTIONS,
    ...(parseOptions ?? {}),
  }

  const len = text.length
  let pos = 0,
    value: string = '',
    tokenOffset = 0,
    token: SyntaxKind = SyntaxKind.PunctuationMark,
    lineNumber = 0,
    lineStartOffset = 0,
    tokenLineStartOffset = 0,
    prevTokenLineStartOffset = 0,
    scanError: ScanError = ScanError.None

  function setPosition(newPosition: number) {
    pos = newPosition
    value = ''
    tokenOffset = 0
    token = SyntaxKind.SpaceLiteral
    scanError = ScanError.None
  }

  function scanPositiveInteger(): string {
    let start = pos
    if (text.charCodeAt(pos) === CharacterCodes._0) {
      pos++
    } else {
      pos++
      while (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++
      }
    }
    let end = pos
    return text.substring(start, end)
  }

  function scanWord(): string {
    let result = '',
      start = pos
    // see unicode property escapes
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Unicode_Property_Escapes
    const wordRegexp = /\p{Letter}|\p{Connector_Punctuation}|\p{Dash_Punctuation}/u
    const isWord = (char: string): boolean => wordRegexp.test(char)

    while (true) {
      if (pos >= len) {
        result += text.substring(start, pos)
        break
      }
      const ch = text.charAt(pos)

      if (!isWord(ch)) {
        result += text.substring(start, pos)
        break
      }
      pos++
    }
    return result
  }

  function scanNext(): SyntaxKind {
    value = ''
    scanError = ScanError.None

    tokenOffset = pos
    lineStartOffset = lineNumber
    prevTokenLineStartOffset = tokenLineStartOffset

    if (pos >= len) {
      // at the end
      tokenOffset = len
      return (token = SyntaxKind.EOF)
    }

    let code = text.charCodeAt(pos)
    // whitespace
    if (isWhiteSpace(code)) {
      do {
        pos++
        value += String.fromCharCode(code)
        code = text.charCodeAt(pos)
      } while (isWhiteSpace(code))

      return (token = SyntaxKind.SpaceLiteral)
    }

    // newlines
    if (isLineBreak(code)) {
      pos++
      value += String.fromCharCode(code)
      if (
        code === CharacterCodes.carriageReturn &&
        text.charCodeAt(pos) === CharacterCodes.lineFeed
      ) {
        pos++
        value += '\n'
      }
      lineNumber++
      tokenLineStartOffset = pos
      return (token = SyntaxKind.LineBreak)
    }

    const atNewline = tokenLineStartOffset === pos

    // comment char
    if (
      options.commentChar?.length === 1 &&
      atNewline &&
      text.charAt(pos) === options.commentChar
    ) {
      pos++
      value = text.substring(tokenOffset, pos)
      return (token = SyntaxKind.CommentStartCharacter)
    }

    // note keywords
    if (
      atNewline &&
      options.noteKeywords &&
      Array.isArray(options.noteKeywords) &&
      options.noteKeywords.length > 0
    ) {
      for (const noteKeyword of options.noteKeywords) {
        if (pos + noteKeyword.length > len) {
          continue
        }
        let i = 0
        while (
          i < noteKeyword.length &&
          text.charAt(pos + i) === noteKeyword.charAt(i)
        ) {
          i++
        }
        if (i === noteKeyword.length) {
          pos += noteKeyword.length
          value = text.substring(tokenOffset, pos)
          return (token = SyntaxKind.BreakingChangeLiteral)
        }
      }
    }

    // issue refs
    if (
      options.issuePrefixes &&
      Array.isArray(options.issuePrefixes) &&
      options.issuePrefixes.length > 0
    ) {
      for (const issuePrefix of options.issuePrefixes) {
        if (pos + issuePrefix.length + 1 > len) {
          continue
        }
        let i = 0
        while (
          i < issuePrefix.length &&
          text.charAt(pos + i) === issuePrefix.charAt(i)
        ) {
          i++
        }
        const prefixIsFollowedByNumber =  isDigit(text.charCodeAt(pos + i + 1))
        if (i === issuePrefix.length && prefixIsFollowedByNumber) {
          pos += issuePrefix.length
          const issueNumber = scanPositiveInteger()
          // also capture the number afterwards
          value = text.substring(tokenOffset, pos)
          return (token = SyntaxKind.IssueRefLiteral)
        }
      }
    }

    switch (code) {
      // tokens: ()!:#,
      case CharacterCodes.openParen:
        pos++
        value = text.substring(tokenOffset, pos)
        return (token = SyntaxKind.OpenParenMark)
      case CharacterCodes.closeParen:
        pos++
        value = text.substring(tokenOffset, pos)
        return (token = SyntaxKind.CloseParenMark)
      case CharacterCodes.exclamationMark:
        pos++
        value = text.substring(tokenOffset, pos)
        return (token = SyntaxKind.ExclamationMark)
      case CharacterCodes.colon:
        pos++
        value = text.substring(tokenOffset, pos)
        return (token = SyntaxKind.ColonMark)

      // numbers
      case CharacterCodes._0:
      case CharacterCodes._1:
      case CharacterCodes._2:
      case CharacterCodes._3:
      case CharacterCodes._4:
      case CharacterCodes._5:
      case CharacterCodes._6:
      case CharacterCodes._7:
      case CharacterCodes._8:
      case CharacterCodes._9:
        value += scanPositiveInteger()
        return (token = SyntaxKind.NumericLiteral)

      // words and unknown punctuation marks
      default:
        value = scanWord()

        if (value.length > 0) {
          return (token = SyntaxKind.WordLiteral)
        }

        // unknown
        value += String.fromCharCode(code)
        pos++
        return (token = SyntaxKind.PunctuationMark)
    }
  }

  return {
    setPosition: setPosition,
    getPosition: () => pos,
    scan: scanNext,
    getToken: () => token,
    getTokenValue: () => value,
    getTokenOffset: () => tokenOffset,
    getTokenLength: () => pos - tokenOffset,
    getTokenStartLine: () => lineStartOffset,
    getTokenStartCharacter: () => tokenOffset - prevTokenLineStartOffset,
    getTokenError: () => scanError,
  }
}

function isWhiteSpace(ch: number): boolean {
  return ch === CharacterCodes.space || ch === CharacterCodes.tab
}

function isLineBreak(ch: number): boolean {
  return ch === CharacterCodes.lineFeed || ch === CharacterCodes.carriageReturn
}

function isDigit(ch: number): boolean {
  return ch >= CharacterCodes._0 && ch <= CharacterCodes._9
}

const enum CharacterCodes {
  lineFeed = 0x0a, // \n
  carriageReturn = 0x0d, // \r
  space = 0x0020, // " "
  tab = 0x09, // \t
  openParen = 0x28, // (
  closeParen = 0x29, // )
  exclamationMark = 0x21, // !
  colon = 0x3a, // :

  _0 = 0x30,
  _1 = 0x31,
  _2 = 0x32,
  _3 = 0x33,
  _4 = 0x34,
  _5 = 0x35,
  _6 = 0x36,
  _7 = 0x37,
  _8 = 0x38,
  _9 = 0x39,
}
