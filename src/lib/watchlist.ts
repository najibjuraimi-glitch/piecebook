/**
 * Target list. One row is a print and a grade Jib wants, with a price in S$.
 * Nothing here is seeded. A chase id such as CH-001 is not an item and is not
 * invented. The caller sends WL-xxxx rows when they have them.
 * The price is a fresh English stored quote for that print, then a manual
 * market figure Cards typed. Piecebook does not fetch PriceCharting. A
 * Japanese figure is never a value.
 */
import { NO_PRICE_YET } from './cardPrices'
import {
  httpsUrl,
  isEnglishStoredQuote,
  isStale,
  parseMoney,
  parseSheetDate,
  round2,
  type AlertMemory,
  type LegalGrade,
  type PriceQuote,
} from './boughtBook'
import { explainWatchCode, type PrintRow } from './printResolve'

export const WATCH_ID_RE = /^WL-\d{4,}$/
export const MAX_WATCH = 2000

export type WatchGrade = 'Raw' | 'PSA 9' | 'PSA 10'

export interface WatchItem {
  id: string
  code: string
  grade: WatchGrade
  targetSgd: number | null
  notes: string
  added: string
  /** Chase id such as CH-001. Null when the row was not given one. */
  externalId?: string | null
  /** Click-through only. Never fetched, never used as a price. */
  priceChartingUrl?: string | null
  /** Hand-entered SGD. Used when no fresh English quote exists for this print. */
  marketSgd?: number | null
  /** yyyy-mm-dd. A missing date makes the manual figure stale. */
  marketAsOf?: string | null
  /** Label shown with the manual figure, such as Cards. */
  marketSource?: string | null
  /** Click-through for the manual figure. Never fetched. */
  marketUrl?: string | null
}

export interface WatchDoc {
  revision: number
  items: WatchItem[]
  /** Next WL number. Stays above every id this book has assigned, including deleted ones. */
  next?: number
}

export interface ValuedWatchItem extends WatchItem {
  priceSgd: number | null
  source: string | null
  asOf: string | null
  url: string | null
  /** The words to show when there is no English price. Null when priceSgd is set. */
  priceLabel: typeof NO_PRICE_YET | null
  hit: boolean
  stale: boolean
}

export interface WatchHit {
  type: 'watchlist'
  id: string
  code: string
  grade: WatchGrade
  targetSgd: number
  priceSgd: number
  source: string
  asOf: string
  url: string | null
  stale: boolean
  previousLowSgd: number | null
  dismissed?: boolean
  firedAt?: string | null
  externalId?: string | null
  marketSgd?: number | null
  marketAsOf?: string | null
  marketSource?: string | null
  marketUrl?: string | null
}

export interface WatchFailure {
  ok: false
  status: number
  error: string
  detail?: string
  revision?: number
  candidates?: string[]
}

export function emptyWatch(): WatchDoc {
  return { revision: 0, items: [] }
}

function idNumber(id: string): number | null {
  const m = /^WL-(\d+)$/.exec(id)
  return m ? Number(m[1]) : null
}

/** One past the highest id still in the book, and one past every id this book has already assigned. */
export function highWater(doc: WatchDoc): number {
  let next = Number.isInteger(doc.next) && (doc.next as number) > 0 ? (doc.next as number) : 1
  for (const item of doc.items) {
    const n = idNumber(item.id)
    if (n != null) next = Math.max(next, n + 1)
  }
  return next
}

function formatWatchId(n: number): string {
  return `WL-${String(n).padStart(4, '0')}`
}

function canonicalGrade(grade: string): LegalGrade | null {
  if (grade === 'Raw') return 'raw'
  if (grade === 'PSA 9') return 'psa9'
  if (grade === 'PSA 10') return 'psa10'
  return null
}

export type QuoteFor = (code: string, grade: LegalGrade | null) => PriceQuote | null

function storedItem(item: WatchItem): WatchItem {
  return {
    ...item,
    externalId: item.externalId ?? null,
    priceChartingUrl: item.priceChartingUrl ?? null,
    marketSgd: item.marketSgd ?? null,
    marketAsOf: item.marketAsOf ?? null,
    marketSource: item.marketSource ?? null,
    marketUrl: item.marketUrl ?? null,
  }
}

/** A manual figure Cards typed. Undated counts as stale. Nothing here is fetched. */
function manualMarket(item: WatchItem): PriceQuote | null {
  const n = item.marketSgd
  if (n == null || !Number.isFinite(n) || n < 0) return null
  const asOf = item.marketAsOf && /^\d{4}-\d{2}-\d{2}$/.test(item.marketAsOf) ? item.marketAsOf : ''
  return {
    usd: null,
    sgd: round2(n),
    source: item.marketSource?.trim() || 'Manual',
    url: item.marketUrl ?? null,
    asOf,
    detail: asOf ? null : 'Undated',
  }
}

