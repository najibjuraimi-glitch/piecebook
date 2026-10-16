import { describe, expect, it } from 'vitest'
import type { Card } from '../data/seed'
import { copySeedPriceLine, identifyVersionHint } from './copyPrice'
import type { VisionIdentify } from './vision'

function card(partial: Partial<Card> & Pick<Card, 'cardNumber' | 'name'>): Card {
  const isParallel = partial.isParallel ?? /p\d+$/i.test(partial.cardNumber)
  return {
    setCode: 'OP-09',
    setName: 'Emperors in the New World',
    baseNumber: partial.cardNumber.replace(/p\d+$/i, ''),
    rarity: 'UC',
    language: 'EN',
    imageUrl: null,
    marketUsd: 0.19,
    asOf: '2026-09-05',
    isParallel,
    variant: isParallel ? 'Special Card' : null,
    ...partial,
  }
}

function identify(partial: Partial<VisionIdentify>): VisionIdentify {
  return {
    set_code: 'OP09-070',
    name: 'Nami',
    parallel_guess: 'base',
    language: 'EN',
    confidence: 1,
    read_text: '',
    ...partial,
  }
}

const base = card({ cardNumber: 'OP09-070', name: 'Nami' })
const sp = card({
  cardNumber: 'OP09-070p1',
  name: 'Nami',
  rarity: 'SP',
  isParallel: true,
  variant: 'Special Card',
  marketUsd: 42,
  asOf: '2026-09-05',
})
const spUnpriced = card({
  cardNumber: 'OP09-070p1',
  name: 'Nami',
  rarity: 'SP',
  isParallel: true,
  variant: 'Special Card',
  marketUsd: null,
  asOf: null,
})

describe('identifyVersionHint', () => {
  it('reads SPECIAL in OCR as SP even when the model said base', () => {
    expect(identifyVersionHint(identify({ read_text: 'Nami OP09-070 SPECIAL' }))).toBe('sp')
    expect(identifyVersionHint(identify({ parallel_guess: 'base', read_text: 'Nami' }))).toBeNull()
  })
})

describe('copySeedPriceLine', () => {
  it('never shows the base print price for an SP photo', () => {
    expect(copySeedPriceLine(base, identify({ read_text: 'Nami OP09-070 SPECIAL' }))).toBe(
      'no price for this version',
    )
  })

  it('shows the SP row price when that version has its own figure', () => {
    expect(copySeedPriceLine(sp, identify({ parallel_guess: 'SP', read_text: 'SPECIAL' }))).toMatch(
      /US \$42\.00/,
    )
  })

  it('does not fall back to the base price when the SP row has none', () => {
    expect(copySeedPriceLine(spUnpriced, identify({ parallel_guess: 'SP' }))).toBe('no price for this version')
  })

  it('shows the base seed when the photo is the base print', () => {
    expect(copySeedPriceLine(base, identify({ parallel_guess: 'base', read_text: 'Nami OP09-070' }))).toMatch(
      /US \$0\.19/,
    )
  })
})
