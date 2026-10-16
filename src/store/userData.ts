/**
 * One door for everything the collector owns in this browser. Every store
 * reads and writes its `piecebook.*` key through here so that:
 *
 *  - each key carries an `updatedAt` stamp (kept in a sidecar meta key) for
 *    last-write-wins against the cloud copy;
 *  - a write from the cloud (or an import) tells every store in this tab to
 *    reload, the way a `storage` event from another tab already does;
 *  - export, import and sync all speak one shape: `{ key: { value, updatedAt } }`.
 *
 * Values travel as parsed JSON where the stored string is a JSON object or
 * array, and as the raw string otherwise (`'usd'`, `'debut'`, an ISO date).
 * `localStorage` stays the offline cache; nothing here talks to the network.
 */

export const USER_DATA_KEYS = [
  'piecebook.v1',
  'piecebook.decks.v1',
  'piecebook.watchlist.v1',
  'piecebook.pregrade.v1',
  'piecebook.displayCurrency.v1',
  'piecebook.readerCutoff.v1',
  'piecebook.started.v1',
] as const

export type UserDataKey = (typeof USER_DATA_KEYS)[number]

export const USER_DATA_LABEL: Record<UserDataKey, string> = {
  'piecebook.v1': 'Collection and costs',
  'piecebook.decks.v1': 'Decks',
  'piecebook.watchlist.v1': 'Watchlist',
  'piecebook.pregrade.v1': 'Pre-grade log',
  'piecebook.displayCurrency.v1': 'Portfolio currency',
  'piecebook.readerCutoff.v1': 'Reader cutoff',
  'piecebook.started.v1': 'Start-here flag',
}

/** Oldest possible stamp: data written before sync existed, age unknown. */
export const UNKNOWN_AGE = '1970-01-01T00:00:00.000Z'

const META_KEY = 'piecebook.sync.meta.v1'
const EVENT = 'piecebook:userdata'

export interface UserDoc {
  value: unknown
  updatedAt: string
}

export type UserDocs = Partial<Record<UserDataKey, UserDoc>>

interface MetaEntry {
  updatedAt: string
  dirty: boolean
}

type Meta = Partial<Record<UserDataKey, MetaEntry>>

export type WriteSource = 'local' | 'remote' | 'import'

export interface UserDataChange {
  key: UserDataKey
  source: WriteSource
}

export function isUserDataKey(v: unknown): v is UserDataKey {
  return typeof v === 'string' && (USER_DATA_KEYS as readonly string[]).includes(v)
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readMeta(): Meta {
  const s = storage()
  if (!s) return {}
  try {
    const raw = s.getItem(META_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, Partial<MetaEntry>>) : {}
    const out: Meta = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (isUserDataKey(k) && v && typeof v.updatedAt === 'string') out[k] = { updatedAt: v.updatedAt, dirty: Boolean(v.dirty) }
    }
    return out
  } catch {
    return {}
  }
}

function writeMeta(meta: Meta): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    // Meta is advisory; the data write itself already happened or failed on its own.
  }
}

/** The stored string behind a key, or null. Stores call this instead of `localStorage.getItem`. */
export function readRaw(key: UserDataKey): string | null {
  const s = storage()
  if (!s) return null
  try {
    return s.getItem(key)
  } catch {
    return null
  }
}

/** Stamp and dirty flag for a key; `UNKNOWN_AGE` and clean for data that predates sync. */
export function metaFor(key: UserDataKey): MetaEntry {
  return readMeta()[key] ?? { updatedAt: UNKNOWN_AGE, dirty: false }
}

type LocalWriteHook = (key: UserDataKey) => void
let onLocalWrite: LocalWriteHook | null = null

/** The sync engine registers here so a local write schedules a push. */
export function setLocalWriteHook(fn: LocalWriteHook | null): void {
  onLocalWrite = fn
}