function chosenQuote(english: PriceQuote | null, manual: PriceQuote | null, today: string): PriceQuote | null {
  const freshEnglish = english && english.asOf && !isStale(english.asOf, today) ? english : null
  if (freshEnglish) return freshEnglish
  if (manual) return manual
  return english
}

export function valueWatchItem(item: WatchItem, quoteFor: QuoteFor, today: string): ValuedWatchItem {
  const grade = typeof item.grade === 'string' ? canonicalGrade(item.grade) : null
  const quoted = grade ? quoteFor(item.code, grade) : null
  const english = isEnglishStoredQuote(quoted) ? quoted : null
  const quote = chosenQuote(english, manualMarket(item), today)
  const stored = storedItem(item)
  if (!quote) {
    return { ...stored, priceSgd: null, source: null, asOf: null, url: null, priceLabel: NO_PRICE_YET, hit: false, stale: false }
  }
  const stale = quote.asOf ? isStale(quote.asOf, today) : true
  const hit = item.targetSgd != null && !stale && quote.sgd <= item.targetSgd
  return {
    ...stored,
    priceSgd: quote.sgd,
    source: quote.source,
    asOf: quote.asOf || null,
    url: quote.url,
    priceLabel: null,
    hit,
    stale,
  }
}

export function valueWatchItems(items: WatchItem[], quoteFor: QuoteFor, today: string): ValuedWatchItem[] {
  return items.map((item) => valueWatchItem(item, quoteFor, today))
}

/**
 * Fire when the English price is at or under the target.
 * The same price does not fire again. A strictly lower price does.
 */
export function watchAlertList(items: ValuedWatchItem[], memory: AlertMemory, includeDismissed = false): WatchHit[] {
  const hits: WatchHit[] = []
  for (const item of items) {
    if (item.priceSgd == null || item.targetSgd == null || !item.source || !item.asOf || item.stale) continue
    if (item.priceSgd > item.targetSgd) continue
    const prev = memory[item.id]
    const dismissed = prev != null && item.priceSgd >= prev
    if (dismissed && !includeDismissed) continue
    hits.push({
      type: 'watchlist',
      id: item.id,
      code: item.code,
      grade: item.grade,
      targetSgd: item.targetSgd,
      priceSgd: item.priceSgd,
      source: item.source,
      asOf: item.asOf,
      url: item.url,
      stale: false,
      previousLowSgd: prev ?? null,
      dismissed,
      externalId: item.externalId ?? null,
      marketSgd: item.marketSgd ?? null,
      marketAsOf: item.marketAsOf ?? null,
      marketSource: item.marketSource ?? null,
      marketUrl: item.marketUrl ?? null,
    })
  }
  return hits
}

export function freshWatchHits(items: ValuedWatchItem[], memory: AlertMemory): WatchHit[] {
  const hits: WatchHit[] = []
  for (const item of items) {
    if (!item.hit || item.stale || item.priceSgd == null || item.targetSgd == null || !item.source || !item.asOf) continue
    const prev = memory[item.id]
    if (prev == null || item.priceSgd < prev) {
      hits.push({
        type: 'watchlist',
        id: item.id,
        code: item.code,
        grade: item.grade,
        targetSgd: item.targetSgd,
        priceSgd: item.priceSgd,
        source: item.source,
        asOf: item.asOf,
        url: item.url,
        stale: item.stale,
        previousLowSgd: prev ?? null,
        dismissed: false,
        externalId: item.externalId ?? null,
        marketSgd: item.marketSgd ?? null,
        marketAsOf: item.marketAsOf ?? null,
        marketSource: item.marketSource ?? null,
        marketUrl: item.marketUrl ?? null,
      })
    }
  }
  return hits
}

export function dismissWatchHits(memory: AlertMemory, hits: WatchHit[]): AlertMemory {
  const next: AlertMemory = { ...memory }
  for (const hit of hits) {
    const prev = next[hit.id]
    next[hit.id] = prev == null ? hit.priceSgd : Math.min(prev, hit.priceSgd)
  }
  return next
}

function fail(status: number, error: string, detail?: string, revision?: number, candidates?: string[]): WatchFailure {
  return {
    ok: false,
    status,
    error,
    ...(detail ? { detail } : {}),
    ...(revision != null ? { revision } : {}),
    ...(candidates ? { candidates } : {}),
  }
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  return body as Record<string, unknown>
}

function isFail(v: unknown): v is WatchFailure {
  return Boolean(v && typeof v === 'object' && 'ok' in v && (v as WatchFailure).ok === false)
}

