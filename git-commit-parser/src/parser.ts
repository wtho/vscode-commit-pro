/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Thomas Wirth.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { createScanner } from './scanner'
import {
  CommitContentPath,
  GitCommitVisitor,
  Location,
  Node,
  NodeType,
  ParseError,
  ParseErrorCode,
  ParseOptions,
  Range,
  ScanError,
  Segment,
  SyntaxKind,
} from './main'

namespace ParseOptions {
  export const DEFAULT = {
    allowTrailingComma: false,
  }
}

interface NodeImpl extends Node {
  type: NodeType
  offset: number
  length: number
  range: Range
  parent?: NodeImpl
  children?: NodeImpl[]
  value?: any
}

/**
 * For a given offset, evaluate the location in the git commit message. Each segment in the location path is either a property name or an array index.
 */
export function getLocation(text: string, position: number): Location {
  const segments: Segment[] = []
  const earlyReturnException = new Object()
  let previousNode: NodeImpl | undefined = undefined
  const previousNodeInst: NodeImpl = {
    value: {},
    offset: 0,
    length: 0,
    type: 'message',
    parent: undefined,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
  }
  function setPreviousNode(
    value: string,
    offset: number,
    length: number,
    type: NodeType
  ) {
    previousNodeInst.value = value
    previousNodeInst.offset = offset
    previousNodeInst.length = length
    previousNodeInst.type = type
    previousNode = previousNodeInst
  }
  try {
    visit(text, {
      onHeaderBegin: (offset: number, length: number) => {
        if (position < offset) {
          throw earlyReturnException
        }
        previousNode = undefined
        segments.push('header')
      },
      onHeaderEnd: (offset: number, length: number) => {
        if (position <= offset) {
          throw earlyReturnException
        }
        previousNode = undefined
        segments.pop()
      },
      onTypeBegin: (offset: number, length: number) => {
        if (position < offset) {
          throw earlyReturnException
        }
        previousNode = undefined
        segments.push('type')
      },
      onLiteralValue: (value: any, offset: number, length: number) => {
        if (position < offset) {
          throw earlyReturnException
        }
        setPreviousNode(value, offset, length, getLiteralNodeType(value))

        if (position <= offset + length) {
          throw earlyReturnException
        }
      },
    })
  } catch (e) {
    if (e !== earlyReturnException) {
      throw e
    }
  }

  return {
    path: segments,
    previousNode,
    matches: (pattern: Segment[]) => {
      let k = 0
      for (let i = 0; k < pattern.length && i < segments.length; i++) {
        if (pattern[k] === segments[i] || pattern[k] === '*') {
          k++
        } else if (pattern[k] !== '**') {
          return false
        }
      }
      return k === pattern.length
    },
  }
}

/** Returns the position of the first node of a type in the AST */
export function getRangeForCommitPosition(rootNode: Node, type: NodeType): Range {
  if (['header', 'body', 'footer'].includes(type)) {
    // smart search for whole body
    const sectionNode = rootNode.children?.find((node) => node.type === type)
    // TODO: multiple footers possible!
    if (sectionNode) {
      return sectionNode.range
    }
  }
  if (['type', 'scope', 'description'].includes(type)) {
    // smart search in header
    const headerNode = rootNode.children?.find((node) => node.type === 'header')
    if (headerNode && headerNode.children?.length) {
      const searchedForNode = headerNode.children.find((node) => node.type === type)
      if (searchedForNode) {
        return searchedForNode.range
      }
    }
  }
  // generic search
  const searchRecursively = (targetNode: Node): Range | undefined => {
    if (targetNode.type === type) {
      return targetNode.range
    }
    const innerTarget = targetNode.children?.find((node) => searchRecursively(node))
    if (innerTarget) {
      return innerTarget.range
    }
    return undefined
  }
  const result = searchRecursively(rootNode)
  if (result) {
    return result
  }
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  }
}

