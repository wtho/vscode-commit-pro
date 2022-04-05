/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Thomas Wirth.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ScanError, SyntaxKind, GitCommitScanner } from './main';

/**
 * Creates a git commit scanner on the given text.
 */
export function createScanner(text: string): GitCommitScanner {

	const len = text.length;
	let pos = 0,
		value: string = '',
		tokenOffset = 0,
		token: SyntaxKind = SyntaxKind.Symbol,
		lineNumber = 0,
		lineStartOffset = 0,
		tokenLineStartOffset = 0,
		prevTokenLineStartOffset = 0,
		scanError: ScanError = ScanError.None;

	function setPosition(newPosition: number) {
		pos = newPosition;
		value = '';
		tokenOffset = 0;
		token = SyntaxKind.Symbol;
		scanError = ScanError.None;
	}

	function scanPositiveInteger(): string {
		let start = pos;
		if (text.charCodeAt(pos) === CharacterCodes._0) {
			pos++;
		} else {
			pos++;
			while (pos < text.length && isDigit(text.charCodeAt(pos))) {
				pos++;
			}
		}
		let end = pos;
		return text.substring(start, end);
	}


  function scanWord(): string {
		let result = '',
			start = pos;
    const wordRegexp = /\p{L}|\p{Pc}|\p{Pd}/u;
    const isWord = (char: string): boolean => wordRegexp.test(char);

		while (true) {
			if (pos >= len) {
				result += text.substring(start, pos);
				break;
			}
			const ch = text.charAt(pos);

      if (!isWord(ch)) {
				result += text.substring(start, pos);
				break;
			}
			pos++;
		}
		return result;
  }

	function scanNext(): SyntaxKind {

		value = '';
		scanError = ScanError.None;

		tokenOffset = pos;
		lineStartOffset = lineNumber;
		prevTokenLineStartOffset = tokenLineStartOffset;

		if (pos >= len) {
			// at the end
			tokenOffset = len;
			return token = SyntaxKind.EOF;
		}

		let code = text.charCodeAt(pos);
		// whitespace
		if (isWhiteSpace(code)) {
			do {
				pos++;
				value += String.fromCharCode(code);
				code = text.charCodeAt(pos);
			} while (isWhiteSpace(code));

			return token = SyntaxKind.WhiteSpace;
		}

		// newlines
		if (isLineBreak(code)) {
			pos++;
			value += String.fromCharCode(code);
			if (code === CharacterCodes.carriageReturn && text.charCodeAt(pos) === CharacterCodes.lineFeed) {
				pos++;
				value += '\n';
			}
			lineNumber++;
			tokenLineStartOffset = pos;
			return token = SyntaxKind.LineBreakToken;
		}

		switch (code) {
			// tokens: ()!:#,
			case CharacterCodes.openParen:
				pos++;
				return token = SyntaxKind.OpenParenToken;
			case CharacterCodes.closeParen:
				pos++;
				return token = SyntaxKind.CloseParenToken;
			case CharacterCodes.exclamationMark:
				pos++;
				return token = SyntaxKind.ExclamationMarkToken;
			case CharacterCodes.colon:
				pos++;
				return token = SyntaxKind.ColonToken;
			case CharacterCodes.hashMark:
        if (lineStartOffset === pos) {
          pos++
          while (pos < text.length && !isLineBreak(text.charCodeAt(pos))) {
            // TODO: check EOF? last line comment?
            pos++
          }
          return token = SyntaxKind.Comment
        }
				pos++;
				return token = SyntaxKind.HashMarkToken;

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
				value += scanPositiveInteger();
				return token = SyntaxKind.NumericLiteral;

			// words and unknown symbols
			default:
				value = scanWord();

        if (value.length > 0) {
          return token = SyntaxKind.WordLiteral;
        }

        // unknown
				value += String.fromCharCode(code);
				pos++;
				return token = SyntaxKind.Symbol;
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
	};
}

function isWhiteSpace(ch: number): boolean {
	return ch === CharacterCodes.space || ch === CharacterCodes.tab;
}

function isLineBreak(ch: number): boolean {
	return ch === CharacterCodes.lineFeed || ch === CharacterCodes.carriageReturn;
}

function isDigit(ch: number): boolean {
	return ch >= CharacterCodes._0 && ch <= CharacterCodes._9;
}

const enum CharacterCodes {
	lineFeed = 0x0A,              // \n
	carriageReturn = 0x0D,        // \r

	space = 0x0020,   // " "

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

	a = 0x61,
	b = 0x62,
	c = 0x63,
	d = 0x64,
	e = 0x65,
	f = 0x66,
	g = 0x67,
	h = 0x68,
	i = 0x69,
	j = 0x6A,
	k = 0x6B,
	l = 0x6C,
	m = 0x6D,
	n = 0x6E,
	o = 0x6F,
	p = 0x70,
	q = 0x71,
	r = 0x72,
	s = 0x73,
	t = 0x74,
	u = 0x75,
	v = 0x76,
	w = 0x77,
	x = 0x78,
	y = 0x79,
	z = 0x7A,

	A = 0x41,
	B = 0x42,
	C = 0x43,
	D = 0x44,
	E = 0x45,
	F = 0x46,
	G = 0x47,
	H = 0x48,
	I = 0x49,
	J = 0x4A,
	K = 0x4B,
	L = 0x4C,
	M = 0x4D,
	N = 0x4E,
	O = 0x4F,
	P = 0x50,
	Q = 0x51,
	R = 0x52,
	S = 0x53,
	T = 0x54,
	U = 0x55,
	V = 0x56,
	W = 0x57,
	X = 0x58,
	Y = 0x59,
	Z = 0x5a,

	openParen = 0x28,             // (
	closeParen = 0x29,            // )
	exclamationMark = 0x21,       // !
	colon = 0x3A,                 // :
	hashMark = 0x23,              // #

	formFeed = 0x0C,              // \f
	tab = 0x09,                   // \t

  // underscore = 0x5F,            // _

  // doubleQuote = 0x22,           // "
  // dollar = 0x24,                // $
  // percent = 0x25,               // %
  // ampersand = 0x26,             // &
  // singleQuote = 0x27,           // '
  // asterisk = 0x2A,              // *
  // plus = 0x2B,                  // +
  // comma = 0x2C,                 // ,
  // minus = 0x2D,                 // -
  // dot = 0x2E,                   // .
  // slash = 0x2F,                 // /
  // semicolon = 0x3B,             // ;
  // angleBracketOpen = 0x3C,      // <
  // equals = 0x3D,                // =
  // angleBracketClose = 0x3E,     // >
  // questionMark = 0x3F,          // ?
  // at = 0x40,                    // @
  // openBracket = 0x5B,           // [
  // backslash = 0x5C,             // \
  // closeBracket = 0x5D,          // ]
  // circumflex = 0x5E,            // ^
  // graveAccent = 0x60,           // `
  // openBrace = 0x7B,             // {
  // verticalLine = 0x7C,          // |
  // closeBrace = 0x7D,            // }
  // tilde = 0x7E,                 // ~
}