/**
 * Holdings are Piecebook's own rows: one physical copy, stable Row ID.
 * The Google Sheet is not read. A Bought-tab CSV can be imported once.
 * Valuation (English stored price, then the manual figure) lives in boughtBook.
 */
import { parseCsv } from '../data/csv'
import {
  copyStatus,
  httpsUrl,
  legalGrade,
  parseBoughtMatrix,
  parseMoney,
  parseSheetDate,
  round2,
  type BoughtCopy,
  type CopyStatus,
  type SnapshotView,
} from './boughtBook'

export const ROW_ID_RE = /^OPB-\d{4,}$/
export const MAX_HOLDINGS = 2000

export type StatusLabel = 'Held' | 'Listed' | 'Sold'

export interface Holding {
  rowId: string
  date: string | null
  card: string
  code: string
  grade: string
  where: string
  paidSgd: number | null
  gstSgd: number | null
  forwardingSgd: number | null
  allInSgd: number | null
  marketValueSgd: number | null
  marketSource: string
  marketAsOf: string | null
  notes: string
  priceChartingUrl: string | null
  exactPrint: string | null
  status: StatusLabel
  soldDate: string | null
  soldPrice: number | null
  currency: string
  saleFx: number | null
  channel: string
  feesSgd: number | null
  shippingOutSgd: number | null
  netSgd: number | null
  realizedSgd: number | null
}

export interface HoldingsDoc {
  revision: number
  copies: Holding[]
}

export interface HoldingFailure {
  ok: false
  status: number
  error: string
  detail?: string
  revision?: number
}

export function emptyHoldings(): HoldingsDoc {
  return { revision: 0, copies: [] }
}

export function statusLabel(status: CopyStatus): StatusLabel {
  if (status === 'sold') return 'Sold'
  if (status === 'listed') return 'Listed'
  return 'Held'
}

