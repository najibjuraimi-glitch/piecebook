import { describe, expect, it } from 'vitest'
import { ALL_CARDS } from '../data/seed'
import { quoteFor } from '../../scripts/bought-prices.mjs'
import { legalQuote } from './loadBought'

describe('portfolio quotes match the English seed and drop a Japanese printing', () => {
  it('uses the same English figures as legalQuote for every print', () => {
    for (const card of ALL_CARDS) {
      for (const grade of ['raw', 'psa9', 'psa10'] as const) {
        expect(quoteFor(card.cardNumber, grade), card.cardNumber + ' ' + grade).toEqual(legalQuote(card.cardNumber, grade))
      }
    }
  })
})
