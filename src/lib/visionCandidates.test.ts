import { describe, expect, it } from 'vitest'
import type { Card } from '../data/seed'
import { effectiveParallelGuess, matchesPrintedCode, nameScore, rankVisionCandidates } from './visionCandidates'
import type { VisionIdentify } from './vision'

function card(partial: Partial<Card> & Pick<Card, 'cardNumber' | 'name'>): Card {
  const isParallel = partial.isParallel ?? /p\d+$/i.test(partial.cardNumber)
  return {
    setCode: 'ST-01',
    setName: 'Straw Hat Crew',
    baseNumber: partial.cardNumber.replace(/p\d+$/i, ''),
    rarity: 'C',
    language: 'EN',
    imageUrl: null,
    marketUsd: null,
    asOf: null,
    isParallel,
    variant: isParallel ? 'Alternate Art' : null,
    ...partial,
  }
}

const nami = card({ cardNumber: 'ST01-007', name: 'Nami', rarity: 'R', setCode: 'ST-01' })
const namiP = card({
  cardNumber: 'ST01-007p1',
  name: 'Nami',
  rarity: 'R',
  setCode: 'ST-01',
  isParallel: true,
  variant: 'Alternate Art',
})
const namiManga = card({
  cardNumber: 'OP01-016p2',
  name: 'Nami',
  rarity: 'R',
  setCode: 'OP-01',
  baseNumber: 'OP01-016',
  isParallel: true,
  variant: 'Manga Art',
})
const namiOp = card({ cardNumber: 'OP01-016', name: 'Nami', rarity: 'R', setCode: 'OP-01', baseNumber: 'OP01-016' })
const luffy = card({ cardNumber: 'ST01-012', name: 'Monkey.D.Luffy', rarity: 'C', setCode: 'ST-01' })
const sanji = card({ cardNumber: 'ST14-003', name: 'Sanji', rarity: 'SR', setCode: 'ST-14' })
const sanjiP = card({
  cardNumber: 'ST14-003p1',
  name: 'Sanji',
  rarity: 'SR',
  setCode: 'ST-14',
  isParallel: true,
  variant: 'Parallel',
})
const sp = card({
  cardNumber: 'OP09-118p3',
  name: 'Monkey.D.Luffy',
  rarity: 'SP',
  setCode: 'OP-09',
  baseNumber: 'OP09-118',
  isParallel: true,
  variant: 'Special Card',
})
const luffyBase = card({ cardNumber: 'OP09-118', name: 'Monkey.D.Luffy', rarity: 'SEC', setCode: 'OP-09', baseNumber: 'OP09-118' })
const usopp = card({ cardNumber: 'ST01-002', name: 'Usopp', rarity: 'C', setCode: 'ST-01' })

const catalogue = [nami, namiP, namiOp, namiManga, luffy, sanji, sanjiP, sp, luffyBase, usopp]

function identify(partial: Partial<VisionIdentify>): VisionIdentify {
  return {
    set_code: null,
    name: null,
    rarity: null,
    parallel_guess: null,
    language: null,
    confidence: 0.6,
    read_text: '',
    ...partial,
  }
}

describe('matchesPrintedCode', () => {
  it('matches base and parallels for OP01-016 / ST01-007', () => {
    expect(matchesPrintedCode(nami, 'ST01-007')).toBe(true)
    expect(matchesPrintedCode(namiP, 'ST01-007')).toBe(true)
    expect(matchesPrintedCode(nami, 'st01-007')).toBe(true)
    expect(matchesPrintedCode(namiOp, 'OP01-016')).toBe(true)
    expect(matchesPrintedCode(namiManga, 'OP01-016')).toBe(true)
    expect(matchesPrintedCode(sanji, 'ST01-007')).toBe(false)
  })
})

describe('nameScore', () => {
  it('scores exact and close printed names', () => {
    expect(nameScore('Nami', 'Nami')).toBe(100)
    expect(nameScore('Monkey.D.Luffy', 'Monkey.D.Luffy')).toBeGreaterThan(90)
    expect(nameScore('Luffy', 'Monkey.D.Luffy')).toBeGreaterThan(0)
    expect(nameScore('Sanji', 'Usopp')).toBe(0)
  })
})