export function nextRowId(copies: { rowId: string }[]): string {
  let max = 0
  for (const copy of copies) {
    const m = /^OPB-(\d+)$/.exec(copy.rowId)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `OPB-${String(max + 1).padStart(4, '0')}`
}

export function holdingFromBought(copy: BoughtCopy): Holding {
  return {
    rowId: copy.rowId,
    date: copy.date,
    card: copy.cardName,
    code: copy.code,
    grade: copy.gradeText,
    where: copy.seller,
    paidSgd: copy.paidSgd,
    gstSgd: copy.gstSgd,
    forwardingSgd: copy.forwardingSgd,
    allInSgd: copy.allInSgd,
    marketValueSgd: copy.manualMarketSgd,
    marketSource: copy.manualSource,
    marketAsOf: copy.manualAsOf,
    notes: copy.notes,
    priceChartingUrl: copy.priceChartingUrl,
    exactPrint: copy.exactPrint?.trim() || null,
    status: statusLabel(copy.status),
    soldDate: copy.soldDate,
    soldPrice: copy.soldPrice,
    currency: copy.soldCurrency,
    saleFx: copy.saleFx,
    channel: copy.channel,
    feesSgd: copy.feesSgd,
    shippingOutSgd: copy.shippingOutSgd,
    netSgd: copy.netSgd,
    realizedSgd: copy.realizedSgd,
  }
}

export function boughtCopyFromHolding(h: Holding): BoughtCopy {
  const status = copyStatus(h.status)
  return {
    rowId: h.rowId,
    date: h.date,
    dateLabel: h.date ?? '',
    cardName: h.card,
    code: h.code,
    gradeText: h.grade,
    grade: legalGrade(h.grade),
    seller: h.where,
    paidSgd: h.paidSgd,
    gstSgd: h.gstSgd,
    forwardingSgd: h.forwardingSgd,
    allInSgd: h.allInSgd,
    manualMarketSgd: h.marketValueSgd,
    manualSource: h.marketSource,
    manualAsOf: h.marketAsOf,
    notes: h.notes,
    priceChartingUrl: h.priceChartingUrl,
    exactPrint: h.exactPrint,
    status,
    statusText: h.status,
    soldDate: h.soldDate,
    soldDateLabel: h.soldDate ?? '',
    soldPrice: h.soldPrice,
    soldCurrency: h.currency,
    saleFx: h.saleFx,
    channel: h.channel,
    feesSgd: h.feesSgd,
    shippingOutSgd: h.shippingOutSgd,
    netSgd: h.netSgd,
    realizedSgd: status === 'sold' ? h.realizedSgd : null,
  }
}

function blankHolding(rowId: string): Holding {
  return {
    rowId,
    date: null,
    card: '',
    code: '',
    grade: '',
    where: '',
    paidSgd: null,
    gstSgd: null,
    forwardingSgd: null,
    allInSgd: null,
    marketValueSgd: null,
    marketSource: '',
    marketAsOf: null,
    notes: '',
    priceChartingUrl: null,
    exactPrint: null,
    status: 'Held',
    soldDate: null,
    soldPrice: null,
    currency: '',
    saleFx: null,
    channel: '',
    feesSgd: null,
    shippingOutSgd: null,
    netSgd: null,
    realizedSgd: null,
  }
}

const TEXT: Record<string, number> = {
  card: 120,
  code: 40,
  grade: 40,
  where: 120,
  notes: 500,
  marketSource: 80,
  channel: 80,
  currency: 8,
}

const MONEY = [
  'paidSgd',
  'gstSgd',
  'forwardingSgd',
  'allInSgd',
  'marketValueSgd',
  'soldPrice',
  'saleFx',
  'feesSgd',
  'shippingOutSgd',
  'netSgd',
  'realizedSgd',
] as const

type MoneyKey = (typeof MONEY)[number]

const DATE_FIELDS = ['date', 'marketAsOf', 'soldDate'] as const

function fail(status: number, error: string, detail?: string, revision?: number): HoldingFailure {
  return { ok: false, status, error, ...(detail ? { detail } : {}), ...(revision != null ? { revision } : {}) }
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  return body as Record<string, unknown>
}

function readText(value: unknown, max: number): string | HoldingFailure {
  if (value == null) return ''
  if (typeof value !== 'string') return fail(400, 'bad_field')
  const t = value.trim()
  if (t.length > max) return fail(400, 'bad_field')
  return t
}

function readMoney(value: unknown, key: MoneyKey): number | null | HoldingFailure {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseMoney(value) : null
  if (n == null || !Number.isFinite(n)) return fail(400, 'bad_field', key)
  if (key === 'saleFx') {
    if (n <= 0) return fail(400, 'bad_field', key)
    return n
  }
  if (key !== 'netSgd' && key !== 'realizedSgd' && n < 0) return fail(400, 'bad_field', key)
  return round2(n)
}

function readDate(value: unknown, key: string): string | null | HoldingFailure {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return fail(400, 'bad_field', key)
  const parsed = parseSheetDate(value.trim())
  if (!parsed) return fail(400, 'bad_date', key)
  return parsed
}

function readStatus(value: unknown): StatusLabel | HoldingFailure {
  if (value == null || value === '') return 'Held'
  if (typeof value !== 'string') return fail(400, 'bad_field', 'status')
  const s = value.trim().toLowerCase()
  if (s === 'held') return 'Held'
  if (s === 'listed') return 'Listed'
  if (s === 'sold') return 'Sold'
  return fail(400, 'bad_field', 'status')
}

function isFail(v: unknown): v is HoldingFailure {
  return Boolean(v && typeof v === 'object' && 'ok' in v && (v as HoldingFailure).ok === false)
}

function applyFields(base: Holding, body: Record<string, unknown>, keys: string[]): Holding | HoldingFailure {
  const next: Holding = { ...base }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue
    const value = body[key]
    if (key in TEXT) {
      const text = readText(value, TEXT[key])
      if (isFail(text)) return { ...text, detail: text.detail || key }
      if (key === 'currency') next.currency = text.toUpperCase()
      else (next as unknown as Record<string, unknown>)[key] = text
      continue
    }
    if ((MONEY as readonly string[]).includes(key)) {
      const money = readMoney(value, key as MoneyKey)
      if (isFail(money)) return money
      ;(next as unknown as Record<string, unknown>)[key] = money
      continue
    }
    if ((DATE_FIELDS as readonly string[]).includes(key)) {
      const date = readDate(value, key)
      if (isFail(date)) return date
      ;(next as unknown as Record<string, unknown>)[key] = date
      continue
    }
    if (key === 'status') {
      const status = readStatus(value)
      if (isFail(status)) return status
      next.status = status
      continue
    }
    if (key === 'exactPrint') {
      if (value == null || value === '') {
        next.exactPrint = null
        continue
      }
      if (typeof value !== 'string' || !/^[A-Za-z]{1,4}\d{0,3}-\d{3}(?:[pP]\d+)?$/.test(value.trim())) return fail(400, 'bad_field', key)
      next.exactPrint = value.trim().toUpperCase().replace(/P(\d+)$/, 'p$1')
      continue
    }
    if (key === 'priceChartingUrl') {
      if (value == null || value === '') {
        next.priceChartingUrl = null
        continue
      }
      if (typeof value !== 'string') return fail(400, 'bad_field', key)
      const url = httpsUrl(value)
      if (!url || url.length > 400) return fail(400, 'bad_url')
      next.priceChartingUrl = url
    }
  }
  return next
}