/**
 * Parses the given text and returns the object the git commit content represents. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 * Therefore always check the errors list to find out if the input was valid.
 */
// export function parse(text: string, errors: ParseError[] = [], options: ParseOptions = ParseOptions.DEFAULT): any {
// 	let currentParent: any = [];
// 	const previousParents: any[] = [];

// 	function onValue(value: any) {
// 		if (Array.isArray(currentParent)) {
// 			(<any[]>currentParent).push(value);
// 		} else if (currentProperty !== null) {
// 			currentParent[currentProperty] = value;
// 		}
// 	}

// 	const visitor: GitCommitVisitor = {
// 		onObjectBegin: () => {
// 			const object = {};
// 			onValue(object);
// 			previousParents.push(currentParent);
// 			currentParent = object;
// 			currentProperty = null;
// 		},
// 		onObjectProperty: (name: string) => {
// 			currentProperty = name;
// 		},
// 		onObjectEnd: () => {
// 			currentParent = previousParents.pop();
// 		},
// 		onArrayBegin: () => {
// 			const array: any[] = [];
// 			onValue(array);
// 			previousParents.push(currentParent);
// 			currentParent = array;
// 			currentProperty = null;
// 		},
// 		onArrayEnd: () => {
// 			currentParent = previousParents.pop();
// 		},
// 		onLiteralValue: onValue,
// 		onError: (error: ParseErrorCode, offset: number, length: number) => {
// 			errors.push({ error, offset, length });
// 		}
// 	};
// 	visit(text, visitor, options);
// 	return currentParent[0];
// }

/**
 * Parses the given text and returns a tree representation the git commit content. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 */
