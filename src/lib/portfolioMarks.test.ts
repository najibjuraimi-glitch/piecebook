import { describe, expect, it } from 'vitest'
import { portfolioCountLine, portfolioIndex, portfolioMark } from './portfolioMarks'

describe('portfolio marks', () => {
  it('marks In your portfolio only on the exactPrint, not the bare code', () => {
    const index = portfolioIndex([
      { code: 'OP10-119', status: 'Held', exactPrint: 'OP10-119p2' },
      { code: 'OP10-119', status: 'Held', exactPrint: 'OP10-119P2' },
    ])
    expect(portfolioMark(index, 'OP10-119p2')).toBe('exact')
    expect(portfolioMark(index, 'OP10-119')).toBeNull()
    expect(portfolioMark(index, 'OP10-119p1')).toBeNull()
    expect(portfolioMark(index, 'OP10-119p3')).toBeNull()
  })

  it('marks You own a version on every print when exactPrint is empty', () => {
    const index = portfolioIndex([
      { code: 'OP13-028', status: 'Held', exactPrint: null },
      { code: 'OP13-028 SP', status: 'Listed', exactPrint: '' },
      { code: 'OP05-001', status: 'Sold', exactPrint: null },
    ])
    expect(portfolioMark(index, 'OP13-028')).toBe('version')
    expect(portfolioMark(index, 'OP13-028p1')).toBe('version')
    expect(portfolioMark(index, 'OP13-028')).not.toBe('exact')
    expect(portfolioMark(index, 'OP05-001')).toBeNull()
    expect(portfolioMark(index, 'OP10-119')).toBeNull()
  })

  it('lets an exact print win over a version of the same card', () => {
    const index = portfolioIndex([
      { code: 'OP10-119', status: 'Held', exactPrint: 'OP10-119p2' },
      { code: 'OP10-119', status: 'Held', exactPrint: null },
    ])
    expect(portfolioMark(index, 'OP10-119p2')).toBe('exact')
    expect(portfolioMark(index, 'OP10-119')).toBe('version')
    expect(portfolioMark(index, 'OP10-119p1')).toBe('version')
    const line = portfolioCountLine(
      [{ cardNumber: 'OP10-119' }, { cardNumber: 'OP10-119p1' }, { cardNumber: 'OP10-119p2' }],
      (cardNumber) => portfolioMark(index, cardNumber),
    )
    expect(line).toBe('1 in your portfolio · 2 you own a version')
  })
})