const WRITE_KEYS = [
  'date',
  'card',
  'code',
  'grade',
  'where',
  'paidSgd',
  'gstSgd',
  'forwardingSgd',
  'allInSgd',
  'marketValueSgd',
  'marketSource',
  'marketAsOf',
  'notes',
  'priceChartingUrl',
  'exactPrint',
  'status',
  'soldDate',
  'soldPrice',
  'currency',
  'saleFx',
  'channel',
  'feesSgd',
  'shippingOutSgd',
  'netSgd',
  'realizedSgd',
]

function checkRevision(doc: HoldingsDoc, body: Record<string, unknown>): HoldingFailure | null {
  if (typeof body.revision !== 'number' || !Number.isInteger(body.revision)) return fail(400, 'bad_revision')
  if (body.revision !== doc.revision) return fail(409, 'revision_conflict', undefined, doc.revision)
  return null
}

function finish(h: Holding): Holding | HoldingFailure {
  if (!h.card && !h.code) return fail(400, 'bad_field', 'card')
  if (h.marketValueSgd == null) {
    h = { ...h, marketSource: h.marketSource, marketAsOf: null }
  }
  if (h.status !== 'Sold') {
    return {
      ...h,
      soldDate: null,
      soldPrice: null,
      currency: '',
      saleFx: null,
      channel: '',
      feesSgd: null,
      shippingOutSgd: null,
      netSgd: null,
      realizedSgd: null,
    }
  }
  return fillSale(h)
}

/** Net and realized stay as written. A blank net is price minus fees and shipping, in S$. */
export function fillSale(h: Holding): Holding {
  let net = h.netSgd
  if (net == null && h.soldPrice != null) {
    const fees = h.feesSgd ?? 0
    const ship = h.shippingOutSgd ?? 0
    const cur = h.currency.toUpperCase()
    if (cur === '' || cur === 'SGD') net = round2(h.soldPrice - fees - ship)
    else if (h.saleFx != null) net = round2(h.soldPrice * h.saleFx - fees - ship)
  }
  let realized = h.realizedSgd
  if (realized == null && net != null && h.allInSgd != null) realized = round2(net - h.allInSgd)
  return { ...h, status: 'Sold', currency: h.currency.toUpperCase(), netSgd: net, realizedSgd: realized }
}

function sumParts(h: Holding): number | null {
  const xs = [h.paidSgd, h.gstSgd, h.forwardingSgd].filter((n): n is number => n != null)
  if (xs.length === 0) return null
  return round2(xs.reduce((a, b) => a + b, 0))
}

export function createHolding(doc: HoldingsDoc, body: unknown): { ok: true; doc: HoldingsDoc; copy: Holding } | HoldingFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  const rev = checkRevision(doc, raw)
  if (rev) return rev
  if (doc.copies.length >= MAX_HOLDINGS) return fail(400, 'too_many_rows')
  let rowId = nextRowId(doc.copies)
  if (Object.prototype.hasOwnProperty.call(raw, 'rowId') && raw.rowId != null && raw.rowId !== '') {
    if (typeof raw.rowId !== 'string' || !ROW_ID_RE.test(raw.rowId.trim())) return fail(400, 'bad_row_id')
    rowId = raw.rowId.trim()
  }
  if (doc.copies.some((c) => c.rowId === rowId)) return fail(409, 'duplicate_row', rowId)
  const applied = applyFields(blankHolding(rowId), raw, WRITE_KEYS)
  if (isFail(applied)) return applied
  let copy = applied
  if (!Object.prototype.hasOwnProperty.call(raw, 'allInSgd') || raw.allInSgd == null || raw.allInSgd === '') {
    const sum = sumParts(copy)
    if (sum != null && copy.allInSgd == null) copy = { ...copy, allInSgd: sum }
  }
  const done = finish(copy)
  if (isFail(done)) return done
  return { ok: true, doc: { revision: doc.revision + 1, copies: [...doc.copies, done] }, copy: done }
}

export function patchHolding(
  doc: HoldingsDoc,
  rowId: string,
  body: unknown,
): { ok: true; doc: HoldingsDoc; copy: Holding } | HoldingFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  const rev = checkRevision(doc, raw)
  if (rev) return rev
  const idx = doc.copies.findIndex((c) => c.rowId === rowId)
  if (idx < 0) return fail(404, 'not_found')
  const applied = applyFields(doc.copies[idx], raw, WRITE_KEYS)
  if (isFail(applied)) return applied
  const done = finish({ ...applied, rowId })
  if (isFail(done)) return done
  const copies = doc.copies.slice()
  copies[idx] = done
  return { ok: true, doc: { revision: doc.revision + 1, copies }, copy: done }
}

const SALE_KEYS = ['soldDate', 'soldPrice', 'currency', 'saleFx', 'channel', 'feesSgd', 'shippingOutSgd', 'netSgd', 'realizedSgd']

