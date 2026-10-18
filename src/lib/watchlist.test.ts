import { describe, expect, it } from 'vitest'
import { ALL_CARDS } from '../data/seed'
import { legalGrade } from './boughtBook'
import { legalQuote } from './loadBought'
import {
  createWatchItem,
  deleteWatchItem,
  dismissWatchHits,
  emptyWatch,
  freshWatchHits,
  patchWatchItem,
  valueWatchItem,
  valueWatchItems,
} from './watchlist'

const TODAY = '2026-10-16'

describe('watchlist book', () => {
  it('starts empty and does not invent a chase row', () => {
    expect(emptyWatch()).toEqual({ revision: 0, items: [] })
    const made = createWatchItem(emptyWatch(), { revision: 0, id: 'CH-001', code: 'OP09-004', grade: 'Raw', targetSgd: 1 }, TODAY)
    expect(made).toMatchObject({ ok: false, error: 'bad_id' })
  })

  it('assigns WL-xxxx, keeps a given id, and refuses a stale revision', () => {
    const first = createWatchItem(emptyWatch(), { revision: 0, code: 'OP09-004', grade: 'raw', targetSgd: '5.5', notes: 'desk', added: '17 Oct 2026' }, TODAY)
    expect(first).toMatchObject({
      ok: true,
      doc: { revision: 1 },
      item: { id: 'WL-0001', code: 'OP09-004', grade: 'Raw', targetSgd: 5.5, notes: 'desk', added: '2026-10-17' },
    })
    if (!first.ok) return
    const given = createWatchItem(first.doc, { revision: 1, id: 'WL-0006', code: 'ST01-007', grade: 'PSA 9', targetSgd: 10 }, TODAY)
    expect(given).toMatchObject({ ok: true, item: { id: 'WL-0006' } })
    if (!given.ok) return
    const next = createWatchItem(given.doc, { revision: 2, code: 'OP01-001', grade: 'PSA 10', targetSgd: 1 }, TODAY)
    expect(next).toMatchObject({ ok: true, item: { id: 'WL-0007' } })
    const clash = createWatchItem(first.doc, { revision: 0, code: 'OP01-001', grade: 'Raw', targetSgd: 1 }, TODAY)
    expect(clash).toMatchObject({ ok: false, error: 'revision_conflict', revision: 1 })
  })

  it('edits and removes a target', () => {
    const made = createWatchItem(emptyWatch(), { revision: 0, code: 'OP09-004', grade: 'Raw', targetSgd: 5 }, TODAY)
    if (!made.ok) throw new Error('create')
    const edited = patchWatchItem(made.doc, 'WL-0001', { revision: 1, targetSgd: 4, notes: 'lower' }, TODAY)
    expect(edited).toMatchObject({ ok: true, doc: { revision: 2 }, item: { targetSgd: 4, notes: 'lower', code: 'OP09-004' } })
    if (!edited.ok) return
    const gone = deleteWatchItem(edited.doc, 'WL-0001', { revision: 2 })
    expect(gone).toMatchObject({ ok: true, doc: { revision: 3, items: [] } })
    const missing = deleteWatchItem(edited.doc, 'WL-0099', { revision: 2 })
    expect(missing).toMatchObject({ ok: false, status: 404 })
  })

  it('prices the card number inside a sheet code and never a Japanese printing', () => {
    const rawQuote = legalQuote('OP09-004', 'raw')
    const parallel = legalQuote('OP09-004p3', 'raw')
    expect(rawQuote).not.toBeNull()
    expect(parallel).not.toBeNull()
    const [raw] = valueWatchItems(
      [{ id: 'WL-0001', code: 'OP09-004 SP', grade: 'Raw', targetSgd: rawQuote!.sgd, notes: '', added: '2026-10-16' }],
      legalQuote,
      TODAY,
    )
    expect(raw.priceSgd).toBe(rawQuote!.sgd)
    expect(raw.priceSgd).not.toBe(parallel!.sgd)
    expect(raw.source).toBe(rawQuote!.source)
    expect(raw.asOf).toBe(rawQuote!.asOf)
    expect(raw.hit).toBe(true)
    expect(raw.stale).toBe(true)
    expect(raw.code).toBe('OP09-004 SP')

    const above = valueWatchItem({ ...raw, targetSgd: Math.round((raw.priceSgd! - 0.01) * 100) / 100 }, legalQuote, TODAY)
    expect(above.hit).toBe(false)

    const slab = valueWatchItem({ id: 'WL-0002', code: 'OP09-004', grade: 'PSA 10', targetSgd: 1, notes: '', added: TODAY }, legalQuote, TODAY)
    expect(legalQuote('OP09-004', 'psa10')).toBeNull()
    expect(slab.priceLabel).toBe('No price yet')
    expect(slab.priceSgd).toBeNull()
    expect(slab.hit).toBe(false)
    expect(slab.stale).toBe(false)

    const manga = valueWatchItem({ id: 'WL-0003', code: 'OP09-004p2', grade: 'PSA 10', targetSgd: 99999, notes: '', added: TODAY }, legalQuote, TODAY)
    expect(legalQuote('OP09-004p2', 'psa10')).toBeNull()
    expect(manga.priceLabel).toBe('No price yet')
    expect(manga.hit).toBe(false)
  })

  it('uses the same English figure as the book for every print', () => {
    for (const card of ALL_CARDS) {
      for (const grade of ['Raw', 'PSA 9', 'PSA 10'] as const) {
        const quote = legalQuote(card.cardNumber, legalGrade(grade))
        const item = valueWatchItem(
          { id: 'WL-0001', code: card.cardNumber, grade, targetSgd: quote?.sgd ?? 1, notes: '', added: TODAY },
          legalQuote,
          TODAY,
        )
        if (!quote) {
          expect(item.priceLabel, card.cardNumber + ' ' + grade).toBe('No price yet')
          expect(item.hit).toBe(false)
        } else {
          expect(item.priceSgd, card.cardNumber + ' ' + grade).toBe(quote.sgd)
          expect(item.source).toBe(quote.source)
          expect(item.asOf).toBe(quote.asOf)
          expect((quote.detail || '').toLowerCase()).not.toContain('japanese')
        }
      }
    }
  })

  it('fires a hit once, and again only on a lower price', () => {
    const item = valueWatchItem({ id: 'WL-0001', code: 'OP09-004', grade: 'Raw', targetSgd: 999, notes: '', added: TODAY }, legalQuote, TODAY)
    const first = freshWatchHits([item], {})
    expect(first).toHaveLength(1)
    expect(first[0].priceSgd).toBe(item.priceSgd)
    const memory = dismissWatchHits({}, first)
    expect(freshWatchHits([item], memory)).toEqual([])
    const lower = { ...item, priceSgd: item.priceSgd! - 0.01, hit: true }
    const again = freshWatchHits([lower], memory)
    expect(again).toHaveLength(1)
    expect(again[0].previousLowSgd).toBe(item.priceSgd)
    const quiet = valueWatchItem({ ...item, code: 'OP09-004', grade: 'PSA 10', targetSgd: 1 }, legalQuote, TODAY)
    expect(freshWatchHits([quiet], {})).toEqual([])
  })
})
