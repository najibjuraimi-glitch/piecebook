import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSyncState as state, keepLocalForNow, refreshSync, resetSyncForTests, startSync, uploadLocalData } from './sync'
import { metaFor, writeRaw, type UserDocs } from './userData'

/**
 * The engine against a fake Worker: an in-memory last-write-wins store behind
 * a `fetch` that speaks the /sync contract, plus a fake window with storage.
 */
class FakeStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
}

class FakeWindow extends EventTarget {
  localStorage = new FakeStorage()
  sessionStorage = new FakeStorage()
  location = { origin: 'https://piecebook.pages.dev' }
}

interface FakeServer {
  docs: UserDocs
  mode: 'ok' | 'off' | 'signed-out' | 'down' | 'read-only'
  puts: number
  fetch: typeof fetch
}

function server(initial: UserDocs = {}): FakeServer {
  const s: FakeServer = {
    docs: { ...initial },
    mode: 'ok',
    puts: 0,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (s.mode === 'down') throw new TypeError('network')
      if (s.mode === 'off') return new Response(JSON.stringify({ error: 'sync_not_configured' }), { status: 503 })
      if (s.mode === 'signed-out') return new Response(null, { status: 302, headers: { Location: 'https://jib.cloudflareaccess.com/login' } })
      const base = { identity: 'najibjuraimi@gmail.com', readOnly: s.mode === 'read-only' }
      if (!url.endsWith('/sync')) return new Response('{"error":"not_found"}', { status: 404 })
      if (init?.method === 'PUT') {
        if (s.mode === 'read-only') return new Response(JSON.stringify({ error: 'read_only' }), { status: 403 })
        s.puts++
        const body = JSON.parse(String(init.body)) as { docs: UserDocs }
        const winners: UserDocs = {}
        for (const [k, d] of Object.entries(body.docs) as [keyof UserDocs, NonNullable<UserDocs[keyof UserDocs]>][]) {
          const cur = s.docs[k]
          if (cur && cur.updatedAt >= d.updatedAt) winners[k] = cur
          else {
            s.docs[k] = d
            winners[k] = d
          }
        }
        return new Response(JSON.stringify({ ...base, docs: winners }), { status: 200 })
      }
      return new Response(JSON.stringify({ ...base, docs: s.docs }), { status: 200 })
    }) as typeof fetch,
  }
  return s
}

const T0 = '2026-10-16T08:00:00.000Z'
const flush = async (ms = 1000) => {
  await vi.advanceTimersByTimeAsync(ms)
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-16T09:00:00.000Z'))
  ;(globalThis as unknown as { window: unknown }).window = new FakeWindow()
  ;(globalThis as unknown as { CustomEvent: unknown }).CustomEvent ??= class<T> extends Event {
    detail: T
    constructor(type: string, init?: { detail: T }) {
      super(type)
      this.detail = init?.detail as T
    }
  }
  resetSyncForTests()
})
afterEach(() => {
  resetSyncForTests()
  vi.useRealTimers()
})

