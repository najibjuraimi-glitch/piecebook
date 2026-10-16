import { API_BASE } from '../config/api'
import { isUserDataKey, type UserDocs } from '../store/userData'

export interface RemoteState {
  identity: string
  readOnly: boolean
  docs: UserDocs
}

export type SyncResult =
  | { kind: 'ok'; state: RemoteState }
  /** Worker has no Access config: the deployment runs local-only. */
  | { kind: 'off' }
  /** Access session missing or expired: the page needs a reload to log in. */
  | { kind: 'signed-out' }
  /** Service token or other read-only identity tried to write. */
  | { kind: 'read-only' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }

export interface SyncClientDeps {
  fetch: typeof fetch
  base: string
}

const defaults = (): SyncClientDeps => ({ fetch: (i, init) => fetch(i, init), base: API_BASE })

function parseDocs(raw: unknown): UserDocs {
  const out: UserDocs = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isUserDataKey(k) || !v || typeof v !== 'object') continue
    const d = v as { value?: unknown; updatedAt?: unknown }
    if (!('value' in d) || typeof d.updatedAt !== 'string') continue
    out[k] = { value: d.value, updatedAt: d.updatedAt }
  }
  return out
}

async function interpret(res: Response): Promise<SyncResult> {
  // Access answers an expired session with a redirect to its login page; with
  // redirect: 'manual' that surfaces as an opaque redirect (status 0).
  if (res.type === 'opaqueredirect' || res.status === 0 || (res.status >= 300 && res.status < 400)) return { kind: 'signed-out' }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  const err = body && typeof body === 'object' ? String((body as { error?: unknown }).error ?? '') : ''
  if (res.status === 503 && err === 'sync_not_configured') return { kind: 'off' }
  if (res.status === 401) return { kind: 'signed-out' }
  if (res.status === 403 && err === 'read_only') return { kind: 'read-only' }
  if (!res.ok) return { kind: 'error', message: err ? `Sync failed: ${err} (${res.status}).` : `Sync failed (${res.status}).` }
  const b = (body ?? {}) as { identity?: unknown; readOnly?: unknown; docs?: unknown }
  if (typeof b.identity !== 'string') return { kind: 'error', message: 'Sync answered without an identity.' }
  return { kind: 'ok', state: { identity: b.identity, readOnly: Boolean(b.readOnly), docs: parseDocs(b.docs) } }
}

export async function fetchRemote(deps?: Partial<SyncClientDeps>): Promise<SyncResult> {
  const d = { ...defaults(), ...deps }
  let res: Response
  try {
    res = await d.fetch(`${d.base}/sync`, { method: 'GET', redirect: 'manual', headers: { Accept: 'application/json' } })
  } catch {
    return { kind: 'offline' }
  }
  return interpret(res)
}

export async function pushRemote(docs: UserDocs, deps?: Partial<SyncClientDeps>): Promise<SyncResult> {
  const d = { ...defaults(), ...deps }
  let res: Response
  try {
    res = await d.fetch(`${d.base}/sync`, {
      method: 'PUT',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ docs }),
    })
  } catch {
    return { kind: 'offline' }
  }
  return interpret(res)
}
