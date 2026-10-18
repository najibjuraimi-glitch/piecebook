/**
 * Target list. One row is a print and a grade Jib wants, with a price in S$.
 * Nothing here is seeded. A chase id such as CH-001 is not an item and is not
 * invented. The caller sends WL-xxxx rows when they have them.
 * The price is an English stored quote. A Japanese figure is never a value.
 */
import { NO_PRICE_YET } from './cardPrices'
import {
  isStale,
  legalGrade,
  parseMoney,
  parseSheetDate,
  round2,
  type AlertMemory,
  type LegalGrade,
  type PriceQuote,
} from './boughtBook'

export const WATCH_ID_RE = /^WL-\d{4,}$/
export const MAX_WATCH = 2000

export type WatchGrade = 'Raw' | 'PSA 9' | 'PSA 10'

export interface WatchItem {
  id: string
  code: string
  grade: WatchGrade
  targetSgd: number
  notes: string
  added: string
}

export interface WatchDoc {
  revision: number
  items: WatchItem[]
}

export interface ValuedWatchItem extends WatchItem {
  priceSgd: number | null
  source: string | null
  asOf: string | null
  /** The words to show when there is no English price. Null when priceSgd is set. */
  priceLabel: typeof NO_PRICE_YET | null
  hit: boolean
  stale: boolean
}

export interface WatchHit {
  id: string
  code: string
  grade: WatchGrade
  targetSgd: number
  priceSgd: number
  source: string
  asOf: string
  stale: boolean
  previousLowSgd: number | null
}

export interface WatchFailure {
  ok: false
  status: number
  error: string
  detail?: string
  revision?: number
}

const GRADE_LABEL: Record<LegalGrade, WatchGrade> = {
  raw: 'Raw',
  psa9: 'PSA 9',
  psa10: 'PSA 10',
}

export function emptyWatch(): WatchDoc {
  return { revision: 0, items: [] }
}

export function nextWatchId(items: { id: string }[]): string {
  let max = 0
  for (const item of items) {
    const m = /^WL-(\d+)$/.exec(item.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `WL-${String(max + 1).padStart(4, '0')}`
}

export type QuoteFor = (code: string, grade: LegalGrade | null) => PriceQuote | null

export function valueWatchItem(item: WatchItem, quoteFor: QuoteFor, today: string): ValuedWatchItem {
  const quote = quoteFor(item.code, legalGrade(item.grade))
  if (!quote) {
    return { ...item, priceSgd: null, source: null, asOf: null, priceLabel: NO_PRICE_YET, hit: false, stale: false }
  }
  const stale = quote.asOf ? isStale(quote.asOf, today) : true
  return {
    ...item,
    priceSgd: quote.sgd,
    source: quote.source,
    asOf: quote.asOf,
    priceLabel: null,
    hit: quote.sgd <= item.targetSgd,
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
export function freshWatchHits(items: ValuedWatchItem[], memory: AlertMemory): WatchHit[] {
  const hits: WatchHit[] = []
  for (const item of items) {
    if (!item.hit || item.priceSgd == null || !item.source || !item.asOf) continue
    const prev = memory[item.id]
    if (prev == null || item.priceSgd < prev) {
      hits.push({
        id: item.id,
        code: item.code,
        grade: item.grade,
        targetSgd: item.targetSgd,
        priceSgd: item.priceSgd,
        source: item.source,
        asOf: item.asOf,
        stale: item.stale,
        previousLowSgd: prev ?? null,
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

function fail(status: number, error: string, detail?: string, revision?: number): WatchFailure {
  return { ok: false, status, error, ...(detail ? { detail } : {}), ...(revision != null ? { revision } : {}) }
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
  const grade = legalGrade(value)
  if (!grade) return fail(400, 'bad_field', 'grade')
  return GRADE_LABEL[grade]
}

function readTarget(value: unknown): number | WatchFailure {
  if (value == null || value === '') return fail(400, 'bad_field', 'targetSgd')
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseMoney(value) : null
  if (n == null || !Number.isFinite(n) || n < 0) return fail(400, 'bad_field', 'targetSgd')
  return round2(n)
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
    } else if (key === 'added') {
      const added = readAdded(value, today)
      if (isFail(added)) return added
      next.added = added
    }
  }
  return next
}

const WRITE_KEYS = ['code', 'grade', 'targetSgd', 'notes', 'added']

export function createWatchItem(
  doc: WatchDoc,
  body: unknown,
  today: string,
): { ok: true; doc: WatchDoc; item: WatchItem } | WatchFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  const rev = checkRevision(doc, raw)
  if (rev) return rev
  if (doc.items.length >= MAX_WATCH) return fail(400, 'too_many_rows')
  let id = nextWatchId(doc.items)
  if (Object.prototype.hasOwnProperty.call(raw, 'id') && raw.id != null && raw.id !== '') {
    if (typeof raw.id !== 'string' || !WATCH_ID_RE.test(raw.id.trim())) return fail(400, 'bad_id')
    id = raw.id.trim()
  }
  if (doc.items.some((item) => item.id === id)) return fail(409, 'duplicate_id', id)
  const applied = applyItem({ id, code: '', grade: 'Raw', targetSgd: 0, notes: '', added: today }, raw, today, WRITE_KEYS)
  if (isFail(applied)) return applied
  if (!applied.code) return fail(400, 'bad_field', 'code')
  if (!Object.prototype.hasOwnProperty.call(raw, 'grade')) return fail(400, 'bad_field', 'grade')
  if (!Object.prototype.hasOwnProperty.call(raw, 'targetSgd')) return fail(400, 'bad_field', 'targetSgd')
  return { ok: true, doc: { revision: doc.revision + 1, items: [...doc.items, applied] }, item: applied }
}

export function patchWatchItem(
  doc: WatchDoc,
  id: string,
  body: unknown,
  today: string,
): { ok: true; doc: WatchDoc; item: WatchItem } | WatchFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  const rev = checkRevision(doc, raw)
  if (rev) return rev
  const idx = doc.items.findIndex((item) => item.id === id)
  if (idx < 0) return fail(404, 'not_found')
  const applied = applyItem(doc.items[idx], raw, today, WRITE_KEYS)
  if (isFail(applied)) return applied
  if (!applied.code) return fail(400, 'bad_field', 'code')
  const items = doc.items.slice()
  items[idx] = { ...applied, id }
  return { ok: true, doc: { revision: doc.revision + 1, items }, item: items[idx] }
}

export function deleteWatchItem(doc: WatchDoc, id: string, body: unknown): { ok: true; doc: WatchDoc } | WatchFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  const rev = checkRevision(doc, raw)
  if (rev) return rev
  if (!doc.items.some((item) => item.id === id)) return fail(404, 'not_found')
  return { ok: true, doc: { revision: doc.revision + 1, items: doc.items.filter((item) => item.id !== id) } }
}