describe('sync engine', () => {
  it('pulls the cloud copy onto an empty device', async () => {
    const s = server({ 'piecebook.v1': { value: { owned: { 'OP09-001': { qty: 1 } } }, updatedAt: T0 } })
    startSync({ fetch: s.fetch, base: '/api' })
    await flush()
    expect(window.localStorage.getItem('piecebook.v1')).toBe('{"owned":{"OP09-001":{"qty":1}}}')
    expect(metaFor('piecebook.v1')).toEqual({ updatedAt: T0, dirty: false })
    expect(state().status).toBe('synced')
    expect(state().identity).toBe('najibjuraimi@gmail.com')
  })

  it('writes through within a second and the cloud ends up with the new stamp', async () => {
    const s = server()
    startSync({ fetch: s.fetch, base: '/api' })
    await flush()
    writeRaw('piecebook.watchlist.v1', '{"cards":{"OP09-001":{"at":"x"}},"sets":{},"characters":{}}')
    expect(state().pending).toBe(1)
    await flush(100)
    expect(s.puts).toBe(0)
    await flush(1000)
    expect(s.puts).toBe(1)
    expect(s.docs['piecebook.watchlist.v1']?.value).toEqual({ cards: { 'OP09-001': { at: 'x' } }, sets: {}, characters: {} })
    expect(state().pending).toBe(0)
    expect(metaFor('piecebook.watchlist.v1').dirty).toBe(false)
  })

  it('first login: holds the push, offers upload, and upload sends everything stamped now', async () => {
    window.localStorage.setItem('piecebook.v1', '{"owned":{"OP09-001":{"qty":2}}}')
    const s = server()
    startSync({ fetch: s.fetch, base: '/api' })
    await flush()
    expect(state().status).toBe('held')
    expect(s.puts).toBe(0)
    writeRaw('piecebook.decks.v1', '{"decks":[]}')
    await flush(2000)
    expect(s.puts).toBe(0)
    const at = new Date().toISOString()
    await uploadLocalData()
    await flush()
    expect(s.puts).toBe(1)
    expect(s.docs['piecebook.v1']?.value).toEqual({ owned: { 'OP09-001': { qty: 2 } } })
    expect(s.docs['piecebook.v1']?.updatedAt).toBe(at)
    expect(s.docs['piecebook.decks.v1']?.value).toEqual({ decks: [] })
    expect(state().status).toBe('synced')
  })

  it('"not now" keeps the device local for the session', async () => {
    window.localStorage.setItem('piecebook.v1', '{"owned":{"OP09-001":{"qty":2}}}')
    const s = server()
    startSync({ fetch: s.fetch, base: '/api' })
    await flush()
    keepLocalForNow()
    await refreshSync()
    expect(state().status).toBe('held')
    expect(s.puts).toBe(0)
  })

  it('a newer cloud copy returned by a push replaces the local one', async () => {
    const s = server()
    startSync({ fetch: s.fetch, base: '/api' })
    await flush()
    writeRaw('piecebook.v1', '{"owned":{}}')
    // Another device wrote in between, later than this device's stamp.
    s.docs['piecebook.v1'] = { value: { owned: { 'OP09-009': { qty: 1 } } }, updatedAt: '2026-10-16T09:30:00.000Z' }
    await flush(1000)
    expect(window.localStorage.getItem('piecebook.v1')).toBe('{"owned":{"OP09-009":{"qty":1}}}')
    expect(metaFor('piecebook.v1')).toEqual({ updatedAt: '2026-10-16T09:30:00.000Z', dirty: false })
  })

  it('pre-sync data on this device loses to the cloud but fills missing keys', async () => {
    window.localStorage.setItem('piecebook.v1', '{"owned":{"OLD":{"qty":1}}}')
    window.localStorage.setItem('piecebook.decks.v1', '{"decks":[{"id":"d1"}]}')
    const s = server({ 'piecebook.v1': { value: { owned: { NEW: { qty: 1 } } }, updatedAt: T0 } })
    startSync({ fetch: s.fetch, base: '/api' })
    await flush()
    expect(window.localStorage.getItem('piecebook.v1')).toBe('{"owned":{"NEW":{"qty":1}}}')
    expect(s.docs['piecebook.decks.v1']?.value).toEqual({ decks: [{ id: 'd1' }] })
    expect(state().status).toBe('synced')
  })

  it('offline keeps writes dirty and retries when the network is back', async () => {
    const s = server()
    s.mode = 'down'
    startSync({ fetch: s.fetch, base: '/api' })
    await flush()
    expect(state().status).toBe('offline')
    writeRaw('piecebook.v1', '{"owned":{}}')
    await flush(1000)
    expect(s.puts).toBe(0)
    expect(state().pending).toBe(1)
    s.mode = 'ok'
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(s.puts).toBe(1)
    expect(state().status).toBe('synced')
    expect(state().pending).toBe(0)
  })

  it('reports off, signed-out and read-only without touching local data', async () => {
    window.localStorage.setItem('piecebook.v1', '{"owned":{"A":{"qty":1}}}')
    const s = server()
    s.mode = 'off'
    startSync({ fetch: s.fetch, base: '/api' })
    await flush()
    expect(state().status).toBe('off')
    s.mode = 'signed-out'
    await refreshSync()
    expect(state().status).toBe('signed-out')
    s.mode = 'read-only'
    await refreshSync()
    expect(state().status).toBe('read-only')
    expect(window.localStorage.getItem('piecebook.v1')).toBe('{"owned":{"A":{"qty":1}}}')
  })
})
