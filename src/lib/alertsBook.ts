/**
 * Alert memory for one person. Under-all-in and watchlist hits remember the
 * last price that already fired, so the same price stays quiet on every device.
 */
import { dismissAlerts, underCostAlertList, type AlertMemory, type UnderCostAlert, type ValuedCopy } from './boughtBook'
import { dismissWatchHits, watchAlertList, type ValuedWatchItem, type WatchHit } from './watchlist'

export interface AlertWrite {
  at: string
  caller: string
  op: string
}

export interface AlertsDoc {
  revision: number
  underAllIn: AlertMemory
  watchlist: AlertMemory
  /** Time each alert first fired at the current low. Keyed `underAllIn:<rowId>` or `watchlist:<id>`. */
  firedAt: Record<string, string>
  /** The price that firedAt belongs to. A strictly lower price is a new low. */
  firedPrice: Record<string, number>
  writes: AlertWrite[]
}

export interface AlertsFailure {
  ok: false
  status: number
  error: string
  detail?: string
  revision?: number
}

const MAX_WRITES = 2000

export function emptyAlerts(): AlertsDoc {
  return { revision: 0, underAllIn: {}, watchlist: {}, firedAt: {}, firedPrice: {}, writes: [] }
}

export function normaliseAlerts(doc: unknown): AlertsDoc {
  if (!doc || typeof doc !== 'object') return emptyAlerts()
  const raw = doc as Partial<AlertsDoc>
  return {
    revision: typeof raw.revision === 'number' && Number.isInteger(raw.revision) ? raw.revision : 0,
    underAllIn: memoryOf(raw.underAllIn),
    watchlist: memoryOf(raw.watchlist),
    firedAt: stringsOf((raw as { firedAt?: unknown }).firedAt),
    firedPrice: memoryOf((raw as { firedPrice?: unknown }).firedPrice),
    writes: Array.isArray(raw.writes) ? raw.writes.filter(isWrite) : [],
  }
}

function memoryOf(value: unknown): AlertMemory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const memory: AlertMemory = {}
  for (const [key, n] of Object.entries(value)) {
    if (typeof n === 'number' && Number.isFinite(n)) memory[key] = n
  }
  return memory
}

function stringsOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, text] of Object.entries(value)) {
    if (typeof text === 'string' && text) out[key] = text
  }
  return out
}

function isWrite(value: unknown): value is AlertWrite {
  if (!value || typeof value !== 'object') return false
  const row = value as AlertWrite
  return typeof row.at === 'string' && typeof row.caller === 'string' && typeof row.op === 'string'
}

export function currentAlerts(
  copies: ValuedCopy[],
  items: ValuedWatchItem[],
  doc: AlertsDoc,
  includeDismissed = false,
): { underAllIn: UnderCostAlert[]; watchlist: WatchHit[] } {
  return {
    underAllIn: underCostAlertList(copies, doc.underAllIn, includeDismissed),
    watchlist: watchAlertList(items, doc.watchlist, includeDismissed),
  }
}

export function alertKey(alert: { type?: string; rowId?: string; id?: string }): string {
  return alert.type === 'watchlist' ? `watchlist:${alert.id}` : `underAllIn:${alert.rowId}`
}

function fail(status: number, error: string, detail?: string, revision?: number): AlertsFailure {
  return { ok: false, status, error, ...(detail ? { detail } : {}), ...(revision != null ? { revision } : {}) }
}

function idList(value: unknown): string[] | AlertsFailure {
  if (value == null) return []
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) return fail(400, 'bad_field')
  return value
}

/**
 * Dismiss the hits the caller names, at the price Piecebook just computed.
 * A named id that is not currently firing is ignored.
 */
export function dismissAlertIds(
  doc: AlertsDoc,
  body: unknown,
  underAllIn: UnderCostAlert[],
  watchlist: WatchHit[],
  write: AlertWrite,
): { ok: true; doc: AlertsDoc; changed: boolean } | AlertsFailure {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'bad_request')
  const raw = body as Record<string, unknown>
  if (typeof raw.revision !== 'number' || !Number.isInteger(raw.revision)) return fail(400, 'bad_revision')
  if (raw.revision !== doc.revision) return fail(409, 'revision_conflict', undefined, doc.revision)
  const underIds = idList(raw.underAllIn)
  if ('ok' in (underIds as object) && (underIds as AlertsFailure).ok === false) return underIds as AlertsFailure
  const watchIds = idList(raw.watchlist)
  if ('ok' in (watchIds as object) && (watchIds as AlertsFailure).ok === false) return watchIds as AlertsFailure
  const underHits = underAllIn.filter((alert) => (underIds as string[]).includes(alert.rowId))
  const watchHits = watchlist.filter((hit) => (watchIds as string[]).includes(hit.id))
  if (underHits.length === 0 && watchHits.length === 0) return { ok: true, doc, changed: false }
  const writes = doc.writes.concat(write)
  return {
    ok: true,
    changed: true,
    doc: {
      revision: doc.revision + 1,
      underAllIn: dismissAlerts(doc.underAllIn, underHits),
      watchlist: dismissWatchHits(doc.watchlist, watchHits),
      firedAt: doc.firedAt,
      firedPrice: doc.firedPrice,
      writes: writes.length > MAX_WRITES ? writes.slice(writes.length - MAX_WRITES) : writes,
    },
  }
}

/** Drop one alert's dismissal and firedAt without moving the alerts revision. */
export function forgetAlertKey(doc: AlertsDoc, kind: 'watchlist' | 'underAllIn', id: string): { doc: AlertsDoc; changed: boolean } {
  const stamp = `${kind}:${id}`
  const memory = { ...(kind === 'watchlist' ? doc.watchlist : doc.underAllIn) }
  const hadMemory = memory[id] != null
  const hadFire = doc.firedAt[stamp] != null || doc.firedPrice[stamp] != null
  if (!hadMemory && !hadFire) return { doc, changed: false }
  delete memory[id]
  const firedAt = { ...doc.firedAt }
  const firedPrice = { ...doc.firedPrice }
  delete firedAt[stamp]
  delete firedPrice[stamp]
  if (kind === 'watchlist') return { changed: true, doc: { ...doc, watchlist: memory, firedAt, firedPrice } }
  return { changed: true, doc: { ...doc, underAllIn: memory, firedAt, firedPrice } }
}

export function forgetWatchId(doc: AlertsDoc, id: string): { doc: AlertsDoc; changed: boolean } {
  return forgetAlertKey(doc, 'watchlist', id)
}

/** Stamp firedAt only when this price is a new low. The same price keeps its time. */
export function nextFiredStamp(
  doc: AlertsDoc,
  alerts: Array<{ type?: string; rowId?: string; id?: string; dismissed?: boolean; legalSgd?: number; priceSgd?: number }>,
  nowIso: string,
): { firedAt: Record<string, string>; firedPrice: Record<string, number>; changed: boolean } {
  const firedAt = { ...doc.firedAt }
  const firedPrice = { ...doc.firedPrice }
  let changed = false
  for (const alert of alerts) {
    if (alert.dismissed) continue
    const key = alertKey(alert)
    const price = alert.type === 'watchlist' ? alert.priceSgd : alert.legalSgd
    if (price == null) continue
    const prev = firedPrice[key]
    if (prev == null || price < prev) {
      firedAt[key] = nowIso
      firedPrice[key] = price
      changed = true
    }
  }
  return { firedAt, firedPrice, changed }
}