function checkRevision(doc: WatchDoc, body: Record<string, unknown>): WatchFailure | null {
  if (typeof body.revision !== 'number' || !Number.isInteger(body.revision)) return fail(400, 'bad_revision')
  if (body.revision !== doc.revision) return fail(409, 'revision_conflict', undefined, doc.revision)
  return null
}

function readCode(value: unknown): string | WatchFailure {
  if (typeof value !== 'string') return fail(400, 'bad_field', 'code')
  const code = value.trim()
  if (!code || code.length > 40) return fail(400, 'bad_field', 'code')
  return code
}

function readGrade(value: unknown): WatchGrade | WatchFailure {
  if (typeof value !== 'string') return fail(400, 'bad_field', 'grade')
  const s = value.trim().toLowerCase().replace(/\s+/g, ' ')
  if (s === 'raw') return 'Raw'
  if (s === 'psa 9' || s === 'psa9') return 'PSA 9'
  if (s === 'psa 10' || s === 'psa10') return 'PSA 10'
  return fail(400, 'bad_field', 'grade')
}

function readTarget(value: unknown): number | null | WatchFailure {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseMoney(value) : null
  if (n == null || !Number.isFinite(n) || n < 0) return fail(400, 'bad_field', 'targetSgd')
  return round2(n)
}

function readExternalId(value: unknown): string | null | WatchFailure {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return fail(400, 'bad_field', 'externalId')
  const id = value.trim().toUpperCase()
  if (!/^CH-\d{3,}$/.test(id)) return fail(400, 'bad_field', 'externalId')
  return id
}

function readLink(value: unknown, key: string): string | null | WatchFailure {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return fail(400, 'bad_field', key)
  const url = httpsUrl(value)
  if (!url || url.length > 400) return fail(400, 'bad_url')
  return url
}

function readMarketSgd(value: unknown): number | null | WatchFailure {
  if (value == null || value === '') return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fail(400, 'bad_field', 'marketSgd')
  return round2(value)
}

function readMarketAsOf(value: unknown): string | null | WatchFailure {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return fail(400, 'bad_date', 'marketAsOf')
  return value.trim()
}

function readMarketSource(value: unknown): string | null | WatchFailure {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return fail(400, 'bad_field', 'marketSource')
  const source = value.trim()
  if (!source || source.length > 80) return fail(400, 'bad_field', 'marketSource')
  return source
}

function readNotes(value: unknown): string | WatchFailure {
  if (value == null || value === '') return ''
  if (typeof value !== 'string') return fail(400, 'bad_field', 'notes')
  const notes = value.trim()
  if (notes.length > 500) return fail(400, 'bad_field', 'notes')
  return notes
}

function readAdded(value: unknown, today: string): string | WatchFailure {
  if (value == null || value === '') return today
  if (typeof value !== 'string') return fail(400, 'bad_field', 'added')
  const parsed = parseSheetDate(value.trim())
  if (!parsed) return fail(400, 'bad_date', 'added')
  return parsed
}

function applyItem(base: WatchItem, body: Record<string, unknown>, today: string, keys: string[]): WatchItem | WatchFailure {
  const next: WatchItem = { ...base }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue
    const value = body[key]
    if (key === 'code') {
      const code = readCode(value)
      if (isFail(code)) return code
      next.code = code
    } else if (key === 'grade') {
      const grade = readGrade(value)
      if (isFail(grade)) return grade
      next.grade = grade
    } else if (key === 'targetSgd') {
      const target = readTarget(value)
      if (isFail(target)) return target
      next.targetSgd = target
    } else if (key === 'notes') {
      const notes = readNotes(value)
      if (isFail(notes)) return notes
      next.notes = notes
    } else if (key === 'externalId') {
      const externalId = readExternalId(value)
      if (isFail(externalId)) return externalId
      next.externalId = externalId
    } else if (key === 'priceChartingUrl') {
      const url = readLink(value, 'priceChartingUrl')
      if (isFail(url)) return url
      next.priceChartingUrl = url
    } else if (key === 'marketSgd') {
      const marketSgd = readMarketSgd(value)
      if (isFail(marketSgd)) return marketSgd
      next.marketSgd = marketSgd
    } else if (key === 'marketAsOf') {
      const marketAsOf = readMarketAsOf(value)
      if (isFail(marketAsOf)) return marketAsOf
      next.marketAsOf = marketAsOf
    } else if (key === 'marketSource') {
      const marketSource = readMarketSource(value)
      if (isFail(marketSource)) return marketSource
      next.marketSource = marketSource
    } else if (key === 'marketUrl') {
      const marketUrl = readLink(value, 'marketUrl')
      if (isFail(marketUrl)) return marketUrl
      next.marketUrl = marketUrl
    } else if (key === 'added') {
      const added = readAdded(value, today)
      if (isFail(added)) return added
      next.added = added
    }
  }
  return next
}

