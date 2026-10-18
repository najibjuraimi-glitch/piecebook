/**
 * English stored quotes read from the seed CSV text already in the repo.
 * Same rule as legalQuote: raw is this print's Limitless market. PSA 9 and
 * PSA 10 count only when the stored printing is English. A Japanese OP Box
 * Index median is not a price. A parallel does not inherit another print.
 */
import { parseCsv } from '../data/csv'
import { printCode, type LegalGrade, type PriceQuote } from './boughtBook'
import { usdToSgd } from './fx'

const PARALLEL_RE = /p\d+$/i

const PRINTING: Record<string, string> = {
  japanese: 'Japanese printing · sold median',
  english: 'English printing · sold median',
}

export type SeedRow = Record<string, string>

export function rowsFromSeedTexts(texts: string[]): Map<string, SeedRow> {
  const byNumber = new Map<string, SeedRow>()
  for (const text of texts) {
    const matrix = parseCsv(text)
    if (matrix.length === 0) continue
    const header = matrix[0]
    for (const cells of matrix.slice(1)) {
      const row: SeedRow = {}
      header.forEach((key, i) => {
        row[key] = (cells[i] ?? '').trim()
      })
      if (row.card_number && !byNumber.has(row.card_number)) byNumber.set(row.card_number, row)
    }
  }
  return byNumber
}

function rawQuote(row: SeedRow): PriceQuote | null {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(row.as_of || '') ? row.as_of : null
  const usd = row.market_usd === '' || row.market_usd == null ? NaN : Number(row.market_usd)
  if (!Number.isFinite(usd) || usd < 0 || !asOf) return null
  const base = row.card_number.replace(PARALLEL_RE, '')
  return {
    usd,
    sgd: usdToSgd(usd),
    source: 'Limitless',
    url: `https://onepiece.limitlesstcg.com/cards/en/${encodeURIComponent(base)}`,
    asOf,
    detail: 'ungraded TCGplayer market',
  }
}

function gradedQuote(row: SeedRow, grade: 'psa9' | 'psa10'): PriceQuote | null {
  const prefix = grade === 'psa9' ? 'psa9' : 'psa10'
  const raw = row[`${prefix}_usd`]
  const usd = raw === '' || raw == null ? NaN : Number(raw)
  const asOf = row[`${prefix}_as_of`] || ''
  const source = row[`${prefix}_source`] || ''
  const url = row[`${prefix}_url`] || ''
  const detail = PRINTING[row[`${prefix}_printing`] || '']
  if (!Number.isFinite(usd) || usd <= 0) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null
  if (source !== 'opboxindex') return null
  if (!url.startsWith('https://opboxindex.com/cards/')) return null
  if (!detail) return null
  return { usd, sgd: usdToSgd(usd), source: 'OP Box Index', url, asOf, detail }
}

function rowFor(rows: Map<string, SeedRow>, code: string): SeedRow | undefined {
  const id = printCode(code)
  return rows.get(id) ?? rows.get(id.toUpperCase()) ?? [...rows.entries()].find(([key]) => key.toUpperCase() === id.toUpperCase())?.[1]
}

/** English stored quote for this print and grade. Null when there is none. Never a Japanese figure. */
export function quoteStored(rows: Map<string, SeedRow>, code: string, grade: LegalGrade | null): PriceQuote | null {
  if (!code || (grade !== 'raw' && grade !== 'psa9' && grade !== 'psa10')) return null
  const row = rowFor(rows, code)
  if (!row) return null
  const lang = (row.language || '').trim().toUpperCase()
  if (lang !== 'EN') return null
  if (grade === 'raw') return rawQuote(row)
  const quote = gradedQuote(row, grade)
  if (!quote) return null
  const prefix = grade === 'psa9' ? 'psa9' : 'psa10'
  if ((row[`${prefix}_printing`] || '').toLowerCase() !== 'english') return null
  if ((quote.detail || '').toLowerCase().includes('japanese')) return null
  return quote
}
