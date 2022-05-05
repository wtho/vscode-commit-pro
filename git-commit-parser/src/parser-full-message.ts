import {
  ParseOptions,
  InnerNode,
  ParseError,
  DEFAULT_PARSE_OPTIONS,
  NodeType,
  Range,
  Position,
  Node,
  ValueNode,
  NodeValueType,
  getStringContentOfNode,
} from './parser'
import {
  LineWiseInnerNode,
  LineWiseNode,
  LineWiseValueNode,
} from './parser-line-wise'

export interface MutRange extends Range {
  start: Position
  end: Position
}

interface MutNode extends InnerNode {
  type: NodeType
  offset: number
  length: number
  range: MutRange
  parent: MutNode | undefined
  children: (MutNode | ValueNode<NodeValueType>)[]
}

export function parseTreeFullMessage(
  lineWiseRoot: LineWiseNode | undefined,
  options: ParseOptions = DEFAULT_PARSE_OPTIONS
): { root: Node | undefined; errors: ParseError[] } {
  if (lineWiseRoot === undefined) {
    return { root: undefined, errors: [] }
  }

  if (lineWiseRoot.type !== 'message') {
    throw new Error(
      `Expected root to be of type 'message', got ${lineWiseRoot.type}`
    )
  }

  const errors: ParseError[] = []

  const root: MutNode = {
    ...lineWiseRoot,
    type: 'message',
    parent: undefined,
    children: [],
  }

  const inputLines =
    ('children' in lineWiseRoot ? lineWiseRoot.children : []) ?? []
  if (inputLines.length === 0) {
    return { root, errors }
  }

  const throwIfIllegalLineTypeEncountered = (node: LineWiseNode): Node => {
    if (node.type === 'line') {
      throw new Error(`Illegal node type 'line' encountered at ${node.offset}`)
    }
    if ('children' in node && node.children && node.children.length > 0) {
      node.children.forEach((child) => throwIfIllegalLineTypeEncountered(child))
    }
    return node as Node
  }

  // transform all lines - start with header / comment
  const header = inputLines.at(0)!
  // if strict mode, we have to check if header is valid
  // and make type to description if there is no valid
  if (options.strict) {
    if (header.type !== 'header') {
      throw new Error('Expected header to be of type "header"')
    }
    if (!('children' in header) || header.children.length === 0) {
      throw new Error('Expected header to have children')
    }
    const lastHeaderChild = header.children.at(-1)!
    const hasDescription = lastHeaderChild.type === 'description' && lastHeaderChild.length > 0

    if (!hasDescription) {
      // inavlid header - make it a description
      const content = getStringContentOfNode(header)
      header.children = [
        {
          type: 'description',
          length: content.length,
          offset: 0,
          parent: header,
          children: [],
          range: {
            start: {
              ...header.range.start,
            },
            end: {
              ...header.range.end,
            },
          },
        },
      ]
    }
  }
  root.children.push(throwIfIllegalLineTypeEncountered(header))

  // task: find last line of body. notes:
  // * if footer-continuation does not follow footer-start (comments ignored), it is a body
  // * first footer-start has to follow an empty line (comments ignored)
  // types of lines: header, comment, empty, footer-start, footer-continuation, non-footer-content
  const lineAnalysis: (
    | 'header'
    | 'comment'
    | 'empty'
    | 'footer-start'
    | 'footer-start-end'
    | 'footer-continuation'
    | 'footer-end'
    | 'non-footer-content'
  )[] = new Array(inputLines.length)

  let body: { start: number; end: number } | undefined
  let lastNonCommentLine: typeof lineAnalysis[number] = 'header'
  let lastNonCommentIdx = 0

  lineAnalysis[0] = 'header'
  for (let i = 1; i < inputLines.length; i++) {
    const previousLineType = lineAnalysis.at(i - 1)!
    if (previousLineType !== 'comment') {
      lastNonCommentLine = previousLineType
      lastNonCommentIdx = i - 1
    }

    const commentOrLine = inputLines.at(i)!
    if (commentOrLine.type === 'comment') {
      lineAnalysis[i] = 'comment'
      continue
    } else if (commentOrLine.type !== 'line') {
      throw new Error(
        `Line analysis: Expected line to be of type 'line', got ${commentOrLine.type} (at line ${commentOrLine.range.start.line})`
      )
    }
    const line = commentOrLine as LineWiseInnerNode
    const lineNodes = line.children
    // check for empty (only whitespace)
    if (lineNodes.every((node) => node.type === 'whitespace')) {
      lineAnalysis[i] = 'empty'
      continue
    }
    // check for footer start
    const lastNonCommentLineEmptyOrFooter =
      lastNonCommentLine === 'empty' ||
      lastNonCommentLine === 'footer-start-end' ||
      lastNonCommentLine === 'footer-end'
    if (
      lastNonCommentLineEmptyOrFooter &&
      lineNodes.length > 2 &&
      (lineNodes.at(0)!.type === 'word' ||
        lineNodes.at(0)!.type === 'breaking-change-literal')
    ) {
      const secondNode = lineNodes.at(1)! as LineWiseValueNode<NodeValueType>
      const thirdNode = lineNodes.at(2)! as LineWiseValueNode<NodeValueType>
      if (
        lineNodes.length > 3 &&
        secondNode.type === 'punctuation' &&
        secondNode.value === ':' &&
        thirdNode.type === 'whitespace'
      ) {
        // <word><colon><space><text>
        lineAnalysis[i] = 'footer-start-end'
        continue
      }
      if (
        lineNodes.length > 3 &&
        secondNode.type === 'whitespace' &&
        thirdNode.type === 'punctuation' &&
        thirdNode.value === '#'
      ) {
        // <word><space><hashmark><text>
        lineAnalysis[i] = 'footer-start-end'
        continue
      }
      if (
        secondNode.type === 'whitespace' &&
        thirdNode.type === 'issue-reference'
      ) {
        // <word><space><issueref>
        lineAnalysis[i] = 'footer-start-end'
        continue
      }
    }
    // check for footer continuation (no colon, some punctuation/word)
    const withColon = lineNodes.some(
      (node: LineWiseValueNode<NodeValueType>) =>
        node.type === 'punctuation' && node.value === ':'
    )
    const withContent = lineNodes.some(
      (node) =>
        node.type === 'punctuation' ||
        node.type === 'word' ||
        node.type === 'number' ||
        node.type === 'breaking-change-literal'
    )
    if (!withColon && withContent) {
      if (lastNonCommentLine === 'footer-start-end') {
        lineAnalysis[lastNonCommentIdx] = 'footer-start'
        lineAnalysis[i] = 'footer-end'
        continue
      } else if (lastNonCommentLine === 'footer-end') {
        lineAnalysis[lastNonCommentIdx] = 'footer-continuation'
        lineAnalysis[i] = 'footer-end'
        continue
      }
    }
    lineAnalysis[i] = 'non-footer-content'
    if (!body) {
      body = { start: i, end: i }
    } else {
      body.end = i
    }
  }

  // transform body / footer
  let bodyNode: MutNode
  let footerNode: MutNode | undefined

  for (let i = 1; i < inputLines.length; i++) {
    const inputLine = inputLines.at(i)! as LineWiseInnerNode
    const lineType = lineAnalysis.at(i)!

    if (i === body?.start) {
      bodyNode = {
        type: 'body',
        offset: inputLine.offset,
        parent: root,
        range: {
          start: inputLine.range.start,
          end: inputLine.range.end,
        },
        length: 0,
        children: [],
      }
      root.children.push(bodyNode)
    }
    if (i === body?.end) {
      bodyNode!.length = inputLine.offset + inputLine.length - inputLine.offset
      bodyNode!.range.end = inputLine.range.end
    }

    if (body && i >= body.start && i <= body.end) {
      // push into body
      if (inputLine.type === 'comment') {
        addToParent(bodyNode!, inputLine)
      } else {
        // line
        addToParent(bodyNode!, ...inputLine.children)
      }
    } else if (lineType === 'footer-start-end') {
      const footerNode: MutNode = {
        type: 'footer',
        offset: inputLine.offset,
        length: inputLine.length,
        parent: root,
        range: inputLine.range,
        children: [],
      }
      root.children.push(footerNode)
      addToParent(footerNode!, ...inputLine.children)
      refactorFooter(footerNode!)
    } else if (lineType === 'footer-start') {
      footerNode = {
        type: 'footer',
        offset: inputLine.offset,
        length: 0,
        parent: root,
        range: inputLine.range,
        children: [],
      }
      root.children.push(footerNode)
      addToParent(footerNode!, ...inputLine.children)
    } else if (lineType === 'footer-continuation') {
      addToParent(footerNode!, ...inputLine.children)
    } else if (lineType === 'footer-end') {
      footerNode!.length =
        inputLine.offset + inputLine.length - footerNode!.offset
      footerNode!.range.end = inputLine.range.end
      addToParent(footerNode!, ...inputLine.children)
      refactorFooter(footerNode!)
      footerNode = undefined
    } else if (lineType === 'comment' && footerNode !== undefined) {
      addToParent(footerNode, inputLine)
    } else if (lineType === 'comment') {
      // comments outside of body / footer
      addToParent(root, inputLine)
    }
  }

  return { root, errors }
}

