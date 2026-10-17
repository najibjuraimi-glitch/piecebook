/**
 * English stored quotes, read from the seed CSVs already in the repo.
 * Same rule as legalQuote: raw is Limitless `market_usd` for this EN print.
 * PSA 9 / PSA 10 are used only when the stored printing is English.
 * A Japanese OP Box Index median is not a Portfolio value.
 * A parallel does not inherit another print. PriceCharting is not read.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from '../src/data/csv.ts'
import { printCode } from '../src/lib/boughtBook.ts'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const PARALLEL_RE = /p\d+$/i
const PRINTING = {
  japanese: 'Japanese printing · sold median',
  english: 'English printing · sold median',
}

function loadRows() {
  const files = readdirSync(DATA)
    .filter((name) => name.endsWith('-en-seed.csv'))
    .sort()
  const byNumber = new Map()
  for (const name of files) {
    const matrix = parseCsv(readFileSync(join(DATA, name), 'utf8'))
    if (matrix.length === 0) continue
    const header = matrix[0]
    for (const cells of matrix.slice(1)) {
      const row = {}
      header.forEach((key, i) => {
        row[key] = (cells[i] ?? '').trim()
      })
      if (row.card_number && !byNumber.has(row.card_number)) byNumber.set(row.card_number, row)
    }
  }
  return byNumber
}

const rows = loadRows()
const fx = JSON.parse(readFileSync(join(DATA, 'fx-usd-sgd.json'), 'utf8'))
const rate = fx.rate

function sgd(usd) {
  return Math.round(usd * rate * 100) / 100
}

function rawQuote(row) {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(row.as_of || '') ? row.as_of : null
  const usd = row.market_usd === '' ? NaN : Number(row.market_usd)
  if (!Number.isFinite(usd) || usd < 0 || !asOf) return null
  const base = row.card_number.replace(PARALLEL_RE, '')
  return {
    usd,
    sgd: sgd(usd),
    source: 'Limitless',
    url: `https://onepiece.limitlesstcg.com/cards/en/${encodeURIComponent(base)}`,
    asOf,
    detail: 'ungraded TCGplayer market',
  }
}

function gradedQuote(row, grade) {
  const prefix = grade === 'psa9' ? 'psa9' : 'psa10'
  const usd = row[`${prefix}_usd`] === '' || row[`${prefix}_usd`] == null ? NaN : Number(row[`${prefix}_usd`])
  const asOf = row[`${prefix}_as_of`] || ''
  const source = row[`${prefix}_source`] || ''
  const url = row[`${prefix}_url`] || ''
  const detail = PRINTING[row[`${prefix}_printing`] || '']
  if (!Number.isFinite(usd) || usd <= 0) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null
  if (source !== 'opboxindex') return null
  if (!url.startsWith('https://opboxindex.com/cards/')) return null
  if (!detail) return null
  return { usd, sgd: sgd(usd), source: 'OP Box Index', url, asOf, detail }
}

/** @param {string} code @param {'raw' | 'psa9' | 'psa10' | null} grade */
export function quoteFor(code, grade) {
  if (!code || (grade !== 'raw' && grade !== 'psa9' && grade !== 'psa10')) return null
  const id = printCode(code)
  const row = rows.get(id) ?? rows.get(id.toUpperCase()) ?? [...rows.entries()].find(([k]) => k.toUpperCase() === id.toUpperCase())?.[1]
  if (!row) return null
  const lang = (row.language || '').trim().toUpperCase()
  if (lang && lang !== 'EN') return null
  if (grade === 'raw') return rawQuote(row)
  const quote = gradedQuote(row, grade)
  if (!quote) return null
  const prefix = grade === 'psa9' ? 'psa9' : 'psa10'
  if ((row[`${prefix}_printing`] || '').toLowerCase() !== 'english') return null
  return quote
}
