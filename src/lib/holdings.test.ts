import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bookFromHoldings, fixtureBook } from './loadBought'
import {
  acceptSnapshot,
  createHolding,
  deleteHolding,
  emptyHoldings,
  importHoldings,
  markSold,
  nextRowId,
  patchHolding,
} from './holdings'

const TODAY = '2026-10-17'
const fixtureCsv = new TextDecoder().decode(readFileSync(fileURLToPath(new URL('../../data/bought-fixture.csv', import.meta.url))))

describe('holdings', () => {
  it('imports a Bought CSV once and values it like the sample book', () => {
    const imported = importHoldings(fixtureCsv, emptyHoldings(), false, 0)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.imported).toBe(9)
    expect(imported.skipped).toBe(2)
    expect(imported.doc.revision).toBe(1)
    expect(imported.doc.copies.find((c) => c.rowId === 'OPB-0001')?.priceChartingUrl).toBe('https://www.pricecharting.com/game/one-piece/nami')
    expect(imported.doc.copies.every((c) => c.priceChartingUrl == null || c.priceChartingUrl.startsWith('https://'))).toBe(true)
    const book = bookFromHoldings(imported.doc.copies, TODAY, imported.doc.revision)
    const dropLanguage = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => (key === 'language' ? undefined : item)))
    expect(dropLanguage(book.summary)).toEqual(dropLanguage(fixtureBook(TODAY).summary))
    const enel = book.copies.find((c) => c.rowId === 'OPB-0003')!
    expect(enel.quote?.source).toBe('Sheet (Cards)')
    expect(enel.quote?.detail ?? '').not.toMatch(/japanese/i)
    expect(importHoldings(fixtureCsv, imported.doc, false, imported.doc.revision)).toMatchObject({
      ok: false,
      error: 'already_imported',
    })
    const replaced = importHoldings(fixtureCsv, imported.doc, true, imported.doc.revision)
    expect(replaced.ok).toBe(true)
    if (replaced.ok) expect(replaced.doc.revision).toBe(2)
  })

  it('maps Market as of and Source, and keeps the CSV Row IDs', () => {
    const both = [
      'Row ID,Code,Grade/Raw,All-in SGD,Status,Card,Market value SGD,Market as of,Source,Market source',
      'OPB-0009,ST01-007,Raw,1,Held,Nami,4,2026-10-09,From source,',
      'OPB-0001,OP05-100p2,PSA 10,400,Held,Enel,350,2026-09-01,Ignored,From market source',
      'OPB-0002,ST01-007,Raw,2,Held,Nami,5,2026-10-02,Desk,',
      'OPB-0003,OP05-001,Raw,3,Held,Sabo,6,2026-10-03,Desk,',
      'OPB-0004,OP16-001,Raw,4,Held,Ace,7,2026-10-04,Desk,',
      'OPB-0005,OP17-118,Raw,5,Held,Xebec,,,,',
      'OPB-0006,EB05-033,PSA 9,15,Held,Robin,40,2026-10-12,Cards,',
      'OPB-0007,OP05-001,Raw,5,Held,Sabo,12,2026-08-01,,',
      'OPB-0008,OP01-001,Raw,1,Held,Luffy,2,2026-07-01,Only source,',
    ].join('\n')
    const imported = importHoldings(both, emptyHoldings(), false, 0)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.doc.copies.map((c) => c.rowId)).toEqual([
      'OPB-0009',
      'OPB-0001',
      'OPB-0002',
      'OPB-0003',
      'OPB-0004',
      'OPB-0005',
      'OPB-0006',
      'OPB-0007',
      'OPB-0008',
    ])
    const byId = Object.fromEntries(imported.doc.copies.map((c) => [c.rowId, c]))
    expect(byId['OPB-0009']).toMatchObject({ marketAsOf: '2026-10-09', marketSource: 'From source' })
    expect(byId['OPB-0001']).toMatchObject({ marketAsOf: '2026-09-01', marketSource: 'From market source' })
    expect(byId['OPB-0005']).toMatchObject({ marketValueSgd: null, marketAsOf: null, marketSource: '' })
    expect(byId['OPB-0007']).toMatchObject({ marketAsOf: '2026-08-01', marketSource: 'Sheet (Cards)' })
    expect(byId['OPB-0008']).toMatchObject({ marketAsOf: '2026-07-01', marketSource: 'Only source' })

    const sourceOnly = importHoldings(
      'Row ID,Code,Grade/Raw,All-in SGD,Status,Card,Market value SGD,Market as of,Source\nOPB-0003,ST01-007,Raw,2,Held,Nami,9,2026-10-17,Cards\n',
      emptyHoldings(),
      false,
      0,
    )
    expect(sourceOnly.ok).toBe(true)
    if (!sourceOnly.ok) return
    expect(sourceOnly.doc.copies[0]).toMatchObject({ rowId: 'OPB-0003', marketAsOf: '2026-10-17', marketSource: 'Cards' })
  })

  it('assigns the next Row ID and sums a blank all-in', () => {
    expect(nextRowId([{ rowId: 'OPB-0009' }, { rowId: 'OPB-0001' }])).toBe('OPB-0010')
    const created = createHolding(emptyHoldings(), {
      revision: 0,
      card: 'Nami',
      code: 'ST01-007',
      grade: 'Raw',
      paidSgd: 1.5,
      gstSgd: 0.2,
      forwardingSgd: 0.3,
      marketValueSgd: 4,
      marketSource: 'Cards',
      marketAsOf: '2026-10-12',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.copy.rowId).toBe('OPB-0001')
    expect(created.copy.allInSgd).toBe(2)
    expect(created.copy.status).toBe('Held')
    expect(created.copy.marketSource).toBe('Cards')
    const clash = createHolding(created.doc, { revision: 0, card: 'Other', code: 'OP01-001' })
    expect(clash).toMatchObject({ ok: false, error: 'revision_conflict', revision: 1 })
  })

  it('fills net and realized when a copy is marked sold', () => {
    const created = createHolding(emptyHoldings(), { revision: 0, card: 'Sabo', code: 'OP05-001', grade: 'Raw', allInSgd: 5 })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const sold = markSold(created.doc, created.copy.rowId, {
      revision: created.doc.revision,
      soldDate: '30 Sep 2026',
      soldPrice: 8,
      currency: 'sgd',
      feesSgd: 0.4,
      shippingOutSgd: 1,
    })
    expect(sold.ok).toBe(true)
    if (!sold.ok) return
    expect(sold.copy.status).toBe('Sold')
    expect(sold.copy.soldDate).toBe('2026-09-30')
    expect(sold.copy.currency).toBe('SGD')
    expect(sold.copy.netSgd).toBe(6.6)
    expect(sold.copy.realizedSgd).toBe(1.6)
    const usd = markSold(created.doc, created.copy.rowId, {
      revision: 1,
      soldPrice: 50,
      currency: 'USD',
      saleFx: 1.28,
    })
    expect(usd.ok).toBe(true)
    if (!usd.ok) return
    expect(usd.copy.netSgd).toBe(64)
    expect(usd.copy.realizedSgd).toBe(59)
  })

  it('rejects a bad link and a second copy of the same Row ID', () => {
    const bad = createHolding(emptyHoldings(), {
      revision: 0,
      card: 'Nami',
      priceChartingUrl: 'javascript:alert(1)',
    })
    expect(bad).toMatchObject({ ok: false, error: 'bad_url' })
    const http = createHolding(emptyHoldings(), {
      revision: 0,
      card: 'Nami',
      priceChartingUrl: 'http://www.pricecharting.com/game/one-piece/nami',
    })
    expect(http).toMatchObject({ ok: false, error: 'bad_url' })
    const first = createHolding(emptyHoldings(), { revision: 0, rowId: 'OPB-0007', card: 'Nami', code: 'ST01-007' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const dupe = createHolding(first.doc, { revision: first.doc.revision, rowId: 'OPB-0007', card: 'Nami' })
    expect(dupe).toMatchObject({ ok: false, error: 'duplicate_row' })
    const patched = patchHolding(first.doc, 'OPB-0007', { revision: first.doc.revision, notes: 'kept' })
    expect(patched.ok).toBe(true)
    if (patched.ok) expect(patched.copy.notes).toBe('kept')
    expect(patchHolding(first.doc, 'OPB-9999', { revision: 1, notes: 'x' })).toMatchObject({ error: 'not_found' })
    const named = patchHolding(first.doc, 'OPB-0007', { revision: first.doc.revision, exactPrint: 'OP09-004P3' })
    expect(named.ok).toBe(true)
    if (named.ok) expect(named.copy.exactPrint).toBe('OP09-004p3')
    const removed = deleteHolding(first.doc, 'OPB-0007', { revision: first.doc.revision })
    expect(removed).toMatchObject({ ok: true, doc: { revision: first.doc.revision + 1, copies: [] } })
    expect(deleteHolding(first.doc, 'OPB-0007', { revision: 0 })).toMatchObject({ ok: false, error: 'revision_conflict' })
    expect(deleteHolding(first.doc, 'OPB-9999', { revision: first.doc.revision })).toMatchObject({ ok: false, error: 'not_found' })
  })

  it('keeps older snapshot days and replaces today', () => {
    const row = {
      asOf: TODAY,
      heldCopies: 1,
      listedCopies: 0,
      soldCopies: 0,
      costSgd: 2,
      marketSgd: 1,
      unpricedHeld: 0,
      unrealizedSgd: -1,
      realizedSgd: null,
      overallSgd: -1,
      capitalSgd: 2,
      roi: -0.5,
    }
    expect(acceptSnapshot([], { ...row, asOf: '2026-10-16' }, TODAY)).toMatchObject({ error: 'as_of_not_today' })
    const first = acceptSnapshot([], row, TODAY)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = acceptSnapshot(first.history, { ...row, costSgd: 3 }, TODAY)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.history).toHaveLength(1)
    expect(second.history[0].costSgd).toBe(3)
    expect(second.history[0].source).toBe('piecebook')
  })

  it('stores EN unless the copy says JP', () => {
    const en = createHolding(emptyHoldings(), { revision: 0, card: 'Ace', code: 'OP13-002', grade: 'Raw' })
    expect(en).toMatchObject({ ok: true, copy: { language: 'EN' } })
    const jp = createHolding(emptyHoldings(), { revision: 0, card: 'Ace', code: 'OP13-002', grade: 'Raw', language: 'JP' })
    expect(jp).toMatchObject({ ok: true, copy: { language: 'JP' } })
    const bad = createHolding(emptyHoldings(), { revision: 0, card: 'Ace', code: 'OP13-002', grade: 'Raw', language: 'FR' })
    expect(bad).toMatchObject({ ok: false, error: 'bad_field', detail: 'language' })
  })

  it('keeps a stored JP language when a re-import or a patch leaves it out', () => {
    const imported = importHoldings(fixtureCsv, emptyHoldings(), false, 0)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const doc = {
      ...imported.doc,
      copies: imported.doc.copies.map((copy) => (copy.rowId === 'OPB-0001' ? { ...copy, language: 'JP' as const } : copy)),
    }
    const again = importHoldings(fixtureCsv, doc, true, doc.revision)
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.doc.copies.find((copy) => copy.rowId === 'OPB-0001')?.language).toBe('JP')
    expect(again.doc.copies.find((copy) => copy.rowId === 'OPB-0002')?.language).toBe('EN')
    const forced = importHoldings(
      'Row ID,Code,Grade/Raw,All-in SGD,Status,Language\nOPB-0001,OP05-100p2,PSA 10,400,Held,EN\n',
      again.doc,
      true,
      again.doc.revision,
    )
    expect(forced.ok).toBe(true)
    if (!forced.ok) return
    expect(forced.doc.copies[0]?.language).toBe('EN')

    const made = createHolding(emptyHoldings(), { revision: 0, card: 'Ace', code: 'OP13-002', grade: 'Raw', language: 'JP' })
    expect(made.ok).toBe(true)
    if (!made.ok) return
    const notes = patchHolding(made.doc, made.copy.rowId, { revision: made.doc.revision, notes: 'desk' })
    expect(notes.ok).toBe(true)
    if (!notes.ok) return
    expect(notes.copy.language).toBe('JP')
    const blank = patchHolding(notes.doc, notes.copy.rowId, { revision: notes.doc.revision, language: '' })
    expect(blank.ok).toBe(true)
    if (!blank.ok) return
    expect(blank.copy.language).toBe('JP')
    const absent = patchHolding(blank.doc, blank.copy.rowId, { revision: blank.doc.revision, language: null })
    expect(absent.ok).toBe(true)
    if (!absent.ok) return
    expect(absent.copy.language).toBe('JP')
  })
})