const WRITE_KEYS = ['code', 'grade', 'targetSgd', 'notes', 'added', 'externalId', 'priceChartingUrl', 'marketSgd', 'marketAsOf', 'marketSource', 'marketUrl']
const PRICE_KEYS = ['marketSgd', 'marketAsOf', 'marketSource', 'marketUrl'] as const

export function createWatchItem(
  doc: WatchDoc,
  body: unknown,
  today: string,
  prints: PrintRow[] = [],
): { ok: true; doc: WatchDoc; item: WatchItem } | WatchFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  const rev = checkRevision(doc, raw)
  if (rev) return rev
  if (doc.items.length >= MAX_WATCH) return fail(400, 'too_many_rows')
  let id = formatWatchId(highWater(doc))
  if (Object.prototype.hasOwnProperty.call(raw, 'id') && raw.id != null && raw.id !== '') {
    if (typeof raw.id !== 'string' || !WATCH_ID_RE.test(raw.id.trim())) return fail(400, 'bad_id')
    id = raw.id.trim()
  }
  if (doc.items.some((item) => item.id === id)) return fail(409, 'duplicate_id', id)
  const applied = applyItem(
    {
      id,
      code: '',
      grade: 'Raw',
      targetSgd: null,
      notes: '',
      added: today,
      externalId: null,
      priceChartingUrl: null,
      marketSgd: null,
      marketAsOf: null,
      marketSource: null,
      marketUrl: null,
    },
    raw,
    today,
    WRITE_KEYS,
  )
  if (isFail(applied)) return applied
  if (!applied.code) return fail(400, 'bad_field', 'code')
  if (!Object.prototype.hasOwnProperty.call(raw, 'grade')) return fail(400, 'bad_field', 'grade')
  if (prints.length) {
    const named = explainWatchCode(applied.code, prints)
    if (!named.ok) return fail(400, named.error, named.detail, undefined, named.candidates)
    applied.code = named.print.cardNumber
  }
  if (doc.items.some((item) => item.code.toUpperCase() === applied.code.toUpperCase() && item.grade === applied.grade)) {
    return fail(409, 'duplicate_print', `${applied.code} ${applied.grade}`)
  }
  if (applied.externalId && doc.items.some((item) => item.externalId === applied.externalId)) {
    return fail(409, 'duplicate_external_id', applied.externalId)
  }
  const used = idNumber(id) ?? highWater(doc) - 1
  return { ok: true, doc: { revision: doc.revision + 1, next: Math.max(highWater(doc), used + 1), items: [...doc.items, applied] }, item: applied }
}

export function patchWatchItem(
  doc: WatchDoc,
  id: string,
  body: unknown,
  today: string,
  prints: PrintRow[] = [],
): { ok: true; doc: WatchDoc; item: WatchItem } | WatchFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  const rev = checkRevision(doc, raw)
  if (rev) return rev
  const idx = doc.items.findIndex((item) => item.id === id)
  if (idx < 0) return fail(404, 'not_found')
  let applied = applyItem(doc.items[idx], raw, today, WRITE_KEYS)
  if (isFail(applied)) return applied
  if (!applied.code) return fail(400, 'bad_field', 'code')
  if (prints.length) {
    const named = explainWatchCode(applied.code, prints)
    if (!named.ok) return fail(400, named.error, named.detail, undefined, named.candidates)
    applied = { ...applied, code: named.print.cardNumber }
  }
  if (doc.items.some((item, i) => i !== idx && item.code.toUpperCase() === applied.code.toUpperCase() && item.grade === applied.grade)) {
    return fail(409, 'duplicate_print', `${applied.code} ${applied.grade}`)
  }
  if (applied.externalId && doc.items.some((item, i) => i !== idx && item.externalId === applied.externalId)) {
    return fail(409, 'duplicate_external_id', applied.externalId)
  }
  const items = doc.items.slice()
  items[idx] = { ...applied, id }
  return { ok: true, doc: { revision: doc.revision + 1, next: highWater(doc), items }, item: items[idx] }
}

/** One call sets the four manual price fields. Same revision check as PATCH. */
export function setWatchPrice(
  doc: WatchDoc,
  id: string,
  body: unknown,
  today: string,
): { ok: true; doc: WatchDoc; item: WatchItem } | WatchFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  for (const key of PRICE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) return fail(400, 'bad_field', key)
  }
  return patchWatchItem(doc, id, raw, today)
}

export function deleteWatchItem(doc: WatchDoc, id: string, body: unknown): { ok: true; doc: WatchDoc } | WatchFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  const rev = checkRevision(doc, raw)
  if (rev) return rev
  if (!doc.items.some((item) => item.id === id)) return fail(404, 'not_found')
  return { ok: true, doc: { revision: doc.revision + 1, next: highWater(doc), items: doc.items.filter((item) => item.id !== id) } }
}
