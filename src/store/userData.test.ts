import { beforeEach, describe, expect, it } from 'vitest'
import { planMerge, stampAll } from '../lib/syncMerge'
import {
  applyImport,
  applyRemote,
  buildExport,
  decodeValue,
  dirtyDocs,
  encodeValue,
  hasMeaningfulData,
  markClean,
  metaFor,
  parseExport,
  snapshotDocs,
  subscribeUserData,
  summariseDocs,
  UNKNOWN_AGE,
  writeRaw,
} from './userData'

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
  location = { origin: 'https://najibjuraimi-glitch.github.io' }
}

beforeEach(() => {
  const w = new FakeWindow()
  ;(globalThis as unknown as { window: unknown }).window = w
  ;(globalThis as unknown as { CustomEvent: unknown }).CustomEvent ??= class<T> extends Event {
    detail: T
    constructor(type: string, init?: { detail: T }) {
      super(type)
      this.detail = init?.detail as T
    }
  }
})

const T1 = '2026-10-16T08:00:00.000Z'
const T2 = '2026-10-16T09:00:00.000Z'

describe('encode / decode', () => {
  it('round-trips objects, arrays and plain strings', () => {
    expect(encodeValue('{"owned":{}}')).toEqual({ owned: {} })
    expect(encodeValue('[]')).toEqual([])
    expect(encodeValue('usd')).toBe('usd')
    expect(encodeValue('2026-10-16T08:00:00.000Z')).toBe('2026-10-16T08:00:00.000Z')
    expect(decodeValue(encodeValue('{"a":1}'))).toBe('{"a":1}')
    expect(decodeValue('sgd')).toBe('sgd')
    expect(encodeValue('{not json')).toBe('{not json')
  })
})

describe('writeRaw / meta', () => {
  it('stamps, dirties and notifies; remote apply does not dirty', () => {
    const seen: string[] = []
    const off = subscribeUserData('piecebook.v1', (c) => seen.push(c.source))
    expect(metaFor('piecebook.v1')).toEqual({ updatedAt: UNKNOWN_AGE, dirty: false })
    expect(writeRaw('piecebook.v1', '{"owned":{}}', 'local', T1)).toBe(true)
    expect(metaFor('piecebook.v1')).toEqual({ updatedAt: T1, dirty: true })
    expect(dirtyDocs()).toEqual({ 'piecebook.v1': { value: { owned: {} }, updatedAt: T1 } })
    markClean('piecebook.v1', T1)
    expect(dirtyDocs()).toEqual({})
    applyRemote('piecebook.v1', { value: { owned: { a: 1 } }, updatedAt: T2 })
    expect(window.localStorage.getItem('piecebook.v1')).toBe('{"owned":{"a":1}}')
    expect(metaFor('piecebook.v1')).toEqual({ updatedAt: T2, dirty: false })
    expect(seen).toEqual(['local', 'remote'])
    off()
  })
  it('markClean leaves a key dirty when it was written again after the push', () => {
    writeRaw('piecebook.v1', '{"owned":{}}', 'local', T1)
    writeRaw('piecebook.v1', '{"owned":{"b":1}}', 'local', T2)
    markClean('piecebook.v1', T1)
    expect(metaFor('piecebook.v1').dirty).toBe(true)
  })
})

describe('snapshot and summary', () => {
  it('counts what a collector typed and ignores preference flags', () => {
    writeRaw('piecebook.displayCurrency.v1', 'sgd', 'local', T1)
    expect(hasMeaningfulData(snapshotDocs())).toBe(false)
    writeRaw('piecebook.v1', JSON.stringify({ owned: { 'OP09-001': { qty: 1, ownedAt: T1 }, 'OP09-002': { qty: 4, ownedAt: T1 } } }), 'local', T1)
    writeRaw('piecebook.watchlist.v1', JSON.stringify({ cards: { 'OP09-003': { at: T1 } }, sets: {}, characters: { Nami: { at: T1 } } }), 'local', T1)
    writeRaw('piecebook.pregrade.v1', JSON.stringify([{ id: 'p1', cardNumber: 'OP09-070' }]), 'local', T1)
    const s = summariseDocs(snapshotDocs())
    expect(s).toEqual({ ownedCards: 2, decks: 0, watching: 2, predictions: 1, prefs: 1 })
    expect(hasMeaningfulData(snapshotDocs())).toBe(true)
  })
})

