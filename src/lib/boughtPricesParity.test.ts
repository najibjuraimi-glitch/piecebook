import { describe, expect, it } from 'vitest'
import { ALL_CARDS } from '../data/seed'
import { advicePrices } from './cardPrices'
import { quoteFor } from '../../scripts/bought-prices.mjs'

describe('snapshot quotes match the Prices card', () => {
  it('uses the same raw and graded figures for every print', () => {
    for (const card of ALL_CARDS) {
      for (const grade of ['raw', 'psa9', 'psa10'] as const) {
        const advice = advicePrices(card).find((row) => row.grade === grade)!
        const got = quoteFor(card.cardNumber, grade)
        if (advice.usd == null) {
          expect(got, card.cardNumber + ' ' + grade).toBeNull()
        } else {
          expect(got, card.cardNumber + ' ' + grade).toEqual({
            usd: advice.usd,
            sgd: advice.sgd,
            source: advice.source,
            url: advice.url,
            asOf: advice.asOf,
            detail: advice.detail,
          })
        }
      }
    }
  })
})
