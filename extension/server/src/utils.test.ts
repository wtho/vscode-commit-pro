import { describe, test, expect } from 'vitest'
import { toSentenceCase } from './utils'

describe('utils', () => {
  describe('toSentenceCase', () => {
    test('should convert "a commit message" to "A commit message"', () => {
      const input = 'a commit message'
      const output = toSentenceCase(input)
      expect(output).toBe('A commit message')
    })
  })
})