describe('export / import', () => {
  it('writes a file the importer accepts and stamps imported keys now', () => {
    writeRaw('piecebook.v1', '{"owned":{"OP09-001":{"qty":1,"ownedAt":"x"}}}', 'local', T1)
    writeRaw('piecebook.readerCutoff.v1', 'wano', 'local', T1)
    const file = buildExport(new Date(T2))
    expect(file).toMatchObject({ app: 'piecebook', format: 1, exportedAt: T2, origin: 'https://najibjuraimi-glitch.github.io' })
    expect(file.docs['piecebook.readerCutoff.v1']).toEqual({ value: 'wano', updatedAt: T1 })

    const parsed = parseExport(JSON.stringify(file))
    window.localStorage.clear()
    const written = applyImport(parsed.docs, T2)
    expect(written.sort()).toEqual(['piecebook.readerCutoff.v1', 'piecebook.v1'])
    expect(window.localStorage.getItem('piecebook.v1')).toBe('{"owned":{"OP09-001":{"qty":1,"ownedAt":"x"}}}')
    expect(window.localStorage.getItem('piecebook.readerCutoff.v1')).toBe('wano')
    expect(metaFor('piecebook.v1')).toEqual({ updatedAt: T2, dirty: true })
  })
  it('refuses files that are not a Piecebook backup, and drops unknown keys', () => {
    expect(() => parseExport('nope')).toThrow(/not JSON/)
    expect(() => parseExport('{"app":"other","docs":{}}')).toThrow(/not a Piecebook backup/)
    expect(() => parseExport('{"app":"piecebook","format":9,"docs":{}}')).toThrow(/format 9/)
    const f = parseExport('{"app":"piecebook","format":1,"docs":{"piecebook.v1":{"value":{"owned":{}}},"evil":{"value":1}}}')
    expect(Object.keys(f.docs)).toEqual(['piecebook.v1'])
    expect(f.docs['piecebook.v1']?.updatedAt).toBe(UNKNOWN_AGE)
  })
})

describe('planMerge', () => {
  const col = (v: unknown, updatedAt: string) => ({ 'piecebook.v1': { value: v, updatedAt } })
  it('newer stamp wins per key', () => {
    const plan = planMerge(
      { ...col({ owned: { a: 1 } }, T2), 'piecebook.decks.v1': { value: { decks: [] }, updatedAt: T1 } },
      { ...col({ owned: {} }, T1), 'piecebook.decks.v1': { value: { decks: [1] }, updatedAt: T2 } },
    )
    expect(plan.push).toEqual(col({ owned: { a: 1 } }, T2))
    expect(plan.applyRemote).toEqual({ 'piecebook.decks.v1': { value: { decks: [1] }, updatedAt: T2 } })
    expect(plan.offerUpload).toBe(false)
  })
  it('equal stamps do nothing', () => {
    const plan = planMerge(col({ owned: {} }, T1), col({ owned: {} }, T1))
    expect(plan).toEqual({ applyRemote: {}, push: {}, offerUpload: false })
  })
  it('pre-sync local data loses to any cloud copy but fills keys the cloud lacks', () => {
    const plan = planMerge(
      { ...col({ owned: { a: 1 } }, UNKNOWN_AGE), 'piecebook.decks.v1': { value: { decks: [1] }, updatedAt: UNKNOWN_AGE } },
      col({ owned: {} }, T1),
    )
    expect(plan.applyRemote).toEqual(col({ owned: {} }, T1))
    expect(plan.push).toEqual({ 'piecebook.decks.v1': { value: { decks: [1] }, updatedAt: UNKNOWN_AGE } })
    expect(plan.offerUpload).toBe(false)
  })
  it('first login: empty cloud and real local data holds the push and offers upload', () => {
    const plan = planMerge(col({ owned: { a: { qty: 1 } } }, UNKNOWN_AGE), {})
    expect(plan.offerUpload).toBe(true)
    expect(plan.push).toEqual(col({ owned: { a: { qty: 1 } } }, UNKNOWN_AGE))
    const prefsOnly = planMerge({ 'piecebook.displayCurrency.v1': { value: 'sgd', updatedAt: UNKNOWN_AGE } }, {})
    expect(prefsOnly.offerUpload).toBe(false)
  })
  it('stampAll re-dates every doc', () => {
    expect(stampAll(col({ owned: {} }, UNKNOWN_AGE), T2)).toEqual(col({ owned: {} }, T2))
  })
})
