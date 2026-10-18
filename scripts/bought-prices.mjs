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
import { quoteStored, rowsFromSeedTexts } from '../src/lib/storedQuotes.ts'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

function loadRows() {
  const files = readdirSync(DATA)
    .filter((name) => name.endsWith('-en-seed.csv'))
    .sort()
  return rowsFromSeedTexts(files.map((name) => readFileSync(join(DATA, name), 'utf8')))
}

const rows = loadRows()

/** @param {string} code @param {'raw' | 'psa9' | 'psa10' | null} grade */
export function quoteFor(code, grade) {
  return quoteStored(rows, code, grade)
}
