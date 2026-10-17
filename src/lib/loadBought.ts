import fixtureCsv from '../../data/bought-fixture.csv?raw'
import historyCsv from '../../data/portfolio-history.csv?raw'
import { parseCsv } from '../data/csv'
import { getCard, type Card } from '../data/seed'
import { advicePrices } from './cardPrices'
import {
  parseBoughtMatrix,
  readSnapshots,
  summariseBought,
  valueCopies,
  type BookSource,
  type BoughtSummary,
  type LegalGrade,
  type PriceQuote,
  type SnapshotView,
  type ValuedCopy,
} from './boughtBook'
import { todayIso } from './format'

export interface LoadedBook {
  source: BookSource
  missing: string[]
  skipped: number
  copies: ValuedCopy[]
  summary: BoughtSummary
  today: string
}

export function legalQuote(code: string, grade: LegalGrade | null): PriceQuote | null {
  if (!code || !grade) return null
  const card = getCard(code)
  if (!card) return null
  const row = advicePrices(card).find((price) => price.grade === grade)
  if (!row || row.usd == null || row.sgd == null || !row.asOf || !row.source) return null
  return { usd: row.usd, sgd: row.sgd, source: row.source, url: row.url, asOf: row.asOf, detail: row.detail }
}

export function bookFromMatrix(matrix: string[][], today = todayIso(), source: BookSource = 'sheet'): LoadedBook {
  const parsed = parseBoughtMatrix(matrix)
  const copies = parsed.missing.length ? [] : valueCopies(parsed.copies, legalQuote, today)
  return {
    source,
    missing: parsed.missing,
    skipped: parsed.skipped,
    copies,
    summary: summariseBought(copies),
    today,
  }
}

export function fixtureBook(today = todayIso()): LoadedBook {
  return bookFromMatrix(parseCsv(fixtureCsv), today, 'fixture')
}

export function portfolioSnapshots(): SnapshotView[] {
  return readSnapshots(historyCsv)
}

export function cardFor(code: string): Card | undefined {
  return getCard(code)
}
