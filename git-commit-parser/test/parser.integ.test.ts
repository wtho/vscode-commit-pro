import { ParseError } from '../src/main'
import * as parser from '../src/parser'

describe('parser integ', () => {
  test('should parse a commit message "feat: a commit message"', () => {
    const errors: ParseError[] = []

    const parsed = parser.parseTree('feat: a commit message', errors)

    expect(errors).toEqual([])

    expect(parsed).toBeTruthy()
    expect(parsed?.type).toBe('message')
    expect(parsed?.children).toHaveLength(1)
    const header = parsed?.children?.[0]
    expect(header).toBeTruthy()
    expect(header?.type).toBe('header')
    expect(header?.children).toHaveLength(2)
    const type = header?.children?.[0]
    const description = header?.children?.[1]
    expect(type).toBeTruthy()
    expect(type?.type).toBe('type')
    expect(type?.children).toHaveLength(1)
    expect(type?.children?.[0]?.type).toBe('word')
    expect(type?.children?.[0]?.value).toBe('feat')

    expect(description).toBeTruthy()
    expect(description?.type).toBe('description')
    expect(description?.children).toHaveLength(5)
    expect(description?.children?.[0]?.type).toBe('word')
    expect(description?.children?.[0]?.value).toBe('a')
    expect(description?.children?.[1]?.type).toBe('whitespace')
    expect(description?.children?.[1]?.value).toBe(' ')
    expect(description?.children?.[2]?.type).toBe('word')
    expect(description?.children?.[2]?.value).toBe('commit')
    expect(description?.children?.[3]?.type).toBe('whitespace')
    expect(description?.children?.[3]?.value).toBe(' ')
    expect(description?.children?.[4]?.type).toBe('word')
    expect(description?.children?.[4]?.value).toBe('message')
  })

  test('should parse a commit message "feat(scope): a commit message"', () => {
    const errors: ParseError[] = []

    const parsed = parser.parseTree('feat(scope): a commit message', errors)

    expect(errors).toEqual([])

    expect(parsed).toBeTruthy()
    expect(parsed?.type).toBe('message')
    expect(parsed?.children).toHaveLength(1)
    const header = parsed?.children?.[0]
    expect(header).toBeTruthy()
    expect(header?.type).toBe('header')
    expect(header?.children).toHaveLength(5)
    const type = header?.children?.[0]
    const parenOpen = header?.children?.[1]
    const scope = header?.children?.[2]
    const parenClose = header?.children?.[3]
    const description = header?.children?.[4]

    expect(type).toBeTruthy()
    expect(type?.type).toBe('type')
    expect(type?.children).toHaveLength(1)
    expect(type?.children?.[0]?.type).toBe('word')
    expect(type?.children?.[0]?.value).toBe('feat')

    expect(parenOpen).toBeTruthy()
    expect(parenOpen?.type).toBe('scope-paren-open')
    expect(parenOpen?.value).toEqual('(')

    expect(scope).toBeTruthy()
    expect(scope?.type).toBe('scope')
    expect(scope?.children).toHaveLength(1)
    expect(scope?.children?.[0]?.type).toBe('word')
    expect(scope?.children?.[0]?.value).toBe('scope')

    expect(parenClose).toBeTruthy()
    expect(parenClose?.type).toBe('scope-paren-close')
    expect(parenClose?.value).toEqual(')')

    expect(description).toBeTruthy()
    expect(description?.type).toBe('description')
    expect(description?.children).toHaveLength(5)
    expect(description?.children?.[0]?.type).toBe('word')
    expect(description?.children?.[0]?.value).toBe('a')
    expect(description?.children?.[1]?.type).toBe('whitespace')
    expect(description?.children?.[1]?.value).toBe(' ')
    expect(description?.children?.[2]?.type).toBe('word')
    expect(description?.children?.[2]?.value).toBe('commit')
    expect(description?.children?.[3]?.type).toBe('whitespace')
    expect(description?.children?.[3]?.value).toBe(' ')
    expect(description?.children?.[4]?.type).toBe('word')
    expect(description?.children?.[4]?.value).toBe('message')
  })

  test('should parse a commit message "feat(scope)!: a commit message"', () => {
    const errors: ParseError[] = []

    const parsed = parser.parseTree('feat(scope)!: a commit message', errors)

    expect(errors).toEqual([])

    expect(parsed).toBeTruthy()
    expect(parsed?.type).toBe('message')
    expect(parsed?.children).toHaveLength(1)
    const header = parsed?.children?.[0]
    expect(header).toBeTruthy()
    expect(header?.type).toBe('header')
    expect(header?.children).toHaveLength(6)
    const type = header?.children?.[0]
    const parenOpen = header?.children?.[1]
    const scope = header?.children?.[2]
    const parenClose = header?.children?.[3]
    const breakingExclamationMark = header?.children?.[4]
    const description = header?.children?.[5]
    expect(type).toBeTruthy()
    expect(type?.type).toBe('type')
    expect(type?.children).toHaveLength(1)
    expect(type?.children?.[0]?.type).toBe('word')
    expect(type?.children?.[0]?.value).toBe('feat')

    expect(parenOpen).toBeTruthy()
    expect(parenOpen?.type).toBe('scope-paren-open')
    expect(parenOpen?.value).toEqual('(')

    expect(scope).toBeTruthy()
    expect(scope?.type).toBe('scope')
    expect(scope?.children).toHaveLength(1)
    expect(scope?.children?.[0]?.type).toBe('word')
    expect(scope?.children?.[0]?.value).toBe('scope')

    expect(parenClose).toBeTruthy()
    expect(parenClose?.type).toBe('scope-paren-close')
    expect(parenClose?.value).toEqual(')')

    expect(breakingExclamationMark).toBeTruthy()
    expect(breakingExclamationMark?.type).toBe('breaking-exclamation-mark')
    expect(breakingExclamationMark?.value).toBe('!')

    expect(description).toBeTruthy()
    expect(description?.type).toBe('description')
    expect(description?.children).toHaveLength(5)
    expect(description?.children?.[0]?.type).toBe('word')
    expect(description?.children?.[0]?.value).toBe('a')
    expect(description?.children?.[1]?.type).toBe('whitespace')
    expect(description?.children?.[1]?.value).toBe(' ')
    expect(description?.children?.[2]?.type).toBe('word')
    expect(description?.children?.[2]?.value).toBe('commit')
    expect(description?.children?.[3]?.type).toBe('whitespace')
    expect(description?.children?.[3]?.value).toBe(' ')
    expect(description?.children?.[4]?.type).toBe('word')
    expect(description?.children?.[4]?.value).toBe('message')
  })

  test('should parse a commit message with body', () => {
    const errors: ParseError[] = []

    const message = `feat: a feature
        |
        |features:
        |* implementation
        |
        |Solves #123`
      .split('\n')
      .map((line) => {
        const splits = line.split('|')
        if (splits.length > 1 && splits[0].trim() === '') {
          return splits.slice(1).join('|')
        }
        return splits.join('|')
      })
      .join('\n')

    const parsed = parser.parseTree(message, errors)

    expect(errors).toEqual([])

    expect(parsed).toBeTruthy()
    expect(parsed?.type).toBe('message')
    expect(parsed?.children).toHaveLength(2)

    const body = parsed?.children?.[1]
    expect(body).toBeTruthy()
    expect(body?.type).toBe('body')
    expect(body?.children).toHaveLength(12)

    const features = body?.children?.[0]
    expect(features?.value).toBe('features')
    const implementation = body?.children?.[5]
    expect(implementation?.value).toBe('implementation')
    const solves = body?.children?.[8]
    expect(solves?.value).toBe('Solves')
    const n123 = body?.children?.[11]
    expect(n123?.value).toBe('123')

  })
})
