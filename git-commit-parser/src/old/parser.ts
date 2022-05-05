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
export function getRangeForCommitPosition(
  rootNode: Node,
  type: NodeType
): Range {
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
      const searchedForNode = headerNode.children.find(
        (node) => node.type === type
      )
      if (searchedForNode) {
        return searchedForNode.range
      }
    }
    // otherwise get first line
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: Number.MAX_SAFE_INTEGER },
    }
  }
  // generic search
  const searchRecursively = (targetNode: Node): Range | undefined => {
    if (targetNode.type === type) {
      return targetNode.range
    }
    const innerTarget = targetNode.children?.find((node) =>
      searchRecursively(node)
    )
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
      console.log('header begin')
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
      console.log('header end')
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
      console.log('type begin')
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
      console.log('type end')
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
      console.log('scope begin')
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
      console.log('scope end')
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
      console.log('description begin')
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
      console.log('description end')
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
      console.log('body begin')
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
      console.log('body end')
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
      console.log('footer begin')
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
      console.log('footer end')
      currentParent.range = {
        start: currentParent.range.start,
        end: { line: startLine, character: startCharacter },
      }
      currentParent.length = offset + length - currentParent.offset
      currentParent = currentParent.parent!
    },
    onFooterTokenBegin: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      console.log('footer token begin')
      currentParent = onElement({
        type: 'footer-token',
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
    onFooterTokenEnd: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      console.log('footer token end')
      currentParent.range = {
        start: currentParent.range.start,
        end: { line: startLine, character: startCharacter },
      }
      currentParent.length = offset + length - currentParent.offset
      currentParent = currentParent.parent!
    },
    onFooterValueBegin: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      console.log('footer value begin')
      currentParent = onElement({
        type: 'footer-value',
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
    onFooterValueEnd: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => {
      console.log('footer value end')
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
    onCommentBegin(
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) {
      currentParent = onElement({
        type: 'comment',
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

    onCommentEnd(
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) {
      currentParent.range = {
        start: currentParent.range.start,
        end: { line: startLine, character: startCharacter },
      }
      currentParent.length = offset + length - currentParent.offset
      currentParent = currentParent.parent!
    },

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

  // To look ahead when parsing body and footer
  type TransientToken = {
    consume: () => void
    token: SyntaxKind
    offset: number
    length: number
    startLine: number
    startCharacter: number
    value: string
  }
  type TransientFooter = TransientToken[]
  type TransientComment = () => void
  type TransientLine = TransientFooter | TransientComment
  const footersAndComments: TransientLine[] = []

  function toNoArgVisit(
    visitFunction?: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => void
  ): <T extends { transient: false } | { transient: true }>(
    options?: T
  ) => T['transient'] extends true ? () => void : void {
    return (options?): any => {
      if (!visitFunction && options?.transient) {
        return () => {}
      } else if (!visitFunction) {
        return
      }
      const offset = _scanner.getTokenOffset()
      const length = _scanner.getTokenLength()
      const startLine = _scanner.getTokenStartLine()
      const startCharacter = _scanner.getTokenStartCharacter()
      if (options?.transient === true) {
        return () => visitFunction(offset, length, startLine, startCharacter)
      }
      visitFunction(offset, length, startLine, startCharacter)
    }
  }
  function toNoArgVisitWithPath(
    visitFunction?: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number,
      pathSupplier: () => CommitContentPath
    ) => void
  ): <T extends { transient: false } | { transient: true }>(
    options?: T
  ) => T['transient'] extends true ? () => void : void {
    return (options?): any => {
      if (!visitFunction && options?.transient) {
        return () => {}
      } else if (!visitFunction) {
        return
      }
      const offset = _scanner.getTokenOffset()
      const length = _scanner.getTokenLength()
      const startLine = _scanner.getTokenStartLine()
      const startCharacter = _scanner.getTokenStartCharacter()
      const pathSupplier = () => _commitContentPath.slice()
      if (options?.transient === true) {
        return () =>
          visitFunction(offset, length, startLine, startCharacter, pathSupplier)
      }
      visitFunction(offset, length, startLine, startCharacter, pathSupplier)
    }
  }
  function toOneArgVisit<A>(
    visitFunction?: (
      arg: A,
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => void
  ): <T extends { transient: false } | { transient: true }>(
    arg: A,
    options?: T
  ) => T['transient'] extends true ? () => void : void {
    return (arg, options?): any => {
      if (!visitFunction && options?.transient) {
        return () => {}
      } else if (!visitFunction) {
        return
      }
      const offset = _scanner.getTokenOffset()
      const length = _scanner.getTokenLength()
      const startLine = _scanner.getTokenStartLine()
      const startCharacter = _scanner.getTokenStartCharacter()
      if (options?.transient === true) {
        return () =>
          visitFunction(arg, offset, length, startLine, startCharacter)
      }
      visitFunction(arg, offset, length, startLine, startCharacter)
    }
  }
  function toOneArgVisitWithPath<A>(
    visitFunction?: (
      arg: A,
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number,
      pathSupplier: () => CommitContentPath
    ) => void
  ): <T extends { transient: false } | { transient: true }>(
    arg: A,
    options?: T
  ) => T['transient'] extends true ? () => void : void {
    return (arg, options?): any => {
      if (!visitFunction && options?.transient) {
        return () => {}
      } else if (!visitFunction) {
        return
      }
      const offset = _scanner.getTokenOffset()
      const length = _scanner.getTokenLength()
      const startLine = _scanner.getTokenStartLine()
      const startCharacter = _scanner.getTokenStartCharacter()
      const pathSupplier = () => _commitContentPath.slice()
      if (options?.transient === true) {
        return () =>
          visitFunction(
            arg,
            offset,
            length,
            startLine,
            startCharacter,
            pathSupplier
          )
      }
      visitFunction(
        arg,
        offset,
        length,
        startLine,
        startCharacter,
        pathSupplier
      )
    }
  }
  function toCopyFromTokenNoArg(
    visitFunction?: (
      offset: number,
      length: number,
      startLine: number,
      startCharacter: number
    ) => void
  ): (transientToken: TransientToken) => void {
    if (!visitFunction) {
      return () => void 0
    }
    return (transientToken: TransientToken) =>
      visitFunction(
        transientToken.offset,
        transientToken.length,
        transientToken.startLine,
        transientToken.startCharacter
      )
  }

  const onHeaderBegin = toNoArgVisitWithPath(visitor.onHeaderBegin)
  const onHeaderEnd = toNoArgVisit(visitor.onHeaderEnd)
  const onTypeBegin = toNoArgVisitWithPath(visitor.onTypeBegin)
  const onTypeEnd = toNoArgVisitWithPath(visitor.onTypeEnd)
  const onScopeBegin = toNoArgVisitWithPath(visitor.onScopeBegin)
  const onScopeEnd = toNoArgVisitWithPath(visitor.onScopeEnd)
  const onScopeParenOpen = toNoArgVisitWithPath(visitor.onScopeParenOpen)
  const onScopeParenClose = toNoArgVisitWithPath(visitor.onScopeParenClose)
  const onDescriptionBegin = toNoArgVisitWithPath(visitor.onDescriptionBegin)
  const onDescriptionEnd = toNoArgVisitWithPath(visitor.onDescriptionEnd)
  const onBodyBegin = toCopyFromTokenNoArg(visitor.onBodyBegin)
  const onBodyEnd = toCopyFromTokenNoArg(visitor.onBodyEnd)
  const onFooterBegin = toCopyFromTokenNoArg(visitor.onFooterBegin)
  const onFooterEnd = toCopyFromTokenNoArg(visitor.onFooterEnd)
  const onFooterTokenBegin = toCopyFromTokenNoArg(visitor.onFooterTokenBegin)
  const onFooterTokenEnd = toCopyFromTokenNoArg(visitor.onFooterTokenEnd)
  const onFooterValueBegin = toCopyFromTokenNoArg(visitor.onFooterValueBegin)
  const onFooterValueEnd = toCopyFromTokenNoArg(visitor.onFooterValueEnd)
  const onBreakingExclamationMark = toNoArgVisit(
    visitor.onBreakingExclamationMark
  )
  const onHeaderColon = toNoArgVisit(visitor.onHeaderColon)
  const onWordValue = toOneArgVisitWithPath(visitor.onWordValue)
  const onWhitespaceValue = toOneArgVisitWithPath(visitor.onWhitespaceValue)
  const onNumber = toOneArgVisitWithPath(visitor.onNumber)
  const onSymbol = toOneArgVisitWithPath(visitor.onSymbol)
  const onLiteralValue = toOneArgVisitWithPath(visitor.onLiteralValue)
  const onCommentBegin = toNoArgVisit(visitor.onCommentBegin)
  const onCommentEnd = toNoArgVisit(visitor.onCommentEnd)
  const onError = toOneArgVisit(visitor.onError)

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
      return token
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

  function parseWord(): boolean {
    const word = _scanner.getTokenValue()
    onWordValue(word)
    scanNext()
    return true
  }

  function parseWordTransiently(): TransientToken {
    const word = _scanner.getTokenValue()
    const transientToken = {
      consume: onWordValue(word, { transient: true }),
      token: SyntaxKind.WordLiteral,
      value: `word ${word}`,
      offset: _scanner.getTokenOffset(),
      length: _scanner.getTokenLength(),
      startLine: _scanner.getTokenStartLine(),
      startCharacter: _scanner.getTokenStartCharacter(),
    }
    scanNext()
    return transientToken
  }

  function parseWhitespace(): boolean {
    const whitespace = _scanner.getTokenValue()
    onWhitespaceValue(whitespace)
    scanNext()
    return true
  }

  function parseWhitespaceTransiently(): TransientToken {
    const whitespace = _scanner.getTokenValue()
    const transientToken = {
      consume: onWhitespaceValue(whitespace, { transient: true }),
      token: SyntaxKind.WhiteSpace,
      value: `whitespace '${whitespace}'`,
      offset: _scanner.getTokenOffset(),
      length: _scanner.getTokenLength(),
      startLine: _scanner.getTokenStartLine(),
      startCharacter: _scanner.getTokenStartCharacter(),
    }
    scanNext()
    return transientToken
  }

  function parseNumber(): boolean {
    const num = _scanner.getTokenValue()
    onNumber(num)
    scanNext()
    return true
  }

  function parseNumberTransiently(): TransientToken {
    const num = _scanner.getTokenValue()
    const transientToken = {
      consume: onNumber(num, { transient: true }),
      token: SyntaxKind.NumericLiteral,
      value: `num ${num}`,
      offset: _scanner.getTokenOffset(),
      length: _scanner.getTokenLength(),
      startLine: _scanner.getTokenStartLine(),
      startCharacter: _scanner.getTokenStartCharacter(),
    }
    scanNext()
    return transientToken
  }

  function parseSymbol(): boolean {
    const symbol = _scanner.getTokenValue()
    onSymbol(symbol)
    scanNext()
    return true
  }

  function parseSymbolTransiently(): TransientToken {
    const symbol = _scanner.getTokenValue()
    const transientToken = {
      consume: onSymbol(symbol, { transient: true }),
      token: _scanner.getToken(),
      value: `symbol ${symbol}`,
      offset: _scanner.getTokenOffset(),
      length: _scanner.getTokenLength(),
      startLine: _scanner.getTokenStartLine(),
      startCharacter: _scanner.getTokenStartCharacter(),
    }
    scanNext()
    return transientToken
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

  function parseValueTransiently(): TransientToken {
    switch (_scanner.getToken()) {
      case SyntaxKind.WhiteSpace:
        return parseWhitespaceTransiently()
      case SyntaxKind.NumericLiteral:
        return parseNumberTransiently()
      case SyntaxKind.WordLiteral:
        return parseWordTransiently()
      default:
        return parseSymbolTransiently()
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

  function parseComment(): boolean {
    // this method is only called at line beginning
    if (_scanner.getTokenStartCharacter() !== 0) {
      throw new Error(
        `parseComment can only begin at line beginning, not at ${_scanner.getTokenStartCharacter()} chars in`
      )
    }

    if (_scanner.getToken() !== SyntaxKind.CommentStartToken) {
      return false
    }

    const commentVisitor = parseCommentTransiently()
    if (commentVisitor === false) {
      return false
    }

    // instantly consume the comment
    commentVisitor()

    return true
  }

  function parseCommentTransiently(): TransientComment | false {
    // this method is only called at line beginning
    if (_scanner.getTokenStartCharacter() !== 0) {
      throw new Error(
        `parseComment can only begin at line beginning, not at ${_scanner.getTokenStartCharacter()} chars in`
      )
    }

    if (_scanner.getToken() !== SyntaxKind.CommentStartToken) {
      return false
    }

    const transientValues: Pick<TransientToken, 'consume'>[] = []
    const commentBeginner = onCommentBegin({ transient: true })
    transientValues.push({
      consume: () => {
        commentBeginner()
        _commitContentPath.push('comment')
      },
    })
    while (
      _scanner.getToken() !== SyntaxKind.LineBreakToken &&
      _scanner.getToken() !== SyntaxKind.EOF
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
      transientValues.push(parseValueTransiently())
    }
    const commentEnder = onCommentEnd({ transient: true })
    transientValues.push({
      consume: () => {
        commentEnder()
        _commitContentPath.pop()
      },
    })

    return () => {
      transientValues.forEach((transientToken) => transientToken.consume())
    }
  }

  function parseHeader(): boolean {
    // maybe first line is comment
    if (parseComment()) {
      return false
    }

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
    let isBodyDefined = false
    const createBody = (transientToken: TransientToken) => {
      onBodyBegin(transientToken)
      _commitContentPath.push('body')
      isBodyDefined = true
    }
    let isLastNonCommentLineEmpty = false
    let bodyFooterMode: 'none' | 'footer' | 'body' = 'none'
    let lastBodyToken: TransientToken | null = null

    const isLineEmpty = (
      line: TransientLine
    ): 'empty' | 'content' | 'comment' | 'no-line' => {
      if (line === undefined) {
        return 'no-line'
      }
      if (!Array.isArray(line)) {
        return 'comment'
      }
      return line.filter((el) => el.token !== SyntaxKind.WhiteSpace).length ===
        0
        ? 'empty'
        : 'content'
    }
    const isValidFooterStart = (line: TransientLine): boolean => {
      if (line === undefined || !Array.isArray(line)) {
        return false
      }
      // valid footer starts:
      // <word><colon><space><anything>
      // <word><space><hashmark><anything>
      if (line.length < 4) {
        return false
      }
      if (line[0].token !== SyntaxKind.WordLiteral) {
        return false
      }
      if (
        line[1].token === SyntaxKind.ColonToken &&
        line[2].token === SyntaxKind.WhiteSpace
      ) {
        return true
      }
      if (
        line[1].token === SyntaxKind.WhiteSpace &&
        line[2].token === SyntaxKind.HashMarkToken
      ) {
        return true
      }
      return false
    }
    const isValidFooterContinuation = (line: TransientLine): boolean => {
      if (line === undefined || !Array.isArray(line)) {
        return false
      }
      // valid footer continuations:
      // does not contain colon
      return !line.some((el) => el.token === SyntaxKind.ColonToken)
    }

    const evaluateCurrentLineBodyOrFooter = () => {
      const consumeIntoBody = (transientLines: TransientLine[]) => {
        console.log('CONSUMING into body')
        transientLines.reverse()
        const firstToken = (transientLines.at(0) as TransientFooter).at(0)!
        while (transientLines.length > 0) {
          const bodyOrComment = transientLines.pop()
          if (!bodyOrComment) {
            // skip
          } else if (typeof bodyOrComment === 'function') {
            // comment
            bodyOrComment() // consume comment
          } else {
            if (!isBodyDefined) {
              createBody(firstToken)
            }
            // body
            bodyOrComment.forEach((transientToken) => transientToken.consume())
            lastBodyToken = bodyOrComment.at(-1)!
          }
        }
      }

      const currentLine = footersAndComments.at(-1)
      if (!currentLine) {
        throw new Error('cannot evaluate current line')
      }

      const currentLineEmpty = isLineEmpty(currentLine)

      if (currentLineEmpty === 'comment') {
        // nothing - just keep everything the way it is
        console.log(
          '    -> evaluate current line: COMMENT',
          _scanner.getTokenStartLine(),
          _scanner.getTokenValue()
        )
      } else if (currentLineEmpty === 'empty') {
        bodyFooterMode = 'none'
        console.log(
          '    -> evaluate current line: EMPTY',
          _scanner.getTokenStartLine(),
          _scanner.getTokenValue()
        )
      } else if (bodyFooterMode === 'none') {
        // check if we should enter footer mode
        const validFooterStart = isValidFooterStart(currentLine)
        if (validFooterStart && isLastNonCommentLineEmpty) {
          bodyFooterMode = 'footer'
          console.log(
            '    -> evaluate current line: POSSIBLY FOOTER',
            _scanner.getTokenStartLine(),
            _scanner.getTokenValue()
          )
        } else if (!validFooterStart) {
          // body start
          console.log(
            '    -> evaluate current line: BODY (NONE -> INV FOOT)',
            _scanner.getTokenStartLine(),
            _scanner.getTokenValue()
          )
          bodyFooterMode = 'body'
          consumeIntoBody(footersAndComments)
        }
      } else if (
        bodyFooterMode === 'footer' &&
        currentLineEmpty === 'content'
      ) {
        // check if current line is valid footer continuation or valid footer
        const validFooterStart = isValidFooterStart(currentLine)
        const validFooterContinuation = isValidFooterContinuation(currentLine)
        if (!validFooterStart && !validFooterContinuation) {
          console.log(
            '    -> evaluate current line: BODY (FOOT -> INV FOOT)',
            _scanner.getTokenStartLine(),
            _scanner.getTokenValue()
          )
          bodyFooterMode = 'body'
          consumeIntoBody(footersAndComments)
        } else {
          console.log(
            '    -> evaluate current line: POSSIBLY FOOTER',
            _scanner.getTokenStartLine(),
            _scanner.getTokenValue()
          )
        }
      } else if (bodyFooterMode === 'body' && currentLineEmpty === 'content') {
        // we are still in body mode and there is more content
        consumeIntoBody(footersAndComments)
      }

      // let's evaluate at each end of line if we have a body or footer
      // available variables:
      //   * isLastNonCommentLineEmpty
      //   * startsCurrentLineLikeFooterTokenValue
      //   * isCurrentLineValidFooterContinuation -> no colon
      //   * isCurrentComment
      //   * isCurrentLineEmpty
      //   * bodyFooterMode (none, footer, body)
      //
      // situations where we can see we are in body, not footer
      // 1. we are not in footer mode and line with content does not look like footer-token-value
      //   -> !isLastNonCommentLineEmpty || !footer-token-value valid
      // 2. there is a colon, but no token-value before it
      // 3. there are two newlines \n\n, but text does not start with footer-token-value
      // once we are in body, we won't turn to footer until we see \n\n

      if (currentLineEmpty === 'empty' || currentLineEmpty === 'content') {
        isLastNonCommentLineEmpty = currentLineEmpty === 'empty'
      }
    }

    while (_scanner.getToken() !== SyntaxKind.EOF) {
      if (_scanner.getToken() === SyntaxKind.LineBreakToken) {
        scanNext() // consume line break

        evaluateCurrentLineBodyOrFooter()

        const parsedComment = parseCommentTransiently() // try to parse comment from newline on
        if (parsedComment !== false) {
          // TODO: evaluate if last non comment line is empty
          footersAndComments.push(parsedComment)
        } else {
          // this is a footer - create new footer array if empty one does not exist
          const lastFooterOrComment = footersAndComments.at(-1)
          if (
            lastFooterOrComment === undefined ||
            !Array.isArray(lastFooterOrComment) ||
            lastFooterOrComment.length > 0
          ) {
            footersAndComments.push([])
          }
        }
      } else {
        let footer = footersAndComments.at(-1) as TransientFooter
        if (footer === undefined || !Array.isArray(footer)) {
          footer = []
          footersAndComments.push(footer)
        }
        footer.push(parseValueTransiently())
      }
    }

    if (isBodyDefined) {
      onBodyEnd(lastBodyToken!)
      _commitContentPath.pop()
    }

    if (footersAndComments.length > 0) {
      const consumeFooter = (footerLines: TransientLine[]) => {
        const firstTransientToken = (footerLines.at(0) as TransientFooter).at(0)!
        onFooterBegin(firstTransientToken)
        _commitContentPath.push('footer')
        footerLines.forEach((footerLine) => {
          const typeOfLine = isLineEmpty(footerLine)
          if (typeOfLine === 'content' && Array.isArray(footerLine)) {
            const footerStartLine = isValidFooterStart(footerLine)
            if (!footerStartLine) {
              footerLine.forEach((transientToken) => transientToken.consume())
            } else {
              const footerToken = footerLine.at(0)!
              onFooterTokenBegin(footerToken)
              _commitContentPath.push('footer-token')
              footerLine[0].consume()
              onFooterTokenEnd(footerToken)
              _commitContentPath.pop()
              // <colon><space> or <space><hashmark>
              footerLine[1].consume()
              footerLine[2].consume()
              const footerValueBeginToken = footerLine.at(3)!
              onFooterValueBegin(footerValueBeginToken)
              _commitContentPath.push('footer-value')
              footerLine
                .slice(3)
                .forEach((transientToken) => transientToken.consume())
            }
          } else if (
            typeOfLine === 'comment' &&
            typeof footerLine === 'function'
          ) {
            // comment inside continued footer
            footerLine()
          }
        })
        const footerEndToken = (footerLines.at(-1)! as TransientFooter).at(-1)!
        onFooterValueEnd(footerEndToken)
        _commitContentPath.pop()
        onFooterEnd(footerEndToken)
        _commitContentPath.pop()
      }

      // group lines into footers
      let footerStarted = false
      let footerStart = -1
      let footerEnd = -1
      for (let i = 0; i < footersAndComments.length; i++) {
        const footerOrComment = footersAndComments.at(i)!
        const typeOfLine = isLineEmpty(footerOrComment)
        if (
          !footerStarted &&
          typeOfLine !== 'content' &&
          typeof footerOrComment === 'function'
        ) {
          // comment
          footerOrComment() // consume comment
        } else if (!footerStarted && typeOfLine === 'content') {
          // footer start
          footerStarted = true
          footerStart = i
          footerEnd = i
        } else if (footerStarted && typeOfLine === 'content') {
          // new footer or continuation
          const validFooterStart = isValidFooterStart(footerOrComment)
          if (validFooterStart) {
            // new footer
            consumeFooter(footersAndComments.slice(footerStart, footerEnd + 1))
            footerStart = i
            footerEnd = i
          } else {
            // continued footer
            footerEnd = i
          }
        } else if (footerStarted && typeOfLine === 'empty') {
          // footer end
          consumeFooter(footersAndComments.slice(footerStart, footerEnd + 1))
          footerStarted = false
        }
      }
      if (footerStarted) {
        // consume footer which goes on until last line
        consumeFooter(footersAndComments.slice(footerStart, footerEnd + 1))
      } else {
        // consume trailing comments
        footersAndComments.slice(footerEnd + 1).forEach((comment) => {
          if (typeof comment === 'function') {
            comment() // consume comment
          }
        })
      }
    }
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
