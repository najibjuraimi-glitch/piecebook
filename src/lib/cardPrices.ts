import type { Card } from '../data/seed'
import { usdToSgd } from './fx'

/** Shown wherever a grade has no sourced figure. Never replace this with a guess. */
export const NO_PRICE_YET = 'No price yet'

export type AdviceGrade = 'raw' | 'psa9' | 'psa10'

export interface AdvicePrice {
  grade: AdviceGrade
  label: string
  /** Sourced US dollars for this print, or null when the grade is not in the seed. */
  usd: number | null
  /** The same figure in SGD at the dated ECB rate. Null when usd is null. */
  sgd: number | null
  source: string | null
  /** Page the figure was read from. Null when there is no figure. */
  url: string | null
  asOf: string | null
}

const GRADES: { grade: AdviceGrade; label: string }[] = [
  { grade: 'raw', label: 'Raw' },
  { grade: 'psa9', label: 'PSA 9' },
  { grade: 'psa10', label: 'PSA 10' },
]

function limitlessCardUrl(card: Card): string {
  return `https://onepiece.limitlesstcg.com/cards/en/${encodeURIComponent(card.baseNumber)}`
}

/**
 * Ungraded market for this print only. `market_usd` / `as_of` are the Limitless
 * reading (TCGplayer market as shown there). A blank on a parallel stays blank:
 * the base print's price is a different card.
 */
function rawFromSeed(card: Card): Pick<AdvicePrice, 'usd' | 'sgd' | 'source' | 'url' | 'asOf'> | null {
  const asOf = card.asOf && /^\d{4}-\d{2}-\d{2}$/.test(card.asOf) ? card.asOf : null
  const usd = card.marketUsd
  if (usd == null || !Number.isFinite(usd) || usd < 0 || !asOf) return null
  return {
    usd,
    sgd: usdToSgd(usd),
    source: 'Limitless',
    url: limitlessCardUrl(card),
    asOf,
  }
}

/**
 * Raw, PSA 9 and PSA 10 for the Prices card. PSA 9 and PSA 10 are not stored
 * anywhere in the seed, so those rows are always empty. Nothing here is invented.
 */
export function advicePrices(card: Card): AdvicePrice[] {
  const raw = rawFromSeed(card)
  return GRADES.map(({ grade, label }) => {
    if (grade === 'raw' && raw) return { grade, label, ...raw }
    return { grade, label, usd: null, sgd: null, source: null, url: null, asOf: null }
  })
}
