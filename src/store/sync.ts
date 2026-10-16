import { useSyncExternalStore } from 'react'
import { fetchRemote, pushRemote, type SyncClientDeps, type SyncResult } from '../lib/syncClient'
import { planMerge, stampAll } from '../lib/syncMerge'
import {
  applyRemote,
  dirtyDocs,
  markClean,
  restampDirty,
  setLocalWriteHook,
  snapshotDocs,
  USER_DATA_KEYS,
  type UserDataKey,
  type UserDocs,
} from './userData'

/**
 * Cloud sync. The Worker keeps one copy per Access identity; this device keeps
 * `localStorage` as the offline cache. Reads happen on start, on coming back
 * to the tab, and every few minutes; writes go through within a second.
 * Per-key last-write-wins on `updatedAt`, nothing cleverer.
 */
export type SyncStatus =
  /** Worker is not behind Access: local only, nothing to do. */
  | 'off'
  | 'checking'
  | 'synced'
  | 'syncing'
  /** Could not reach the Worker; local writes queue until it answers. */
  | 'offline'
  /** Access session expired; reload the page to log in again. */
  | 'signed-out'
  /** First login on this device: cloud empty, local full. Waiting for the collector. */
  | 'held'
  | 'read-only'
  | 'error'

export interface SyncState {
  status: SyncStatus
  identity: string | null
  lastSyncAt: string | null
  /** Keys written here and not yet accepted by the cloud. */
  pending: number
  message: string | null
}

const INITIAL: SyncState = { status: 'checking', identity: null, lastSyncAt: null, pending: 0, message: null }
const HELD_KEY = 'piecebook.sync.held.session'
const PUSH_DEBOUNCE_MS = 800
const REFRESH_MS = 5 * 60_000
const VISIBLE_THROTTLE_MS = 30_000

let state: SyncState = INITIAL
const listeners = new Set<() => void>()
let deps: Partial<SyncClientDeps> | undefined
let started = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let lastPullAt = 0
let inflight: Promise<void> | null = null

function set(patch: Partial<SyncState>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

function pendingCount(): number {
  return Object.keys(dirtyDocs()).length
}

function heldThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(HELD_KEY) === '1'
  } catch {
    return false
  }
}

function applyResult(r: Exclude<SyncResult, { kind: 'ok' }>): void {
  if (r.kind === 'off') set({ status: 'off', message: null })
  else if (r.kind === 'signed-out') set({ status: 'signed-out', message: 'Your sign-in has expired. Reload to sign in again.' })
  else if (r.kind === 'read-only') set({ status: 'read-only', message: 'This identity can read but not write.' })
  else if (r.kind === 'offline') set({ status: 'offline', message: 'Cloud not reachable. Changes are kept on this device.' })
  else set({ status: 'error', message: r.message })
  set({ pending: pendingCount() })
}

function applyRemoteDocs(docs: UserDocs): void {
  for (const key of USER_DATA_KEYS) {
    const d = docs[key]
    if (d) applyRemote(key, d)
  }
}

async function send(docs: UserDocs): Promise<boolean> {
  const keys = Object.keys(docs) as UserDataKey[]
  if (keys.length === 0) return true
  set({ status: 'syncing' })
  const r = await pushRemote(docs, deps)
  if (r.kind !== 'ok') {
    applyResult(r)
    return false
  }
  // The Worker answers with the winning copy of every key sent; a newer cloud copy comes back here.
  for (const key of keys) {
    const sent = docs[key]!
    const got = r.state.docs[key]
    if (got && got.updatedAt > sent.updatedAt) applyRemote(key, got)
    else markClean(key, sent.updatedAt)
  }
  set({ status: 'synced', identity: r.state.identity, lastSyncAt: new Date().toISOString(), pending: pendingCount(), message: null })
  return true
}

async function pull(): Promise<void> {
  lastPullAt = Date.now()
  const r = await fetchRemote(deps)
  if (r.kind !== 'ok') {
    applyResult(r)
    return
  }
  const plan = planMerge(snapshotDocs(), r.state.docs)
  applyRemoteDocs(plan.applyRemote)
  if (r.state.readOnly) {
    set({ status: 'read-only', identity: r.state.identity, lastSyncAt: new Date().toISOString(), pending: pendingCount(), message: 'This identity can read but not write.' })
    return
  }
  if (plan.offerUpload || heldThisSession()) {
    set({ status: 'held', identity: r.state.identity, pending: pendingCount(), message: null })
    return
  }
  const toPush: UserDocs = { ...plan.push, ...dirtyDocs() }
  set({ identity: r.state.identity })
  if (!(await send(toPush))) return
  set({ status: 'synced', lastSyncAt: new Date().toISOString(), pending: pendingCount(), message: null })
}

function run(job: () => Promise<void>): Promise<void> {
  const next = (inflight ?? Promise.resolve()).then(job).catch(() => {
    set({ status: 'error', message: 'Sync hit an unexpected error.' })
  })
  inflight = next.finally(() => {
    if (inflight === next) inflight = null
  })
  return inflight
}

function flushSoon(): void {
  if (state.status === 'off' || state.status === 'held' || state.status === 'read-only') return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void run(async () => {
      if (state.status === 'signed-out' || state.status === 'off' || state.status === 'held') return
      await send(dirtyDocs())
    })
  }, PUSH_DEBOUNCE_MS)
}

/** Boot the engine once per page. Safe to call again; later calls are ignored. */
export function startSync(d?: Partial<SyncClientDeps>): void {
  if (started || typeof window === 'undefined') return
  started = true
  deps = d
  setLocalWriteHook(() => {
    set({ pending: pendingCount() })
    flushSoon()
  })
  void run(pull)
  window.addEventListener('online', () => void run(pull))
  const doc = typeof document === 'undefined' ? null : document
  doc?.addEventListener('visibilitychange', () => {
    if (doc.visibilityState !== 'visible') return
    if (Date.now() - lastPullAt < VISIBLE_THROTTLE_MS) return
    if (state.status === 'off') return
    void run(pull)
  })
  refreshTimer = setInterval(() => {
    if ((doc?.visibilityState ?? 'visible') === 'visible' && state.status !== 'off') void run(pull)
  }, REFRESH_MS)
}

/** Manual retry from the data screen. */
export function refreshSync(): Promise<void> {
  return run(pull)
}

/** First-login upload: send everything on this device, stamped now. */
export function uploadLocalData(): Promise<void> {
  try {
    window.sessionStorage.removeItem(HELD_KEY)
  } catch {
    // Session marker is best-effort.
  }
  return run(async () => {
    const now = new Date().toISOString()
    const docs = stampAll(snapshotDocs(), now)
    // Stamp the local copies too: if the push fails they stay dirty and retry; a later pull never sees them as unknown-age.
    for (const key of USER_DATA_KEYS) if (docs[key]) restampDirty(key, now)
    set({ status: 'syncing' })
    await send(docs)
  })
}

/** "Not now": keep working on this device only until the next visit or an explicit upload. */
export function keepLocalForNow(): void {
  try {
    window.sessionStorage.setItem(HELD_KEY, '1')
  } catch {
    // Session marker is best-effort.
  }
  set({ status: 'held' })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Current engine state, outside React. */
export function getSyncState(): SyncState {
  return state
}

export function useSync(): SyncState {
  return useSyncExternalStore(subscribe, getSyncState, getSyncState)
}

/** Test seam. */
export function resetSyncForTests(): void {
  state = INITIAL
  started = false
  deps = undefined
  inflight = null
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = null
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = null
  setLocalWriteHook(null)
}
