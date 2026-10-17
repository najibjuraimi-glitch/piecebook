/**
 * Read the Bought tab and append one totals row to data/portfolio-history.csv.
 * Never writes to the spreadsheet. Never writes purchase rows into the repo.
 *
 * Env (all optional until Jib has a key):
 *   GOOGLE_SERVICE_ACCOUNT_JSON   the service-account key JSON, one secret
 *   BOUGHT_SHEET_ID               spreadsheet id from /spreadsheets/d/<id>/edit
 *   BOUGHT_SHEET_GID              tab id, default 163782451
 *
 * The address to share the sheet with is the key's client_email. This script
 * does not print that address or the key.
 *
 * Missing env exits 0 and leaves the fixture snapshot untouched.
 * --dry-run reads (when env is set) and writes nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOUGHT_TAB_GID, mergeSnapshotCsv, parseBoughtMatrix, snapshotLine, summariseBought, valueCopies } from '../src/lib/boughtBook.ts'
import { readBoughtTab } from '../src/lib/googleSheetsRead.ts'
import { quoteFor } from './bought-prices.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HISTORY = join(ROOT, 'data', 'portfolio-history.csv')
const dryRun = process.argv.includes('--dry-run')

const jsonEnv = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim()
const spreadsheetId = (process.env.BOUGHT_SHEET_ID ?? '').trim()
if (!jsonEnv || !spreadsheetId) {
  console.log('Bought sheet skipped: set GOOGLE_SERVICE_ACCOUNT_JSON and BOUGHT_SHEET_ID to read it. The app keeps the fixture.')
  process.exit(0)
}

let key
try {
  key = JSON.parse(jsonEnv)
} catch {
  console.error('Bought sheet: GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.')
  process.exit(1)
}
if (!key || typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
  console.error('Bought sheet: the key JSON needs client_email and private_key.')
  process.exit(1)
}

const gidRaw = (process.env.BOUGHT_SHEET_GID ?? '').trim()
const sheetGid = gidRaw ? Number(gidRaw) : BOUGHT_TAB_GID
if (!Number.isInteger(sheetGid)) {
  console.error('Bought sheet: BOUGHT_SHEET_GID must be an integer.')
  process.exit(1)
}

let matrix
try {
  const read = await readBoughtTab({ key, spreadsheetId, sheetGid })
  matrix = read.matrix
} catch (err) {
  const message = err instanceof Error ? err.message : 'sheets_read_failed'
  console.error(`Bought sheet: ${message}`)
  process.exit(1)
}

const parsed = parseBoughtMatrix(matrix)
if (parsed.missing.length) {
  console.error(`Bought sheet: missing headers: ${parsed.missing.join(', ')}`)
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const valued = valueCopies(parsed.copies, (code, grade) => quoteFor(code, grade), today)
const summary = summariseBought(valued)
const line = snapshotLine(summary, today, 'sheet')
if (dryRun) {
  console.log(`Bought sheet dry run: ${parsed.copies.length} copies, ${parsed.skipped} skipped. Nothing written.`)
  process.exit(0)
}

let prev = ''
try {
  prev = readFileSync(HISTORY, 'utf8')
} catch {
  prev = ''
}
writeFileSync(HISTORY, mergeSnapshotCsv(prev, line))
console.log(`Bought sheet: ${parsed.copies.length} copies, ${parsed.skipped} skipped, snapshot ${today}.`)