function addToParent(
  parent: MutNode,
  ...nodes: (LineWiseNode | ValueNode<unknown>)[]
) {
  ;(nodes as MutNode[]).forEach((node) => {
    node.parent = parent
    parent.children.push(node)
  })
}

function refactorFooter(footer: MutNode) {
  // token
  const tokenContent = footer.children[0]
  const whitespacePosition = footer.children.findIndex(
    (child) => child.type === 'whitespace'
  )
  const valueContentNodes = footer.children.slice(whitespacePosition + 1)
  const footerToken: MutNode = {
    type: 'footer-token',
    offset: tokenContent.offset,
    length: tokenContent.length,
    parent: footer,
    range: tokenContent.range,
    children: [],
  }
  addToParent(footerToken, tokenContent)
  footer.children[0] = footerToken

  // value
  const firstValueNode = valueContentNodes.at(0)!
  const lastValueNode = valueContentNodes.at(-1)!
  const footerValue: MutNode = {
    type: 'footer-value',
    offset: firstValueNode.offset,
    length: lastValueNode.offset + lastValueNode.length - firstValueNode.offset,
    parent: footer,
    range: {
      start: firstValueNode.range.start,
      end: lastValueNode.range.end,
    },
    children: [],
  }
  addToParent(footerValue, ...valueContentNodes)
  footer.children = footer.children.slice(0, whitespacePosition + 1)
  footer.children.push(footerValue)
}