export function deleteHolding(
  doc: HoldingsDoc,
  rowId: string,
  body: unknown,
): { ok: true; doc: HoldingsDoc } | HoldingFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  const rev = checkRevision(doc, raw)
  if (rev) return rev
  if (!doc.copies.some((copy) => copy.rowId === rowId)) return fail(404, 'not_found')
  return { ok: true, doc: { revision: doc.revision + 1, copies: doc.copies.filter((copy) => copy.rowId !== rowId) } }
}

export function markSold(
  doc: HoldingsDoc,
  rowId: string,
  body: unknown,
): { ok: true; doc: HoldingsDoc; copy: Holding } | HoldingFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  return patchHolding(doc, rowId, { ...raw, status: 'Sold' })
}

export function importHoldings(
  csv: string,
  doc: HoldingsDoc,
  replace: boolean,
  revision: unknown,
): { ok: true; doc: HoldingsDoc; imported: number; skipped: number } | HoldingFailure {
  if (typeof revision !== 'number' || !Number.isInteger(revision)) return fail(400, 'bad_revision')
  if (revision !== doc.revision) return fail(409, 'revision_conflict', undefined, doc.revision)
  if (doc.copies.length > 0 && !replace) return fail(409, 'already_imported', undefined, doc.revision)
  const parsed = parseBoughtMatrix(parseCsv(csv))
  if (parsed.missing.length) return fail(400, 'missing_headers', parsed.missing.join(', '))
  // Row IDs in the file are stored as written (OPB-0001 stays OPB-0001). Import does not assign new ones.
  const copies = parsed.copies.map(holdingFromBought)
  if (copies.length > MAX_HOLDINGS) return fail(400, 'too_many_rows')
  const seen = new Set<string>()
  for (const copy of copies) {
    if (!ROW_ID_RE.test(copy.rowId)) return fail(400, 'bad_row_id', copy.rowId)
    if (seen.has(copy.rowId)) return fail(409, 'duplicate_row', copy.rowId)
    seen.add(copy.rowId)
  }
  return { ok: true, doc: { revision: doc.revision + 1, copies }, imported: copies.length, skipped: parsed.skipped }
}

function num(value: unknown, key: string): number | null | HoldingFailure {
  if (value == null || value === '') return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(400, 'bad_field', key)
  return value
}

function count(value: unknown, key: string): number | HoldingFailure {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return fail(400, 'bad_field', key)
  return value
}

/** One totals row per UTC day. Today replaces today. Older days stay. */
export function acceptSnapshot(
  history: SnapshotView[],
  body: unknown,
  today: string,
): { ok: true; history: SnapshotView[] } | HoldingFailure {
  const raw = asRecord(body)
  if (!raw) return fail(400, 'bad_request')
  if (raw.asOf !== today) return fail(400, 'as_of_not_today')
  const heldCopies = count(raw.heldCopies, 'heldCopies')
  if (isFail(heldCopies)) return heldCopies
  const listedCopies = count(raw.listedCopies, 'listedCopies')
  if (isFail(listedCopies)) return listedCopies
  const soldCopies = count(raw.soldCopies, 'soldCopies')
  if (isFail(soldCopies)) return soldCopies
  const unpricedHeld = count(raw.unpricedHeld, 'unpricedHeld')
  if (isFail(unpricedHeld)) return unpricedHeld
  const costSgd = num(raw.costSgd, 'costSgd')
  if (isFail(costSgd)) return costSgd
  const marketSgd = num(raw.marketSgd, 'marketSgd')
  if (isFail(marketSgd)) return marketSgd
  const unrealizedSgd = num(raw.unrealizedSgd, 'unrealizedSgd')
  if (isFail(unrealizedSgd)) return unrealizedSgd
  const realizedSgd = num(raw.realizedSgd, 'realizedSgd')
  if (isFail(realizedSgd)) return realizedSgd
  const overallSgd = num(raw.overallSgd, 'overallSgd')
  if (isFail(overallSgd)) return overallSgd
  const capitalSgd = num(raw.capitalSgd, 'capitalSgd')
  if (isFail(capitalSgd)) return capitalSgd
  const roi = num(raw.roi, 'roi')
  if (isFail(roi)) return roi
  const row: SnapshotView = {
    asOf: today,
    source: 'piecebook',
    heldCopies,
    listedCopies,
    soldCopies,
    costSgd,
    marketSgd,
    unpricedHeld,
    unrealizedSgd,
    realizedSgd,
    overallSgd,
    capitalSgd,
    roi,
  }
  const rows = history.filter((r) => r.asOf !== today)
  rows.push(row)
  rows.sort((a, b) => a.asOf.localeCompare(b.asOf))
  return { ok: true, history: rows }
}

export const SALE_FIELD_KEYS = SALE_KEYS
