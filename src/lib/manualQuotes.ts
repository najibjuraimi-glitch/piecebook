/**
 * Prices Cards typed in. They are not Limitless markets and not OP Box Index.
 * A figure here is used only for the print and grade it names.
 */
import type { LegalGrade, PriceQuote } from './boughtBook'
import { usdToSgd } from './fx'

export interface ManualComp {
  usd: number
  asOf: string
  source: string
}

export interface ManualPrintQuote {
  printId: string
  grade: LegalGrade
  usd: number
  asOf: string
  source: string
  url: string
  detail: string
  comps: ManualComp[]
}

const SHANKS_SILVER_URL = 'https://www.pricecharting.com/game/one-piece-carrying-on-his-will/shanks-silver-op09-004'

/** The only manual figures. Do not add a number that was not supplied. */
export const MANUAL_QUOTES: ManualPrintQuote[] = [
  {
    printId: 'OP09-004p4',
    grade: 'psa10',
    usd: 1350.5,
    asOf: '2026-10-18',
    source: 'PriceCharting',
    url: SHANKS_SILVER_URL,
    detail: 'manual',
    comps: [
      { usd: 961, asOf: '2026-10-07', source: 'eBay' },
      { usd: 1226.02, asOf: '2026-10-02', source: 'eBay' },
      { usd: 1425, asOf: '2026-09-09', source: 'eBay' },
    ],
  },
]

export function manualPrintQuote(printId: string, grade: LegalGrade | null): ManualPrintQuote | null {
  if (!printId || !grade) return null
  const want = printId.toUpperCase()
  return MANUAL_QUOTES.find((row) => row.printId.toUpperCase() === want && row.grade === grade) ?? null
}

/** English quote for a typed figure. Null when this print and grade have none. */
export function quoteManual(printId: string, grade: LegalGrade | null): PriceQuote | null {
  const row = manualPrintQuote(printId, grade)
  if (!row) return null
  return {
    usd: row.usd,
    sgd: usdToSgd(row.usd),
    source: row.source,
    url: row.url,
    asOf: row.asOf,
    detail: row.detail,
  }
}