function emit(change: UserDataChange): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<UserDataChange>(EVENT, { detail: change }))
}

/**
 * Write a key from this device. Stamps `updatedAt = now`, marks it dirty for
 * the next push, and tells other stores in this tab. Returns false when
 * storage is unavailable (private mode, quota); callers keep state in memory.
 */
export function writeRaw(key: UserDataKey, value: string, source: 'local' | 'import' = 'local', at = new Date().toISOString()): boolean {
  const s = storage()
  if (!s) return false
  let ok = true
  try {
    s.setItem(key, value)
  } catch {
    ok = false
  }
  const meta = readMeta()
  meta[key] = { updatedAt: at, dirty: true }
  writeMeta(meta)
  emit({ key, source })
  if (ok) onLocalWrite?.(key)
  return ok
}

/** Write a key the cloud says is newer. Not dirty; never schedules a push. */
export function applyRemote(key: UserDataKey, doc: UserDoc): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(key, decodeValue(doc.value))
  } catch {
    return
  }
  const meta = readMeta()
  meta[key] = { updatedAt: doc.updatedAt, dirty: false }
  writeMeta(meta)
  emit({ key, source: 'remote' })
}

/** Give a key a fresh stamp and mark it dirty without touching its value (first-login upload). */
export function restampDirty(key: UserDataKey, at: string): void {
  const meta = readMeta()
  meta[key] = { updatedAt: at, dirty: true }
  writeMeta(meta)
}

/** Called after a successful push: a key is clean unless it was written again since. */
export function markClean(key: UserDataKey, pushedAt: string): void {
  const meta = readMeta()
  const cur = meta[key]
  if (!cur || cur.updatedAt !== pushedAt) return
  meta[key] = { ...cur, dirty: false }
  writeMeta(meta)
}

/**
 * Listen for a key changing under this tab: another tab (`storage`), the
 * cloud, or an import. Stores reload from storage when it fires.
 */
export function subscribeUserData(key: UserDataKey | null, fn: (change: UserDataChange) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<UserDataChange>).detail
    if (!detail || (key && detail.key !== key)) return
    fn(detail)
  }
  const onStorage = (e: StorageEvent) => {
    if (!isUserDataKey(e.key)) return
    if (key && e.key !== key) return
    fn({ key: e.key, source: 'remote' })
  }
  window.addEventListener(EVENT, onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}

/** Parsed JSON for objects and arrays; the raw string for everything else. */
export function encodeValue(raw: string): unknown {
  const t = raw.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return raw
  try {
    const parsed: unknown = JSON.parse(t)
    return parsed !== null && typeof parsed === 'object' ? parsed : raw
  } catch {
    return raw
  }
}

/** Inverse of `encodeValue`. */
export function decodeValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value ?? null)
}

/** Every key present on this device, with its stamp. Absent keys are left out. */
export function snapshotDocs(): UserDocs {
  const meta = readMeta()
  const out: UserDocs = {}
  for (const key of USER_DATA_KEYS) {
    const raw = readRaw(key)
    if (raw === null) continue
    out[key] = { value: encodeValue(raw), updatedAt: meta[key]?.updatedAt ?? UNKNOWN_AGE }
  }
  return out
}

/** Keys written since the last successful push. */
export function dirtyDocs(): UserDocs {
  const meta = readMeta()
  const out: UserDocs = {}
  for (const key of USER_DATA_KEYS) {
    const m = meta[key]
    if (!m?.dirty) continue
    const raw = readRaw(key)
    if (raw === null) continue
    out[key] = { value: encodeValue(raw), updatedAt: m.updatedAt }
  }
  return out
}

export interface DataSummary {
  ownedCards: number
  decks: number
  watching: number
  predictions: number
  prefs: number
}

function countKeys(v: unknown): number {
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as object).length : 0
}

