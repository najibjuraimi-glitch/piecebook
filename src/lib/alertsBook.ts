/**
 * Alert memory for one person. Under-all-in and watchlist hits remember the
 * last price that already fired, so the same price stays quiet on every device.
 */
import { dismissAlerts, freshUnderCostAlerts, type AlertMemory, type UnderCostAlert, type ValuedCopy } from './boughtBook'
import { dismissWatchHits, freshWatchHits, type ValuedWatchItem, type WatchHit } from './watchlist'

export interface AlertWrite {
  at: string
  caller: string
  op: string
}

export interface AlertsDoc {
  revision: number
  underAllIn: AlertMemory
  watchlist: AlertMemory
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
  return { revision: 0, underAllIn: {}, watchlist: {}, writes: [] }
}

export function normaliseAlerts(doc: unknown): AlertsDoc {
  if (!doc || typeof doc !== 'object') return emptyAlerts()
  const raw = doc as Partial<AlertsDoc>
  return {
    revision: typeof raw.revision === 'number' && Number.isInteger(raw.revision) ? raw.revision : 0,
    underAllIn: memoryOf(raw.underAllIn),
    watchlist: memoryOf(raw.watchlist),
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

function isWrite(value: unknown): value is AlertWrite {
  if (!value || typeof value !== 'object') return false
  const row = value as AlertWrite
  return typeof row.at === 'string' && typeof row.caller === 'string' && typeof row.op === 'string'
}

export function currentAlerts(copies: ValuedCopy[], items: ValuedWatchItem[], doc: AlertsDoc): { underAllIn: UnderCostAlert[]; watchlist: WatchHit[] } {
  return {
    underAllIn: freshUnderCostAlerts(copies, doc.underAllIn),
    watchlist: freshWatchHits(items, doc.watchlist),
  }
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
      writes: writes.length > MAX_WRITES ? writes.slice(writes.length - MAX_WRITES) : writes,
    },
  }
}
