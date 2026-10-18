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
  /** First time each alert fired, keyed `underAllIn:<rowId>` or `watchlist:<id>`. Not a revision. */
  firedAt: Record<string, string>
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
  return { revision: 0, underAllIn: {}, watchlist: {}, firedAt: {}, writes: [] }
}

export function normaliseAlerts(doc: unknown): AlertsDoc {
  if (!doc || typeof doc !== 'object') return emptyAlerts()
  const raw = doc as Partial<AlertsDoc>
  return {
    revision: typeof raw.revision === 'number' && Number.isInteger(raw.revision) ? raw.revision : 0,
    underAllIn: memoryOf(raw.underAllIn),
    watchlist: memoryOf(raw.watchlist),
    firedAt: stringsOf((raw as { firedAt?: unknown }).firedAt),
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
      writes: writes.length > MAX_WRITES ? writes.slice(writes.length - MAX_WRITES) : writes,
    },
  }
}

/** Drop one watch id's dismissal without moving the alerts revision. */
export function forgetWatchId(doc: AlertsDoc, id: string): { doc: AlertsDoc; changed: boolean } {
  if (doc.watchlist[id] == null) return { doc, changed: false }
  const watchlist = { ...doc.watchlist }
  delete watchlist[id]
  return { changed: true, doc: { ...doc, watchlist } }
}
