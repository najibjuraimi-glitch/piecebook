import { API_BASE } from '../config/api'
import type { UnderCostAlert } from './boughtBook'
import type { WatchHit } from './watchlist'

export interface AlertsPayload {
  revision: number
  underAllIn: UnderCostAlert[]
  watchlist: WatchHit[]
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

export async function getAlerts(signal?: AbortSignal): Promise<ApiResult<AlertsPayload>> {
  const res = await fetch(`${API_BASE}/alerts`, { credentials: 'include', signal })
  return read<AlertsPayload>(res)
}

export async function dismissAlerts(
  body: { revision: number; underAllIn: string[]; watchlist: string[] },
  signal?: AbortSignal,
): Promise<ApiResult<AlertsPayload>> {
  const res = await fetch(`${API_BASE}/alerts/dismiss`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return read<AlertsPayload>(res)
}
