import { API_BASE } from '../config/api'
import type { WatchItem, ValuedWatchItem } from './watchlist'

export interface WatchlistPayload {
  revision: number
  items: ValuedWatchItem[]
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
    const body = (await res.json()) as { error?: string }
    if (res.ok) data = body as T
    else error = typeof body?.error === 'string' ? body.error : 'bad_response'
  } catch {
    error = 'bad_response'
  }
  return { ok: res.ok, status: res.status, data, error }
}

export async function getWatchlist(signal?: AbortSignal): Promise<ApiResult<WatchlistPayload>> {
  const res = await fetch(`${API_BASE}/watchlist`, { credentials: 'include', signal })
  return read<WatchlistPayload>(res)
}

export async function postWatchItem(body: unknown, signal?: AbortSignal): Promise<ApiResult<{ revision?: number; item?: ValuedWatchItem }>> {
  const res = await fetch(`${API_BASE}/watchlist`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return read(res)
}

export async function patchWatchItem(id: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<{ revision?: number; item?: WatchItem }>> {
  const res = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return read(res)
}

export async function deleteWatchItem(id: string, revision: number, signal?: AbortSignal): Promise<ApiResult<{ revision?: number }>> {
  const res = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision }),
    signal,
  })
  return read(res)
}
