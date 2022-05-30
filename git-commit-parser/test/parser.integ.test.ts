import * as parser from '../src/parser'
import { describe, test, expect } from 'vitest'

describe('parser integ', () => {
  describe('parseTree', () => {
    test('should parse a commit message "feat: a commit message"', () => {
      const parsed = parser.parseCommit('feat: a commit message')

      expect(parsed).toBeTruthy()
      expect(parsed.root).toBeTruthy()
      const root = parsed.root as parser.InnerNode
      expect(root.type).toBe('message')
      expect(root.children).toHaveLength(1)
      const header = root?.children?.[0] as parser.InnerNode
      expect(header).toBeTruthy()
      expect(header?.type).toBe('header')
      expect(header?.children).toHaveLength(4)
      const [type, _colon, _whitespace, description] =
        header?.children as parser.InnerNode[]
      expect(type).toBeTruthy()
      expect(type?.type).toBe('type')
      expect(type?.children).toHaveLength(1)
      const typeValue = type?.children?.[0] as parser.ValueNode<string>
      expect(typeValue?.type).toBe('word')
      expect(typeValue?.value).toBe('feat')

      expect(description).toBeTruthy()
      expect(description?.type).toBe('description')
      expect(description?.children).toHaveLength(5)
      const [a, ws1, commit, ws2, message] =
        description?.children as parser.ValueNode<string>[]
      expect(a.type).toBe('word')
      expect(a.value).toBe('a')
      expect(ws1.type).toBe('whitespace')
      expect(ws1.value).toBe(' ')
      expect(commit.type).toBe('word')
      expect(commit.value).toBe('commit')
      expect(ws2.type).toBe('whitespace')
      expect(ws2.value).toBe(' ')
      expect(message.type).toBe('word')
      expect(message.value).toBe('message')
    })
  })
})
