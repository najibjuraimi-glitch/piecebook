import fixtureCsv from '../../data/bought-fixture.csv?raw'
import historyCsv from '../../data/portfolio-history.csv?raw'
import { parseCsv } from '../data/csv'
import { ALL_CARDS, getCard, type Card } from '../data/seed'
import { resolveHoldingPrint, type PrintRow } from './printResolve'
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
import { boughtCopyFromHolding, type Holding } from './holdings'

import { todayIso } from './format'

export interface LoadedBook {
  source: BookSource
  missing: string[]
  skipped: number
  copies: ValuedCopy[]
  summary: BoughtSummary
  today: string
  revision: number | null
}

/**
 * English stored quote for this print and grade. A Japanese OP Box Index
 * median is not a price for an English holding. Raw is the Limitless
 * ungraded market of this exact print.
 */
const PRINTS: PrintRow[] = ALL_CARDS.map((card) => ({
  cardNumber: card.cardNumber,
  baseNumber: card.baseNumber,
  variant: card.variant || '',
  rarity: card.rarity,
  language: card.language,
}))

export function legalQuote(code: string, grade: LegalGrade | null): PriceQuote | null {
  if (!code || !grade) return null
  const print = resolveHoldingPrint(code, PRINTS)
  const card = print ? getCard(print.cardNumber) : undefined
  if (!card || card.language.toUpperCase() !== 'EN') return null
  if (grade !== 'raw') {
    const printing = grade === 'psa10' ? card.psa10Printing : card.psa9Printing
    if ((printing || '').toLowerCase() !== 'english') return null
  }
  const row = advicePrices(card).find((price) => price.grade === grade)
  if (!row || row.usd == null || row.sgd == null || !row.asOf || !row.source) return null
  if ((row.detail || '').toLowerCase().includes('japanese')) return null
  return { usd: row.usd, sgd: row.sgd, source: row.source, url: row.url, asOf: row.asOf, detail: row.detail }
}

export function bookFromMatrix(matrix: string[][], today = todayIso(), source: BookSource = 'piecebook'): LoadedBook {
  const parsed = parseBoughtMatrix(matrix)
  const copies = parsed.missing.length ? [] : valueCopies(parsed.copies, legalQuote, today)
  return {
    source,
    missing: parsed.missing,
    skipped: parsed.skipped,
    copies,
    summary: summariseBought(copies),
    today,
    revision: null,
  }
}

export function fixtureBook(today = todayIso()): LoadedBook {
  return bookFromMatrix(parseCsv(fixtureCsv), today, 'fixture')
}

export function bookFromHoldings(copies: Holding[], today = todayIso(), revision: number | null = null): LoadedBook {
  const valued = valueCopies(copies.map(boughtCopyFromHolding), legalQuote, today)
  return {
    source: 'piecebook',
    missing: [],
    skipped: 0,
    copies: valued,
    summary: summariseBought(valued),
    today,
    revision,
  }
}

export function portfolioSnapshots(): SnapshotView[] {
  return readSnapshots(historyCsv)
}

export function cardFor(code: string): Card | undefined {
  return getCard(code)
}
