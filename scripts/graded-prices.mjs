/**
 * PSA 9 / PSA 10 figures for the daily seed refresh.
 *
 * Source: OP Box Index (https://opboxindex.com), CC BY 4.0. No account and no
 * fee. Cite "OP Box Index (opboxindex.com)". Their set card lists
 * (https://opboxindex.com/sets/{set}-card-list.json) are the Japanese edition.
 * `psa10` is a median of completed eBay sales of that exact print (basis
 * "sold", n ≥ 3) or null. The card page and the eBay query on it are the
 * Japanese printing. Population counts split Japanese and English; this price
 * does not. It is stored with printing=japanese and the Prices card says so.
 * It is never copied onto a different print.
 *
 * They publish no PSA 9 price. psa9_* stays blank, and the card says
 * "No price yet".
 *
 * Not used, and why:
 * - PriceCharting public pages and API: Price Data may not be put in an app
 *   other people can open without written permission, and the API is a paid
 *   subscription. https://www.pricecharting.com/page/terms-of-service
 * - TCGCSV / TCGplayer: market price is ungraded. Category 68 has no PSA slab
 *   products (a "PSA" name there is a magazine promo, not a grade).
 * - eBay sold listings: the developer APIs forbid storing results to build a
 *   price guide.
 * - HobbyCardIndex, CardOS, CardSight, TickerMint, tcgfast: a key, a paid
 *   plan, or a licence that does not allow this public app. Not signed up for.
 *
 * A sale sample denominated in another currency is not stored, even when OP
 * Box Index also prints a USD equivalent. Their own methodology keeps
 * non-USD sales out of dollar totals.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const GRADED_FIELDS = [
  'psa9_usd', 'psa9_as_of', 'psa9_source', 'psa9_url', 'psa9_printing',
  'psa10_usd', 'psa10_as_of', 'psa10_source', 'psa10_url', 'psa10_printing',
]
export const SEED_FIELDS = [
  'set_code', 'set_name', 'card_number', 'name', 'rarity', 'language', 'image_url', 'market_usd', 'as_of', 'variant',
  ...GRADED_FIELDS,
]
export const OPBOX_SOURCE = 'opboxindex'
export const OPBOX_CARDS_URL = 'https://opboxindex.com/opbox-ai-cards.json'
const OPBOX_UA = 'Piecebook/1.0 (+https://github.com/najibjuraimi-glitch/piecebook)'
const LIST_DELAY_MS = 400

/** Japanese-edition lists linked from https://opboxindex.com/free-data.html */
export function opboxListSets() {
  const sets = []
  for (let i = 1; i <= 17; i++) sets.push(`OP-${String(i).padStart(2, '0')}`)
  for (let i = 1; i <= 4; i++) sets.push(`EB-${String(i).padStart(2, '0')}`)
  for (let i = 1; i <= 2; i++) sets.push(`PRB-${String(i).padStart(2, '0')}`)
  return sets
}

export function opboxListUrl(setCode) {
  return `https://opboxindex.com/sets/${setCode.toLowerCase()}-card-list.json`
}

const PRINTING_BY_EDITION = { Japanese: 'japanese', English: 'english' }

export function emptyGraded() {
  return Object.fromEntries(GRADED_FIELDS.map((f) => [f, '']))
}

export function carryGraded(prev) {
  const out = {}
  for (const f of GRADED_FIELDS) out[f] = prev?.[f] ?? ''
  return out
}

export function piecebookPrintId(opboxId) {
  const m = /^([A-Z0-9]+-\d+)(?:_p(\d+))?$/.exec(opboxId ?? '')
  if (!m) return null
  return m[2] ? `${m[1]}p${m[2]}` : m[1]
}

