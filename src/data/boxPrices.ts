import { csvToObjects } from './csv'
import boxHistoryCsv from '../../data/box-price-history.csv?raw'

/**
 * EN booster box market prices per set per day from `data/box-price-history.csv`
 * (TCGplayer market via TCGCSV, appended by `npm run seed:refresh`; decision
 * 3.1, 5 Sep 2026). Tiny (one row per set per day), so it ships in the main
 * bundle. The roster's hand-read figure is only a fallback when a set has no row.
 */
export interface BoxPricePoint {
  asOf: string
  marketUsd: number
  lowUsd: number | null
}

const bySet = new Map<string, BoxPricePoint[]>()
for (const row of csvToObjects(boxHistoryCsv)) {
  const market = Number(row.market_usd)
  if (!row.set_code || !row.as_of || !Number.isFinite(market)) continue
  const low = row.low_usd === '' ? NaN : Number(row.low_usd)
  const list = bySet.get(row.set_code) ?? []
  list.push({ asOf: row.as_of, marketUsd: market, lowUsd: Number.isFinite(low) ? low : null })
  bySet.set(row.set_code, list)
}
for (const list of bySet.values()) list.sort((a, b) => a.asOf.localeCompare(b.asOf))

/** Every dated point for a set's box, oldest first. */
export function boxPriceHistory(setCode: string): BoxPricePoint[] {
  return bySet.get(setCode) ?? []
}

/** The newest dated point for a set's box, or undefined when the feed has none. */
export function latestBoxPrice(setCode: string): BoxPricePoint | undefined {
  const list = bySet.get(setCode)
  return list ? list[list.length - 1] : undefined
}