describe('rankVisionCandidates', () => {
  it('exact set_code returns base + parallels and ranks base first when guessed base', () => {
    const rows = rankVisionCandidates(identify({ set_code: 'ST01-007', name: 'Nami', parallel_guess: 'base' }), catalogue)
    expect(rows[0]?.card.cardNumber).toBe('ST01-007')
    expect(rows.filter((r) => r.exact).map((r) => r.card.cardNumber)).toEqual(['ST01-007', 'ST01-007p1'])
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows.length).toBeLessThanOrEqual(5)
  })

  it('parallel/alt art guess ranks the parallel ahead of the base', () => {
    const rows = rankVisionCandidates(
      identify({ set_code: 'ST14-003', name: 'Sanji', parallel_guess: 'parallel/alt art' }),
      catalogue,
    )
    expect(rows[0]?.card.cardNumber).toBe('ST14-003p1')
    expect(rows.map((r) => r.card.cardNumber)).toContain('ST14-003')
  })

  it('manga guess ranks the manga print first among Nami hits', () => {
    const rows = rankVisionCandidates(
      identify({ set_code: 'OP01-016', name: 'Nami', parallel_guess: 'manga' }),
      catalogue,
    )
    expect(rows[0]?.card.cardNumber).toBe('OP01-016p2')
    expect(rows[0]?.card.variant).toBe('Manga Art')
  })

  it('SP guess ranks the special print', () => {
    const rows = rankVisionCandidates(
      identify({ set_code: 'OP09-118', name: 'Monkey.D.Luffy', parallel_guess: 'SP' }),
      catalogue,
    )
    expect(rows[0]?.card.rarity).toBe('SP')
  })

  it('SPECIAL in read_text ranks the SP print when the model gave no guess', () => {
    const rows = rankVisionCandidates(
      identify({
        set_code: 'OP09-118',
        name: 'Monkey.D.Luffy',
        parallel_guess: null,
        read_text: 'Monkey.D.Luffy OP09-118 SPECIAL',
      }),
      catalogue,
    )
    expect(rows[0]?.card.rarity).toBe('SP')
  })

  it('F6: a base guess ranks the base print even when the text says SPECIAL', () => {
    const rows = rankVisionCandidates(
      identify({
        set_code: 'OP09-118',
        name: 'Monkey.D.Luffy',
        parallel_guess: 'base',
        read_text: 'Monkey.D.Luffy OP09-118 特 SPECIAL',
      }),
      catalogue,
    )
    expect(rows[0]?.card.cardNumber).toBe('OP09-118')
    expect(rows[0]?.card.isParallel).toBe(false)
    expect(effectiveParallelGuess({ parallel_guess: 'base', read_text: 'SPECIAL' })).toBe('base')
    expect(effectiveParallelGuess({ parallel_guess: null, read_text: 'OP09-118 SP' })).toBe('SP')
  })

  it('null set_code fuzzy-matches name against seed names', () => {
    const rows = rankVisionCandidates(identify({ name: 'Nami' }), catalogue)
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows.length).toBeLessThanOrEqual(5)
    expect(rows.every((r) => r.card.name === 'Nami')).toBe(true)
    expect(rows.every((r) => !r.exact)).toBe(true)
  })

  it('null set_code uses read_text when the name is empty', () => {
    const rows = rankVisionCandidates(identify({ read_text: 'Sanji ST14-003 Straw Hat' }), catalogue)
    expect(rows[0]?.card.name).toBe('Sanji')
  })

  it('unknown set_code falls through to fuzzy name', () => {
    const rows = rankVisionCandidates(identify({ set_code: 'ZZ99-001', name: 'Usopp' }), catalogue)
    expect(rows.some((r) => r.card.cardNumber === 'ST01-002')).toBe(true)
    expect(rows.every((r) => !r.exact)).toBe(true)
  })

  it('returns at most five candidates and never auto-picks a single required hit', () => {
    const rows = rankVisionCandidates(identify({ name: 'a' }), catalogue, 5)
    expect(rows.length).toBeLessThanOrEqual(5)
  })

  it('empty identify returns no candidates', () => {
    expect(rankVisionCandidates(identify({}), catalogue)).toEqual([])
  })
})