/** Plain counts for a confirm sheet: "12 owned cards, 2 decks, 5 watching, 3 pre-grades". */
export function summariseDocs(docs: UserDocs): DataSummary {
  const col = docs['piecebook.v1']?.value as { owned?: unknown } | undefined
  const decks = docs['piecebook.decks.v1']?.value as { decks?: unknown } | undefined
  const watch = docs['piecebook.watchlist.v1']?.value as { cards?: unknown; sets?: unknown; characters?: unknown } | undefined
  const preds = docs['piecebook.pregrade.v1']?.value
  let prefs = 0
  for (const k of ['piecebook.displayCurrency.v1', 'piecebook.readerCutoff.v1', 'piecebook.started.v1'] as const) if (docs[k]) prefs++
  return {
    ownedCards: countKeys(col?.owned),
    decks: Array.isArray(decks?.decks) ? decks!.decks.length : 0,
    watching: countKeys(watch?.cards) + countKeys(watch?.sets) + countKeys(watch?.characters),
    predictions: Array.isArray(preds) ? preds.length : 0,
    prefs,
  }
}

/** True when the docs hold something a collector typed, not just a preference flag. */
export function hasMeaningfulData(docs: UserDocs): boolean {
  const s = summariseDocs(docs)
  return s.ownedCards + s.decks + s.watching + s.predictions > 0
}

export function describeSummary(s: DataSummary): string {
  const parts: string[] = []
  parts.push(`${s.ownedCards} owned ${s.ownedCards === 1 ? 'card' : 'cards'}`)
  parts.push(`${s.decks} ${s.decks === 1 ? 'deck' : 'decks'}`)
  parts.push(`${s.watching} watching`)
  parts.push(`${s.predictions} pre-${s.predictions === 1 ? 'grade' : 'grades'}`)
  return parts.join(', ')
}

export const EXPORT_FORMAT = 1

export interface ExportFile {
  app: 'piecebook'
  format: typeof EXPORT_FORMAT
  exportedAt: string
  origin: string
  docs: UserDocs
}

export function buildExport(now = new Date()): ExportFile {
  return {
    app: 'piecebook',
    format: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    origin: typeof window === 'undefined' ? '' : window.location.origin,
    docs: snapshotDocs(),
  }
}

export function exportFileName(now = new Date()): string {
  return `piecebook-backup-${now.toISOString().slice(0, 10)}.json`
}

/** Reads a backup file. Throws a plain-English Error when it is not one. */
export function parseExport(text: string): ExportFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not JSON.')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('That file is not a Piecebook backup.')
  const f = parsed as Partial<ExportFile>
  if (f.app !== 'piecebook' || !f.docs || typeof f.docs !== 'object') throw new Error('That file is not a Piecebook backup.')
  if (f.format !== EXPORT_FORMAT) throw new Error(`That backup is format ${String(f.format)}; this app reads format ${EXPORT_FORMAT}.`)
  const docs: UserDocs = {}
  for (const [k, v] of Object.entries(f.docs as Record<string, unknown>)) {
    if (!isUserDataKey(k) || !v || typeof v !== 'object') continue
    const d = v as Partial<UserDoc>
    if (!('value' in d)) continue
    docs[k] = { value: d.value, updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : UNKNOWN_AGE }
  }
  return {
    app: 'piecebook',
    format: EXPORT_FORMAT,
    exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : '',
    origin: typeof f.origin === 'string' ? f.origin : '',
    docs,
  }
}

/**
 * Replace this device's keys with the file's. Each key is stamped now, so the
 * import also wins over the cloud copy on the next push. Keys the file does not
 * carry are left alone.
 */
export function applyImport(docs: UserDocs, now = new Date().toISOString()): UserDataKey[] {
  const written: UserDataKey[] = []
  for (const key of USER_DATA_KEYS) {
    const doc = docs[key]
    if (!doc) continue
    if (writeRaw(key, decodeValue(doc.value), 'import', now)) written.push(key)
  }
  return written
}
