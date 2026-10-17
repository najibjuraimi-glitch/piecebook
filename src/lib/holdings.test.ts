import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bookFromHoldings, fixtureBook } from './loadBought'
import {
  acceptSnapshot,
  createHolding,
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
    const book = bookFromHoldings(imported.doc.copies, TODAY, imported.doc.revision)
    expect(book.summary).toEqual(fixtureBook(TODAY).summary)
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
    const first = createHolding(emptyHoldings(), { revision: 0, rowId: 'OPB-0007', card: 'Nami', code: 'ST01-007' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const dupe = createHolding(first.doc, { revision: first.doc.revision, rowId: 'OPB-0007', card: 'Nami' })
    expect(dupe).toMatchObject({ ok: false, error: 'duplicate_row' })
    const patched = patchHolding(first.doc, 'OPB-0007', { revision: first.doc.revision, notes: 'kept' })
    expect(patched.ok).toBe(true)
    if (patched.ok) expect(patched.copy.notes).toBe('kept')
    expect(patchHolding(first.doc, 'OPB-9999', { revision: 1, notes: 'x' })).toMatchObject({ error: 'not_found' })
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
})
