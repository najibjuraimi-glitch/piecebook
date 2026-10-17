import { API_BASE } from '../config/api'
import type { SnapshotView } from './boughtBook'
import type { Holding } from './holdings'

export interface HoldingsPayload {
  revision: number
  copies: Holding[]
  history: SnapshotView[]
}

export interface ApiResult<T> {
  ok: boolean
  status: number
  data: T | null
  error: string
}

async function read<T>(res: Response): Promise<ApiResult<T>> {
  let data: T | null = null
  let error = ''
  try {
    const body = await res.json()
    if (res.ok) data = body as T
    else error = typeof body?.error === 'string' ? body.error : 'bad_response'
  } catch {
    error = res.ok ? 'bad_response' : 'bad_response'
  }
  return { ok: res.ok, status: res.status, data, error }
}

export async function getHoldings(signal?: AbortSignal): Promise<ApiResult<HoldingsPayload>> {
  const res = await fetch(`${API_BASE}/holdings`, { credentials: 'include', signal })
  return read<HoldingsPayload>(res)
}

export async function postHolding(path: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<{ revision?: number; copy?: Holding; history?: SnapshotView[]; error?: string; imported?: number }>> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return read(res)
}

export async function patchHolding(rowId: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<{ revision?: number; copy?: Holding; error?: string }>> {
  const res = await fetch(`${API_BASE}/holdings/${encodeURIComponent(rowId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return read(res)
}
