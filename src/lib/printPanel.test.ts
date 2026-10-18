import { describe, expect, it } from 'vitest'
import { isStale } from './boughtBook'
import { todayIso } from './format'
import { matchPrints } from './printPanel'

describe('print panel matching', () => {
  it('pins the exact print and does not pin the base', () => {
    const panel = matchPrints({ code: 'OP10-119', exactPrint: 'OP10-119p2', grade: 'raw' })
    expect(panel.exactMissing).toBe(false)
    expect(panel.ambiguous).toBe(false)
    expect(panel.pinnedId).toBe('OP10-119p2')
    const pinned = panel.prints.filter((print) => print.pinned).map((print) => print.cardNumber)
    expect(pinned).toEqual(['OP10-119p2'])
    expect(panel.prints.find((print) => print.cardNumber === 'OP10-119')?.pinned).toBe(false)
    const manga = panel.prints.find((print) => print.cardNumber === 'OP10-119p2')!
    expect(manga.english?.source).toBe('Limitless')
    expect(manga.english?.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(manga.japanese.every((note) => note.usd !== manga.english?.usd)).toBe(true)
  })

  it('warns on an ambiguous code and still lists every print of the card number', () => {
    const panel = matchPrints({ code: 'OP09-004 SP', grade: 'raw' })
    expect(panel.ambiguous).toBe(true)
    expect(panel.exactMissing).toBe(true)
    expect(panel.pinnedId).toBeNull()
    expect(panel.prints.map((print) => print.cardNumber)).toEqual(['OP09-004', 'OP09-004p1', 'OP09-004p2', 'OP09-004p3', 'OP09-004p4'])
    const silver = panel.prints.find((print) => print.cardNumber === 'OP09-004p4')
    expect(silver?.variant).toMatch(/silver/i)
    expect(silver?.english).toBeNull()
    expect(panel.prints.every((print) => !print.pinned)).toBe(true)
    const manga = panel.prints.find((print) => print.cardNumber === 'OP09-004p2')!
    expect(manga.variant).toMatch(/manga/i)
    expect(manga.japanese.some((note) => note.grade === 'PSA 10')).toBe(true)
    expect(manga.english?.source).not.toBe('OP Box Index')
    if (manga.english) expect(manga.japanese.map((note) => note.usd)).not.toContain(manga.english.usd)
  })

  it('lists every print of a card number that has many', () => {
    const panel = matchPrints({ code: 'OP10-119', grade: 'psa10', codeIsPin: false })
    expect(panel.prints.length).toBeGreaterThanOrEqual(4)
    expect(panel.prints.map((print) => print.cardNumber)).toEqual(
      expect.arrayContaining(['OP10-119', 'OP10-119p1', 'OP10-119p2', 'OP10-119p3']),
    )
    expect(panel.exactMissing).toBe(true)
    const manga = panel.prints.find((print) => print.cardNumber === 'OP10-119p2')!
    expect(manga.english).toBeNull()
    expect(manga.japanese.some((note) => note.grade === 'PSA 10')).toBe(true)
    expect(manga.rarity).toBe('SEC')
    expect(manga.imageUrl).toMatch(/^https:\/\//)
  })

  it('marks an old seed price stale and keeps the source url', () => {
    const today = todayIso()
    const panel = matchPrints({ code: 'OP10-119', grade: 'raw' })
    const priced = panel.prints.filter((print) => print.english)
    expect(priced.length).toBeGreaterThan(0)
    for (const print of priced) {
      expect(print.english!.stale).toBe(isStale(print.english!.asOf, today))
    }
    expect(priced.some((print) => print.english!.stale)).toBe(true)
    const base = panel.prints.find((print) => print.cardNumber === 'OP10-119')!
    expect(base.english?.url).toMatch(/^https:\/\/onepiece\.limitlesstcg\.com\/cards\/en\/OP10-119$/)
    expect(base.english?.stale).toBe(true)
    const manga = panel.prints.find((print) => print.cardNumber === 'OP10-119p2')!
    expect(manga.english?.url).toBeNull()
    const jp = manga.japanese.find((note) => note.grade === 'PSA 10')!
    expect(jp.stale).toBe(isStale(jp.asOf, today))
    expect(jp.stale).toBe(true)
    expect(jp.url).toMatch(/^https:\/\/opboxindex\.com\//)
  })

  it('pins a watch row from its print id', () => {
    const panel = matchPrints({ code: 'OP09-004P3', grade: 'raw', codeIsPin: true })
    expect(panel.pinnedId).toBe('OP09-004p3')
    expect(panel.exactMissing).toBe(false)
    expect(panel.prints.find((print) => print.cardNumber === 'OP09-004p3')?.pinned).toBe(true)
    expect(panel.prints.find((print) => print.cardNumber === 'OP09-004')?.pinned).toBe(false)
  })
})