export function parseTree(
  text: string,
  errors: ParseError[] = [],
  options: ParseOptions = ParseOptions.DEFAULT
): Node | undefined {
  let currentParent: NodeImpl = {
    type: 'message',
    offset: 0,
    length: text.length,
    children: [],
    parent: undefined,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
  } // root

  function onElement(valueNode: Node): Node {
    currentParent.children!.push(valueNode)
    return valueNode
  }

  const visitor: GitCommitVisitor = {
    // onObjectBegin: (offset: number) => {
    // 	currentParent = onElement({ type: 'object', offset, length: -1, parent: currentParent, children: [] });
    // },
    // onObjectProperty: (name: string, offset: number, length: number) => {
    // 	currentParent = onElement({ type: 'property', offset, length: -1, parent: currentParent, children: [] });
    // 	currentParent.children!.push({ type: 'string', value: name, offset, length, parent: currentParent });
    // },
    // onObjectEnd: (offset: number, length: number) => {
    // 	ensurePropertyComplete(offset + length); // in case of a missing value for a property: make sure property is complete

    // 	currentParent.length = offset + length - currentParent.offset;
    // 	currentParent = currentParent.parent!;
    // 	ensurePropertyComplete(offset + length);
    // },
    // onArrayBegin: (offset: number, length: number) => {
    // 	currentParent = onElement({ type: 'array', offset, length: -1, parent: currentParent, children: [] });
    // },
    // onArrayEnd: (offset: number, length: number) => {
    // 	currentParent.length = offset + length - currentParent.offset;
    // 	currentParent = currentParent.parent!;
    // 	ensurePropertyComplete(offset + length);
    // },
    // onLiteralValue: (value: any, offset: number, length: number) => {
    // 	onElement({ type: getNodeType(value), offset, length, parent: currentParent, value });
    // 	ensurePropertyComplete(offset + length);
    // },

    onHeaderBegin: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter
    ) => {
      currentParent = onElement({
        type: 'header',
        offset,
        length: -1,
        parent: currentParent,
        children: [],
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: 0, character: 0 },
        },
      })
    },
    onHeaderEnd: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      // ensurePropertyComplete(offset + length); // in case of a missing value for a property: make sure property is complete
      currentParent.range = {
        start: currentParent.range.start,
        end: { line: startLine, character: startCharacter },
      }
      currentParent.length = offset + length - currentParent.offset
      currentParent = currentParent.parent!
      // ensurePropertyComplete(offset + length);
      // TODO: maybe ensureDescriptionComplete ?
    },
    onTypeBegin: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number,
      pathSupplier: () => CommitContentPath
    ) => {
      currentParent = onElement({
        type: 'type',
        offset,
        length: -1,
        parent: currentParent,
        children: [],
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: 0, character: 0 },
        },
      })
    },
    onTypeEnd: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      currentParent.range = {
        start: currentParent.range.start,
        end: { line: startLine, character: startCharacter },
      }
      currentParent.length = offset + currentParent.offset
      currentParent = currentParent.parent!
    },
    onScopeParenOpen: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      onElement({
        type: 'scope-paren-open',
        offset,
        length,
        parent: currentParent,
        value: '(',
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: startLine, character: startCharacter + 1 },
        },
      })
    },
    onScopeParenClose: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      onElement({
        type: 'scope-paren-close',
        offset,
        length,
        parent: currentParent,
        value: ')',
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: startLine, character: startCharacter + 1 },
        },
      })
    },
    onScopeBegin: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number,
      pathSupplier: () => CommitContentPath
    ) => {
      currentParent = onElement({
        type: 'scope',
        offset,
        length: -1,
        parent: currentParent,
        children: [],
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: 0, character: 0 },
        },
      })
    },
    onScopeEnd: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      currentParent.range = {
        start: currentParent.range.start,
        end: { line: startLine, character: startCharacter },
      }
      currentParent.length = offset + length - currentParent.offset
      currentParent = currentParent.parent!
    },
    onDescriptionBegin: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number,
      pathSupplier: () => CommitContentPath
    ) => {
      currentParent = onElement({
        type: 'description',
        offset,
        length: -1,
        parent: currentParent,
        children: [],
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: 0, character: 0 },
        },
      })
    },
    onDescriptionEnd: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      currentParent.range = {
        start: currentParent.range.start,
        end: { line: startLine, character: startCharacter },
      }
      currentParent.length = offset + length - currentParent.offset
      currentParent = currentParent.parent!
    },
    onBodyBegin: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      currentParent = onElement({
        type: 'body',
        offset,
        length: -1,
        parent: currentParent,
        children: [],
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: 0, character: 0 },
        },
      })
    },
    onBodyEnd: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      currentParent.range = {
        start: currentParent.range.start,
        end: { line: startLine, character: startCharacter },
      }
      currentParent.length = offset + length - currentParent.offset
      currentParent = currentParent.parent!
    },
    onFooterBegin: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      currentParent = onElement({
        type: 'footer',
        offset,
        length: -1,
        parent: currentParent,
        children: [],
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: 0, character: 0 },
        },
      })
    },
    onFooterEnd: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      currentParent.range = {
        start: currentParent.range.start,
        end: { line: startLine, character: startCharacter },
      }
      currentParent.length = offset + length - currentParent.offset
      currentParent = currentParent.parent!
    },
    onWordValue: (
      value: string,
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      onElement({
        type: 'word',
        offset,
        length,
        parent: currentParent,
        value,
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: startLine, character: startCharacter + value.length },
        },
      })
      // if (!currentParent.value) {
      //   currentParent.value = value
      // } else {
      //   currentParent.value += value;
      // }
    },
    onWhitespaceValue: (
      value: string,
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      onElement({
        type: 'whitespace',
        offset,
        length,
        parent: currentParent,
        value,
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: startLine, character: startCharacter + value.length },
        },
      })
      // if (!currentParent.value) {
      //   currentParent.value = value
      // } else {
      //   currentParent.value += value;
      // }
    },
    onBreakingExclamationMark(
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) {
      if (currentParent.type !== 'header') {
        throw new Error('Unexpected breaking exclamation mark')
      }
      onElement({
        type: 'breaking-exclamation-mark',
        offset,
        length,
        parent: currentParent,
        value: '!',
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: startLine, character: startCharacter + 1 },
        },
      })
    },
    onNumber(
      value: string,
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) {
      onElement({
        type: 'number',
        offset,
        length,
        parent: currentParent,
        value,
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: startLine, character: startCharacter + value.length },
        },
      })
      // if (!currentParent.value) {
      //   currentParent.value = value
      // } else {
      //   currentParent.value += value;
      // }
    },
    onSymbol(
      value: string,
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) {
      onElement({
        type: 'symbol',
        offset,
        length,
        parent: currentParent,
        value,
        range: {
          start: { line: startLine, character: startCharacter },
          end: { line: startLine, character: startCharacter + value.length },
        },
      })
      // if (!currentParent.value) {
      //   currentParent.value = value
      // } else {
      //   currentParent.value += value;
      // }
    },
    onComment(
      value: string,
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) {},

    onError: (
      error: ParseErrorCode,
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      errors.push({ error, offset, length })
    },
  }
  visit(text, visitor, options)

  return currentParent
}

