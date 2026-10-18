import { describe, expect, it } from 'vitest'
import { codeInBook, codesInBook } from './portfolioMarks'

describe('portfolio marks', () => {
  const codes = codesInBook([
    { code: 'ST01-007', status: 'Held' },
    { code: 'op05-100p2', status: 'Listed' },
    { code: 'OP05-001', status: 'Sold' },
    { code: 'OP13-028 SP', status: 'Held' },
    { code: '  eb02-010  ', status: 'held' },
  ])

  it('matches a holding code exactly and keeps a sold code out', () => {
    expect(codeInBook(codes, 'ST01-007')).toBe(true)
    expect(codeInBook(codes, 'st01-007')).toBe(true)
    expect(codeInBook(codes, 'OP05-100p2')).toBe(true)
    expect(codeInBook(codes, 'OP05-001')).toBe(false)
    expect(codeInBook(codes, 'EB02-010')).toBe(true)
    expect(codeInBook(codes, 'OP13-028')).toBe(false)
    expect(codeInBook(codes, 'OP13-028 SP')).toBe(true)
    expect(codeInBook(codes, 'OP09-001')).toBe(false)
  })
})
