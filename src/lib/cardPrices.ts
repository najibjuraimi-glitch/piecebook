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
  /** Words after the source link, e.g. "ungraded TCGplayer market" or "Japanese printing · sold median". */
  detail: string | null
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
function rawFromSeed(card: Card): Pick<AdvicePrice, 'usd' | 'sgd' | 'source' | 'url' | 'asOf' | 'detail'> | null {
  const asOf = card.asOf && /^\d{4}-\d{2}-\d{2}$/.test(card.asOf) ? card.asOf : null
  const usd = card.marketUsd
  if (usd == null || !Number.isFinite(usd) || usd < 0 || !asOf) return null
  return {
    usd,
    sgd: usdToSgd(usd),
    source: 'Limitless',
    url: limitlessCardUrl(card),
    asOf,
    detail: 'ungraded TCGplayer market',
  }
}

const PRINTING_DETAIL: Record<string, string> = {
  japanese: 'Japanese printing · sold median',
  english: 'English printing · sold median',
}

/**
 * A graded seed figure is shown only when every part is present and names a
 * printing. A Japanese sold median stays labeled Japanese; it is not treated
 * as the English slab. Anything incomplete is dropped.
 */
function gradedFromSeed(card: Card, grade: 'psa9' | 'psa10'): Pick<AdvicePrice, 'usd' | 'sgd' | 'source' | 'url' | 'asOf' | 'detail'> | null {
  const usd = grade === 'psa9' ? card.psa9Usd : card.psa10Usd
  const asOf = grade === 'psa9' ? card.psa9AsOf : card.psa10AsOf
  const source = grade === 'psa9' ? card.psa9Source : card.psa10Source
  const url = grade === 'psa9' ? card.psa9Url : card.psa10Url
  const printing = grade === 'psa9' ? card.psa9Printing : card.psa10Printing
  const detail = printing ? PRINTING_DETAIL[printing] : undefined
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return null
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null
  if (source !== 'opboxindex') return null
  if (!url || !url.startsWith('https://opboxindex.com/cards/')) return null
  if (!detail) return null
  return { usd, sgd: usdToSgd(usd), source: 'OP Box Index', url, asOf, detail }
}

const EMPTY = { usd: null, sgd: null, source: null, url: null, asOf: null, detail: null }

/**
 * Raw, PSA 9 and PSA 10 for the Prices card. A grade the seed does not hold
 * is empty. Nothing here is invented, and a parallel does not inherit another
 * print's figure: each row reads only its own columns.
 */
export function advicePrices(card: Card): AdvicePrice[] {
  const raw = rawFromSeed(card)
  return GRADES.map(({ grade, label }) => {
    if (grade === 'raw' && raw) return { grade, label, ...raw }
    if (grade === 'psa9' || grade === 'psa10') {
      const graded = gradedFromSeed(card, grade)
      if (graded) return { grade, label, ...graded }
    }
    return { grade, label, ...EMPTY }
  })
}