/**
 * Finds the node at the given path in a git commit message.
 */
// export function findNodeAtLocation(root: Node | undefined, path: CommitContentPath): Node | undefined {
// 	if (!root) {
// 		return undefined;
// 	}
// 	let node = root;
// 	for (let segment of path) {
// 		if (typeof segment === 'string') {
// 			if (node.type !== 'object' || !Array.isArray(node.children)) {
// 				return undefined;
// 			}
// 			let found = false;
// 			for (const propertyNode of node.children) {
// 				if (Array.isArray(propertyNode.children) && propertyNode.children[0].value === segment && propertyNode.children.length === 2) {
// 					node = propertyNode.children[1];
// 					found = true;
// 					break;
// 				}
// 			}
// 			if (!found) {
// 				return undefined;
// 			}
// 		} else {
// 			const index = <number>segment;
// 			if (node.type !== 'array' || index < 0 || !Array.isArray(node.children) || index >= node.children.length) {
// 				return undefined;
// 			}
// 			node = node.children[index];
// 		}
// 	}
// 	return node;
// }

/**
 * Gets the path of the given git commit message node
 */
// export function getNodePath(node: Node): CommitContentPath {
// 	if (!node.parent || !node.parent.children) {
// 		return [];
// 	}
// 	const path = getNodePath(node.parent);
// 	if (node.parent.type === 'property') {
// 		const key = node.parent.children[0].value;
// 		path.push(key);
// 	} else if (node.parent.type === 'array') {
// 		const index = node.parent.children.indexOf(node);
// 		if (index !== -1) {
// 			path.push(index);
// 		}
// 	}
// 	return path;
// }

/**
 * Evaluates the JavaScript object of the given git commit message node
 */
// export function getNodeValue(node: Node): any {
// 	switch (node.type) {
// 		case 'array':
// 			return node.children!.map(getNodeValue);
// 		case 'object':
// 			const obj = Object.create(null);
// 			for (let prop of node.children!) {
// 				const valueNode = prop.children![1];
// 				if (valueNode) {
// 					obj[prop.children![0].value] = getNodeValue(valueNode);
// 				}
// 			}
// 			return obj;
// 		case 'null':
// 		case 'string':
// 		case 'number':
// 		case 'boolean':
// 			return node.value;
// 		default:
// 			return undefined;
// 	}

// }

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

/**
 * Finds the most inner node at the given offset. If includeRightBound is set, also finds nodes that end at the given offset.
 */