function normName(s) {
  return String(s ?? '').normalize('NFKC').replace(/[.\s'"’]/g, '').toLowerCase()
}

function slugOf(url) {
  return String(url ?? '').replace(/\/+$/, '').split('/').pop().replace(/\.html$/, '')
}

/** Variant class implied by the card-page slug. Unknown slugs agree with nothing. */
export function slugAgreesWithVariant(variant, url) {
  const slug = slugOf(url)
  const manga = slug.includes('manga')
  const sp = /(?:^|-)sp(?:-|$)/.test(slug)
  const box = slug.includes('box-topper')
  const alt = slug.includes('alternate-art') || slug.includes('super-alternate')
  const parallel = slug.includes('parallel')
  if (variant === 'Special Card') return sp && !manga
  if (variant === 'Manga Art') return manga && !sp
  if (variant === 'Alternate Art') return !manga && !sp && !box && (alt || parallel)
  if (variant === 'Full Art') return box && !manga && !sp
  if (!variant) return !manga && !sp && !box && !alt && !parallel
  return false
}

export function usdField(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  const cents = Math.round(n * 100)
  if (Math.abs(n * 100 - cents) > 1e-6) return null
  return (cents / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function normalizeUrl(url) {
  return String(url ?? '').replace(/\/+$/, '')
}

/**
 * @returns {{ ok: true, quote: { cardNumber, usd, asOf, url, printing } } | { ok: false, reason: string }}
 * reason "absent" means the list has no sold median. Callers do not log that.
 */
export function psa10Quote(listCard, { printing, seedRow, tracked }) {
  const psa = listCard?.psa10
  if (!psa || typeof psa !== 'object') return { ok: false, reason: 'absent' }
  const cardNumber = piecebookPrintId(listCard.id)
  if (!cardNumber) return { ok: false, reason: 'id' }
  if (!seedRow || seedRow.card_number !== cardNumber) return { ok: false, reason: 'absent' }
  if (psa.basis !== 'sold') return { ok: false, reason: 'basis' }
  if (!Number.isInteger(psa.n) || psa.n < 3) return { ok: false, reason: 'sample' }
  const usd = usdField(psa.usd)
  if (!usd) return { ok: false, reason: 'usd' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(psa.observedOn ?? '')) return { ok: false, reason: 'date' }
  const url = normalizeUrl(listCard.cardPage)
  if (!url.startsWith('https://opboxindex.com/cards/') || url.includes('?')) return { ok: false, reason: 'url' }
  if (seedRow.language !== 'EN') return { ok: false, reason: 'language' }
  if (seedRow.rarity !== listCard.rarity) return { ok: false, reason: 'rarity' }
  if (!normName(seedRow.name) || normName(seedRow.name) !== normName(listCard.nameEn)) return { ok: false, reason: 'name' }
  if (!slugAgreesWithVariant(seedRow.variant ?? '', url)) return { ok: false, reason: 'variant' }
  if (tracked) {
    // The card-page dataset names the sale currency. A KRW (or other) sample
    // with a USD equivalent is not a USD sold median.
    if (tracked.currency !== 'USD') return { ok: false, reason: 'currency' }
    if (tracked.sampleCollectedOn !== psa.observedOn) return { ok: false, reason: 'date' }
    if (Number(tracked.sampleSize) !== psa.n) return { ok: false, reason: 'sample' }
    if (usdField(Number(tracked.medianUsd)) !== usd) return { ok: false, reason: 'usd' }
  }
  return { ok: true, quote: { cardNumber, usd, asOf: psa.observedOn, url, printing } }
}

/**
 * Quotes for one set list. A print id that matches two rows, or two rows that
 * share a page, is dropped rather than assigned to either.
 */
export function quotesForSet(list, seedRows, trackedByUrl) {
  const printing = PRINTING_BY_EDITION[list?.edition]
  if (!printing) return { quotes: new Map(), skipped: [{ cardNumber: list?.set ?? '?', reason: 'edition' }] }
  const rows = seedRows.filter((r) => r.set_code === list.set)
  const byNumber = new Map(rows.map((r) => [r.card_number, r]))
  const skipped = []
  /** @type {Map<string, { quote: object } | { clash: true }>} */
  const found = new Map()
  const urls = new Map()
  for (const card of list.cards ?? []) {
    const id = piecebookPrintId(card?.id)
    const seedRow = id ? byNumber.get(id) : undefined
    const page = normalizeUrl(card?.cardPage)
    // No tracked row is fine: many prints are only on the set list. A page we
    // do track must agree on currency, sample and date.
    const tracked = trackedByUrl?.has(page) ? trackedByUrl.get(page) : null
    const result = psa10Quote(card, { printing, seedRow, tracked })
    if (!result.ok) {
      if (result.reason !== 'absent' && seedRow) skipped.push({ cardNumber: seedRow.card_number, reason: result.reason })
      continue
    }
    const { quote } = result
    const other = urls.get(quote.url)
    if (found.has(quote.cardNumber) || other) {
      found.set(quote.cardNumber, { clash: true })
      if (other) found.set(other, { clash: true })
      continue
    }
    found.set(quote.cardNumber, { quote })
    urls.set(quote.url, quote.cardNumber)
  }
  const quotes = new Map()
  for (const [cardNumber, entry] of found) {
    if (entry.clash || !entry.quote) skipped.push({ cardNumber, reason: 'clash' })
    else quotes.set(cardNumber, entry.quote)
  }
  return { quotes, skipped }
}

export function indexTrackedSales(doc) {
  const map = new Map()
  const pages = Array.isArray(doc?.pages) ? doc.pages : []
  for (const page of pages) {
    const url = normalizeUrl(page?.url)
    if (!url || !page?.psa10Sold) continue
    map.set(url, page.psa10Sold)
  }
  return map
}

function blankPsa10() {
  return { psa10_usd: '', psa10_as_of: '', psa10_source: '', psa10_url: '', psa10_printing: '' }
}

function fieldsFromQuote(quote) {
  return {
    psa10_usd: quote.usd,
    psa10_as_of: quote.asOf,
    psa10_source: OPBOX_SOURCE,
    psa10_url: quote.url,
    psa10_printing: quote.printing,
  }
}

/** Set PSA 10 from this set's quotes and clear it where the list has none. PSA 9 is left alone. */
export function applyPsa10(rows, quotes) {
  return rows.map((row) => {
    const quote = quotes.get(row.card_number)
    return { ...emptyGraded(), ...row, ...blankPsa10(), ...(quote ? fieldsFromQuote(quote) : {}) }
  })
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows, fields = SEED_FIELDS) {
  return [fields.join(','), ...rows.map((r) => fields.map((f) => csvCell(r[f])).join(','))].join('\n') + '\n'
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { header: '', rows: [] }
  const split = (line) => {
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') q = false
        else cur += ch
      } else if (ch === '"') q = true
      else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  }
  const header = lines[0]
  const keys = split(header)
  const rows = lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [keys[i], v])))
  return { header, rows }
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': OPBOX_UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

/**
 * Pull OP Box Index and write psa10_* onto the seed CSVs. PSA 9 is not filled.
 * A set whose list cannot be read keeps the PSA 10 columns it already has.
 */
export async function refreshGradedPrices({ dataDir, dry = false, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const files = readdirSync(dataDir).filter((f) => f.endsWith('-en-seed.csv')).sort()
  const tables = new Map()
  for (const f of files) {
    const disk = readFileSync(join(dataDir, f), 'utf8')
    const parsed = parseCsv(disk)
    tables.set(f, { disk, rows: parsed.rows.map((r) => ({ ...emptyGraded(), ...r })) })
  }
  const trackedDoc = await getJson(OPBOX_CARDS_URL, fetchImpl)
  const trackedByUrl = indexTrackedSales(trackedDoc)
  if (trackedByUrl.size === 0) throw new Error('opbox-ai-cards.json had no PSA 10 sales; graded columns left as they were')

  const quotesBySet = new Map()
  const skipped = []
  const failedSets = []
  for (const setCode of opboxListSets()) {
    await sleep(LIST_DELAY_MS)
    try {
      const list = await getJson(opboxListUrl(setCode), fetchImpl)
      if (list?.set !== setCode) throw new Error(`list set ${list?.set} is not ${setCode}`)
      const file = `${setCode.replace(/-/g, '').toLowerCase()}-en-seed.csv`
      const rows = tables.get(file)?.rows ?? []
      const { quotes, skipped: setSkips } = quotesForSet(list, rows, trackedByUrl)
      quotesBySet.set(setCode, quotes)
      skipped.push(...setSkips.map((s) => ({ ...s, setCode })))
    } catch (e) {
      failedSets.push(`${setCode}: ${e.message}`)
    }
  }

  let psa10 = 0
  const written = []
  for (const [file, table] of tables) {
    const setCode = table.rows[0]?.set_code
    const quotes = quotesBySet.get(setCode)
    const next = quotes ? applyPsa10(table.rows, quotes) : table.rows.map((r) => ({ ...emptyGraded(), ...r }))
    if (quotes) psa10 += next.filter((r) => r.psa10_usd !== '').length
    const text = toCsv(next)
    if (text !== table.disk) {
      written.push(file)
      if (!dry) writeFileSync(join(dataDir, file), text)
    }
    table.rows = next
  }
  const psa9 = [...tables.values()].flatMap((t) => t.rows).filter((r) => r.psa9_usd !== '').length
  return { psa10, psa9, skipped, failedSets, written }
}