export function findNodeAtOffset(
  node: Node,
  offset: number,
  includeRightBound = false
): Node | undefined {
  if (contains(node, offset, includeRightBound)) {
    const children = node.children
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

/**
 * Parses the given text and invokes the visitor functions for each object, array and literal reached.
 */
export function visit(
  text: string,
  visitor: GitCommitVisitor,
  options: ParseOptions = ParseOptions.DEFAULT
): any {
  const _scanner = createScanner(text)
  // Important: Only pass copies of this to visitor functions to prevent accidental modification, and
  // to not affect visitor functions which stored a reference to a previous CommitContentPath
  const _commitContentPath: CommitContentPath = []

  function toNoArgVisit(
    visitFunction?: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => void
  ): () => void {
    return visitFunction
      ? () =>
          visitFunction(
            _scanner.getTokenOffset(),
            _scanner.getTokenLength(),
            _scanner.getTokenStartLine(),
            _scanner.getTokenStartCharacter()
          )
      : () => true
  }
  function toNoArgVisitWithPath(
    visitFunction?: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number,
      pathSupplier: () => CommitContentPath
    ) => void
  ): () => void {
    return visitFunction
      ? () =>
          visitFunction(
            _scanner.getTokenOffset(),
            _scanner.getTokenLength(),
            _scanner.getTokenStartLine(),
            _scanner.getTokenStartCharacter(),
            () => _commitContentPath.slice()
          )
      : () => true
  }
  function toOneArgVisit<T>(
    visitFunction?: (
      arg: T,
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => void
  ): (arg: T) => void {
    return visitFunction
      ? (arg: T) =>
          visitFunction(
            arg,
            _scanner.getTokenOffset(),
            _scanner.getTokenLength(),
            _scanner.getTokenStartLine(),
            _scanner.getTokenStartCharacter()
          )
      : () => true
  }
  function toOneArgVisitWithPath<T>(
    visitFunction?: (
      arg: T,
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number,
      pathSupplier: () => CommitContentPath
    ) => void
  ): (arg: T) => void {
    return visitFunction
      ? (arg: T) =>
          visitFunction(
            arg,
            _scanner.getTokenOffset(),
            _scanner.getTokenLength(),
            _scanner.getTokenStartLine(),
            _scanner.getTokenStartCharacter(),
            () => _commitContentPath.slice()
          )
      : () => true
  }

  const onHeaderBegin = toNoArgVisitWithPath(visitor.onHeaderBegin),
    onHeaderEnd = toNoArgVisit(visitor.onHeaderEnd),
    onTypeBegin = toNoArgVisitWithPath(visitor.onTypeBegin),
    onTypeEnd = toNoArgVisitWithPath(visitor.onTypeEnd),
    onScopeBegin = toNoArgVisitWithPath(visitor.onScopeBegin),
    onScopeEnd = toNoArgVisitWithPath(visitor.onScopeEnd),
    onScopeParenOpen = toNoArgVisitWithPath(visitor.onScopeParenOpen),
    onScopeParenClose = toNoArgVisitWithPath(visitor.onScopeParenClose),
    onDescriptionBegin = toNoArgVisitWithPath(visitor.onDescriptionBegin),
    onDescriptionEnd = toNoArgVisitWithPath(visitor.onDescriptionEnd),
    onBodyBegin = toNoArgVisitWithPath(visitor.onBodyBegin),
    onBodyEnd = toNoArgVisitWithPath(visitor.onBodyEnd),
    onFooterBegin = toNoArgVisitWithPath(visitor.onFooterBegin),
    onFooterEnd = toNoArgVisitWithPath(visitor.onFooterEnd),
    onBreakingExclamationMark = toNoArgVisit(visitor.onBreakingExclamationMark),
    onHeaderColon = toNoArgVisit(visitor.onHeaderColon),
    onWordValue = toOneArgVisitWithPath(visitor.onWordValue),
    onWhitespaceValue = toOneArgVisitWithPath(visitor.onWhitespaceValue),
    onNumber = toOneArgVisitWithPath(visitor.onNumber),
    onSymbol = toOneArgVisitWithPath(visitor.onSymbol),
    onLiteralValue = toOneArgVisitWithPath(visitor.onLiteralValue),
    onComment = toOneArgVisit(visitor.onComment),
    onError = toOneArgVisit(visitor.onError)

  function scanNext(): SyntaxKind {
    while (true) {
      const token = _scanner.scan()
      switch (_scanner.getTokenError()) {
        case ScanError.InvalidUnicode:
          handleError(ParseErrorCode.InvalidUnicode)
          break
        case ScanError.InvalidCharacter:
          handleError(ParseErrorCode.InvalidCharacter)
          break
      }
      switch (token) {
        case SyntaxKind.Comment:
          const value = _scanner.getTokenValue()
          onComment(value)
          break
        // case SyntaxKind.Symbol:
        // 	handleError(ParseErrorCode.InvalidSymbol);
        // 	break;
        default:
          return token
      }
    }
  }

  function handleError(
    error: ParseErrorCode,
    skipUntilAfter: SyntaxKind[] = [],
    skipUntil: SyntaxKind[] = []
  ): void {
    onError(error)
    if (skipUntilAfter.length + skipUntil.length > 0) {
      let token = _scanner.getToken()
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

  // function parseString(isValue: boolean): boolean {
  // 	const value = _scanner.getTokenValue();
  // 	if (isValue) {
  // 		onLiteralValue(value);
  // 	} else {
  // 		onObjectProperty(value);
  // 		// add property name afterwards
  // 		_commitContentPath.push(value);
  // 	}
  // 	scanNext();
  // 	return true;
  // }

  // function parseLiteral(): boolean {
  // 	switch (_scanner.getToken()) {
  // 		case SyntaxKind.NumericLiteral:
  // 			const tokenValue = _scanner.getTokenValue();
  // 			let value = Number(tokenValue);

  // 			if (isNaN(value)) {
  // 				handleError(ParseErrorCode.InvalidNumberFormat);
  // 				value = 0;
  // 			}

  // 			onLiteralValue(value);
  // 			break;
  // 		case SyntaxKind.NullKeyword:
  // 			onLiteralValue(null);
  // 			break;
  // 		case SyntaxKind.TrueKeyword:
  // 			onLiteralValue(true);
  // 			break;
  // 		case SyntaxKind.FalseKeyword:
  // 			onLiteralValue(false);
  // 			break;
  // 		default:
  // 			return false;
  // 	}
  // 	scanNext();
  // 	return true;
  // }

  // function parseProperty(): boolean {
  // 	if (_scanner.getToken() !== SyntaxKind.StringLiteral) {
  // 		handleError(ParseErrorCode.PropertyNameExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
  // 		return false;
  // 	}
  // 	parseString(false);
  // 	if (_scanner.getToken() === SyntaxKind.ColonToken) {
  // 		onSeparator(':');
  // 		scanNext(); // consume colon

  // 		if (!parseValue()) {
  // 			handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
  // 		}
  // 	} else {
  // 		handleError(ParseErrorCode.ColonExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
  // 	}
  // 	_commitContentPath.pop(); // remove processed property name
  // 	return true;
  // }

  // function parseObject(): boolean {
  // 	onObjectBegin();
  // 	scanNext(); // consume open brace

  // 	let needsComma = false;
  // 	while (_scanner.getToken() !== SyntaxKind.CloseBraceToken && _scanner.getToken() !== SyntaxKind.EOF) {
  // 		if (_scanner.getToken() === SyntaxKind.CommaToken) {
  // 			if (!needsComma) {
  // 				handleError(ParseErrorCode.ValueExpected, [], []);
  // 			}
  // 			onSeparator(',');
  // 			scanNext(); // consume comma
  // 			if (_scanner.getToken() === SyntaxKind.CloseBraceToken && allowTrailingComma) {
  // 				break;
  // 			}
  // 		} else if (needsComma) {
  // 			handleError(ParseErrorCode.CommaExpected, [], []);
  // 		}
  // 		if (!parseProperty()) {
  // 			handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
  // 		}
  // 		needsComma = true;
  // 	}
  // 	onObjectEnd();
  // 	if (_scanner.getToken() !== SyntaxKind.CloseBraceToken) {
  // 		handleError(ParseErrorCode.CloseParenExpected, [SyntaxKind.CloseBraceToken], []);
  // 	} else {
  // 		scanNext(); // consume close brace
  // 	}
  // 	return true;
  // }

  // function parseArray(): boolean {
  // 	onArrayBegin();
  // 	scanNext(); // consume open bracket
  // 	let isFirstElement = true;

  // 	let needsComma = false;
  // 	while (_scanner.getToken() !== SyntaxKind.CloseParenToken && _scanner.getToken() !== SyntaxKind.EOF) {
  // 		if (_scanner.getToken() === SyntaxKind.CommaToken) {
  // 			if (!needsComma) {
  // 				handleError(ParseErrorCode.ValueExpected, [], []);
  // 			}
  // 			onSeparator(',');
  // 			scanNext(); // consume comma
  // 			if (_scanner.getToken() === SyntaxKind.CloseParenToken && allowTrailingComma) {
  // 				break;
  // 			}
  // 		} else if (needsComma) {
  // 			handleError(ParseErrorCode.CommaExpected, [], []);
  // 		}
  // 		if (isFirstElement) {
  // 			_commitContentPath.push(0);
  // 			isFirstElement = false;
  // 		} else {
  // 			(_commitContentPath[_commitContentPath.length - 1] as number)++;
  // 		}
  // 		if (!parseValue()) {
  // 			handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseParenToken, SyntaxKind.CommaToken]);
  // 		}
  // 		needsComma = true;
  // 	}
  // 	onArrayEnd();
  // 	if (!isFirstElement) {
  // 		_commitContentPath.pop(); // remove array index
  // 	}
  // 	if (_scanner.getToken() !== SyntaxKind.CloseParenToken) {
  // 		handleError(ParseErrorCode.CloseBracketExpected, [SyntaxKind.CloseParenToken], []);
  // 	} else {
  // 		scanNext(); // consume close bracket
  // 	}
  // 	return true;
  // }

  function parseWord(): boolean {
    const word = _scanner.getTokenValue()
    onWordValue(word)
    scanNext()
    return true
  }

  function parseWhitespace(): boolean {
    const word = _scanner.getTokenValue()
    onWhitespaceValue(word)
    scanNext()
    return true
  }

  function parseNumber(): boolean {
    const word = _scanner.getTokenValue()
    onNumber(word)
    scanNext()
    return true
  }

  function parseSymbol(): boolean {
    const symbol = _scanner.getTokenValue()
    onSymbol(symbol)
    scanNext()
    return true
  }

  function parseValue(): boolean {
    switch (_scanner.getToken()) {
      case SyntaxKind.WhiteSpace:
        return parseWhitespace()
      case SyntaxKind.NumericLiteral:
        return parseNumber()
      case SyntaxKind.WordLiteral:
        return parseWord()
      default:
        return parseSymbol()
    }
  }

  function parseBreakingExclamationMark(): boolean {
    if (_scanner.getToken() === SyntaxKind.ExclamationMarkToken) {
      onBreakingExclamationMark()
      scanNext()
      return true
    }
    return false
  }

  function parseHeaderColon(): boolean {
    if (_scanner.getToken() === SyntaxKind.ColonToken) {
      onHeaderColon()
      scanNext()
      if (_scanner.getToken() === SyntaxKind.WhiteSpace) {
        scanNext()
      }
      return true
    }
    return false
  }

  function parseHeader(): boolean {
    onHeaderBegin()
    _commitContentPath.push('header')
    onTypeBegin()
    _commitContentPath.push('type')
    while (
      _scanner.getToken() !== SyntaxKind.ExclamationMarkToken &&
      _scanner.getToken() !== SyntaxKind.ColonToken &&
      _scanner.getToken() !== SyntaxKind.OpenParenToken &&
      _scanner.getToken() !== SyntaxKind.EOF
    ) {
      if (!parseValue()) {
        // TODO: should not contain whitespace
        // TODO: should only contain single word
        // TODO: should not contain symbols
        handleError(
          ParseErrorCode.ValueExpected,
          [],
          [
            SyntaxKind.ExclamationMarkToken,
            SyntaxKind.ColonToken,
            SyntaxKind.OpenParenToken,
          ]
        )
      }
    }
    onTypeEnd()
    _commitContentPath.pop()
    if (_scanner.getToken() === SyntaxKind.OpenParenToken) {
      onScopeParenOpen()
      scanNext()
      onScopeBegin()
      _commitContentPath.push('scope')
      while (
        _scanner.getToken() !== SyntaxKind.ColonToken &&
        _scanner.getToken() !== SyntaxKind.CloseParenToken &&
        _scanner.getToken() !== SyntaxKind.EOF
      ) {
        if (!parseValue()) {
          handleError(
            ParseErrorCode.ValueExpected,
            [],
            [SyntaxKind.ColonToken, SyntaxKind.CloseParenToken]
          )
        }
      }
      if (_scanner.getToken() !== SyntaxKind.CloseParenToken) {
        handleError(ParseErrorCode.CloseParenExpected, [], [])
      }
      onScopeEnd()
      _commitContentPath.pop()
      if (_scanner.getToken() === SyntaxKind.CloseParenToken) {
        onScopeParenClose()
        scanNext()
      }
    }
    while (
      _scanner.getToken() !== SyntaxKind.ExclamationMarkToken &&
      _scanner.getToken() !== SyntaxKind.ColonToken &&
      _scanner.getToken() !== SyntaxKind.EOF
    ) {
      // TODO: error?
      parseValue()
    }
    if (_scanner.getToken() === SyntaxKind.ExclamationMarkToken) {
      parseBreakingExclamationMark()
    }
    while (
      _scanner.getToken() !== SyntaxKind.ColonToken &&
      _scanner.getToken() !== SyntaxKind.EOF
    ) {
      // TODO: error?
      parseValue()
    }
    if (_scanner.getToken() === SyntaxKind.ColonToken) {
      parseHeaderColon()
    }
    onDescriptionBegin()
    _commitContentPath.push('description')
    while (
      _scanner.getToken() !== SyntaxKind.LineBreakToken &&
      _scanner.getToken() !== SyntaxKind.EOF
    ) {
      parseValue()
    }
    onDescriptionEnd()
    _commitContentPath.pop()
    onHeaderEnd()
    _commitContentPath.pop()
    return true
  }

  function parseBodyAndFooter(): boolean {
    while (_scanner.getToken() === SyntaxKind.LineBreakToken) {
      scanNext()
    }
    if (_scanner.getToken() === SyntaxKind.EOF) {
      return true
    }
    onBodyBegin()
    _commitContentPath.push('body')
    while (_scanner.getToken() !== SyntaxKind.EOF) {
      parseValue()
    }
    onBodyEnd()
    _commitContentPath.pop()
    return true
  }

  // here the actual scanning happens
  // 1.: check if file is empty
  scanNext()
  if (_scanner.getToken() === SyntaxKind.EOF) {
    handleError(ParseErrorCode.ValueExpected, [], [])
    return false
  }
  // 2.: parse header
  if (!parseHeader()) {
    handleError(ParseErrorCode.ValueExpected, [], [])
    return false
  }
  // 3.: parse body and footer
  parseBodyAndFooter()
  // 5.: check file ends with EOF
  if (_scanner.getToken() !== SyntaxKind.EOF) {
    handleError(ParseErrorCode.EndOfFileExpected, [], [])
  }
  return true
}

export function getLiteralNodeType(value: any): NodeType {
  if (
    typeof value === 'string' &&
    (value === 'BREAKING CHANGE' || value === 'BREAKING-CHANGE')
  ) {
    return 'breaking-change-literal'
  }
  throw new Error('Unknown literal node type')
}
