import { describe, expect, it } from 'vitest'
import { ALL_CARDS } from '../data/seed'
import { legalGrade, type PriceQuote } from './boughtBook'
import { legalQuote } from './loadBought'
import { explainWatchCode } from './printResolve'
import { quoteFor } from '../../scripts/bought-prices.mjs'
import { quoteStored, rowsFromSeedTexts } from './storedQuotes'
import {
  createWatchItem,
  deleteWatchItem,
  dismissWatchHits,
  emptyWatch,
  freshWatchHits,
  patchWatchItem,
  setWatchPrice,
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
    if (!gone.ok) return
    const again = createWatchItem(gone.doc, { revision: 3, code: 'OP09-004', grade: 'Raw', targetSgd: 5 }, TODAY)
    expect(again).toMatchObject({ ok: true, item: { id: 'WL-0002' } })
    const stale = deleteWatchItem(edited.doc, 'WL-0001', { revision: 1 })
    expect(stale).toMatchObject({ ok: false, error: 'revision_conflict', revision: 2 })
    const missing = deleteWatchItem(edited.doc, 'WL-0099', { revision: 2 })
    expect(missing).toMatchObject({ ok: false, status: 404 })
    const nearMint = createWatchItem(emptyWatch(), { revision: 0, code: 'OP09-004', grade: 'Near Mint', targetSgd: 1 }, TODAY)
    expect(nearMint).toMatchObject({ ok: false, error: 'bad_field', detail: 'grade' })
  })

  it('prices the card number inside a sheet code and never a Japanese printing', () => {
    const rawQuote = legalQuote('OP09-004', 'raw')
    const parallel = legalQuote('OP09-004p3', 'raw')
    expect(rawQuote).not.toBeNull()
    expect(parallel).not.toBeNull()
    const [raw] = valueWatchItems(
      [{ id: 'WL-0001', code: 'OP09-004p3', grade: 'Raw', targetSgd: parallel!.sgd, notes: '', added: '2026-10-16' }],
      legalQuote,
      TODAY,
    )
    expect(raw.priceSgd).toBe(parallel!.sgd)
    expect(raw.priceSgd).not.toBe(rawQuote!.sgd)
    expect(raw.url).toBeNull()
    expect(raw.source).toBe(parallel!.source)
    expect(raw.asOf).toBe(parallel!.asOf)
    expect(raw.hit).toBe(false)
    expect(raw.stale).toBe(true)
    expect(legalQuote('OP09-004 SP', 'raw')).toBeNull()
    expect(quoteFor('OP09-004 SP', 'raw')).toBeNull()
    expect(legalQuote('OP09-004P3', 'raw')).toEqual(parallel)
    expect(legalQuote('OP09-004 parallel', 'raw')).toBeNull()

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

    const japanese: PriceQuote = {
      usd: 1601,
      sgd: 2053.92,
      source: 'OP Box Index',
      url: 'https://opboxindex.com/cards/op09-004p2',
      asOf: '2026-10-01',
      detail: 'Japanese printing · sold median',
    }
    const leaked = valueWatchItem({ id: 'WL-0004', code: 'OP09-004p2', grade: 'PSA 10', targetSgd: 99999, notes: '', added: TODAY }, () => japanese, TODAY)
    expect(leaked.priceLabel).toBe('No price yet')
    expect(leaked.priceSgd).toBeNull()
    expect(leaked.hit).toBe(false)
    expect(leaked.stale).toBe(false)

    const fresh = valueWatchItem(
      { id: 'WL-0005', code: 'OP09-004', grade: 'Raw', targetSgd: 999, notes: '', added: TODAY },
      () => ({ ...rawQuote!, asOf: '2026-10-09' }),
      TODAY,
    )
    const older = valueWatchItem(
      { id: 'WL-0006', code: 'OP09-004', grade: 'Raw', targetSgd: 999, notes: '', added: TODAY },
      () => ({ ...rawQuote!, asOf: '2026-10-08' }),
      TODAY,
    )
    expect(fresh.stale).toBe(false)
    expect(fresh.hit).toBe(true)
    expect(older.stale).toBe(true)
    expect(older.hit).toBe(false)
    expect(older.priceLabel).toBeNull()
    const open = valueWatchItem(
      { id: 'WL-0007', code: 'OP09-004', grade: 'Raw', targetSgd: null, notes: '', added: TODAY },
      () => ({ ...rawQuote!, asOf: '2026-10-12' }),
      TODAY,
    )
    expect(open.hit).toBe(false)
    expect(open.priceSgd).toBe(rawQuote!.sgd)
    expect(open.url).toBe(rawQuote!.url)
  })

  it('does not price a blank language or a Japanese printing from the seed text', () => {
    const rows = rowsFromSeedTexts([
      'card_number,language,market_usd,as_of,psa10_usd,psa10_as_of,psa10_source,psa10_url,psa10_printing\nZZ-001,,1.00,2026-10-01,,,,,\nZZ-002,JP,2.00,2026-10-01,,,,,\nZZ-003,EN,3.00,2026-10-01,100,2026-10-01,opboxindex,https://opboxindex.com/cards/zz,japanese\n',
    ])
    expect(quoteStored(rows, 'ZZ-001', 'raw')).toBeNull()
    expect(quoteStored(rows, 'ZZ-002', 'raw')).toBeNull()
    expect(quoteStored(rows, 'ZZ-003', 'psa10')).toBeNull()
    expect(quoteStored(rows, 'ZZ-003', 'raw')?.source).toBe('Limitless')
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
    const item = valueWatchItem(
      { id: 'WL-0001', code: 'OP09-004', grade: 'Raw', targetSgd: 999, notes: '', added: TODAY },
      () => ({ ...legalQuote('OP09-004', 'raw')!, asOf: '2026-10-12' }),
      TODAY,
    )
    expect(item.stale).toBe(false)
    expect(item.hit).toBe(true)
    expect(item.url).toContain('limitlesstcg.com')
    const first = freshWatchHits([{ ...item, externalId: 'CH-001' }], {})
    expect(first).toHaveLength(1)
    expect(first[0].priceSgd).toBe(item.priceSgd)
    expect(first[0].externalId).toBe('CH-001')
    const memory = dismissWatchHits({}, first)
    expect(freshWatchHits([item], memory)).toEqual([])
    const lower = { ...item, priceSgd: item.priceSgd! - 0.01, hit: true }
    const again = freshWatchHits([lower], memory)
    expect(again).toHaveLength(1)
    expect(again[0].previousLowSgd).toBe(item.priceSgd)
    const quiet = valueWatchItem({ ...item, code: 'OP09-004', grade: 'PSA 10', targetSgd: 1 }, legalQuote, TODAY)
    expect(freshWatchHits([quiet], {})).toEqual([])
  })

  it('rejects a variant word, keeps a print id, and allows a null target', () => {
    const prints = ALL_CARDS.map((card) => ({
      cardNumber: card.cardNumber,
      baseNumber: card.baseNumber,
      variant: card.variant || '',
      rarity: card.rarity,
      language: card.language,
    }))
    const named = explainWatchCode('OP09-004 SP', prints)
    expect(named.ok).toBe(false)
    if (!named.ok) expect(named.candidates).toEqual(['OP09-004p3', 'OP09-004p4'])
    const rejected = createWatchItem(emptyWatch(), { revision: 0, code: 'OP09-004 SP', grade: 'Raw', targetSgd: 5 }, TODAY, prints)
    expect(rejected).toMatchObject({ ok: false, error: 'ambiguous_print' })
    const made = createWatchItem(
      emptyWatch(),
      { revision: 0, code: 'eb03-053p2', grade: 'PSA 10', targetSgd: null, externalId: 'ch-001', priceChartingUrl: 'https://www.pricecharting.com/game/one-piece/nami' },
      TODAY,
      prints,
    )
    expect(made).toMatchObject({ ok: true, item: { code: 'EB03-053p2', grade: 'PSA 10', targetSgd: null, externalId: 'CH-001' } })
    if (!made.ok) return
    const again = createWatchItem(made.doc, { revision: 1, code: 'EB03-053p2', grade: 'PSA 10', targetSgd: 1 }, TODAY, prints)
    expect(again).toMatchObject({ ok: false, error: 'duplicate_print' })
    const sameChase = createWatchItem(made.doc, { revision: 1, code: 'OP09-004', grade: 'Raw', targetSgd: 1, externalId: 'CH-001' }, TODAY, prints)
    expect(sameChase).toMatchObject({ ok: false, error: 'duplicate_external_id' })
    const capital = createWatchItem(emptyWatch(), { revision: 0, code: 'OP09-004P3', grade: 'Raw', targetSgd: 1 }, TODAY, prints)
    expect(capital).toMatchObject({ ok: true, item: { code: 'OP09-004p3' } })
  })

  it('uses a fresh English quote, then a manual price, and does not fire a stale manual price', () => {
    const english = { ...legalQuote('OP09-004', 'raw')!, asOf: '2026-10-12' }
    const base = { id: 'WL-0001', code: 'OP09-004', grade: 'Raw' as const, targetSgd: 50, notes: '', added: TODAY, marketSgd: 40, marketAsOf: '2026-10-16', marketSource: 'Cards', marketUrl: 'https://www.pricecharting.com/a' }
    const fresh = valueWatchItem(base, () => english, TODAY)
    expect(fresh.source).toBe(english.source)
    expect(fresh.priceSgd).toBe(english.sgd)
    expect(fresh.priceSgd).not.toBe(40)
    expect(fresh.hit).toBe(true)

    const staleEnglish = valueWatchItem(base, () => ({ ...english, asOf: '2026-09-05' }), TODAY)
    expect(staleEnglish).toMatchObject({ priceSgd: 40, source: 'Cards', asOf: '2026-10-16', url: 'https://www.pricecharting.com/a', stale: false, hit: true, priceLabel: null })

    const noEnglish = valueWatchItem({ ...base, code: 'EB03-053p2', grade: 'PSA 10', targetSgd: 40 }, () => null, TODAY)
    expect(noEnglish.hit).toBe(true)
    expect(freshWatchHits([noEnglish], {})[0]).toMatchObject({ source: 'Cards', marketSgd: 40, marketSource: 'Cards', marketUrl: 'https://www.pricecharting.com/a' })

    const old = valueWatchItem({ ...base, marketAsOf: '2026-10-08' }, () => null, TODAY)
    expect(old.stale).toBe(true)
    expect(old.hit).toBe(false)
    expect(old.priceSgd).toBe(40)
    expect(freshWatchHits([old], {})).toEqual([])

    const undated = valueWatchItem({ ...base, marketAsOf: null }, () => null, TODAY)
    expect(undated.stale).toBe(true)
    expect(undated.hit).toBe(false)
    expect(undated.priceLabel).toBeNull()

    const none = valueWatchItem({ ...base, marketSgd: null }, () => null, TODAY)
    expect(none.priceLabel).toBe('No price yet')
    expect(none.hit).toBe(false)

    const unreadable = valueWatchItem(
      { ...base, marketSgd: null, marketAsOf: null },
      () => ({ ...english, asOf: '2026-02-30' }),
      TODAY,
    )
    expect(unreadable.stale).toBe(true)
    expect(unreadable.hit).toBe(false)
    expect(unreadable.priceSgd).toBe(english.sgd)
  })

  it('clears the manual price when the print or grade changes', () => {
    const made = createWatchItem(emptyWatch(), { revision: 0, code: 'OP09-004', grade: 'Raw', targetSgd: 80 }, TODAY)
    if (!made.ok) throw new Error('create')
    const priced = setWatchPrice(made.doc, 'WL-0001', {
      revision: 1,
      marketSgd: 40,
      marketAsOf: '2026-10-16',
      marketSource: 'Cards',
      marketUrl: 'https://www.pricecharting.com/a',
    }, TODAY)
    if (!priced.ok) throw new Error('price')
    const grade = patchWatchItem(priced.doc, 'WL-0001', { revision: 2, grade: 'PSA 10', marketSgd: 90, marketSource: 'Cards' }, TODAY)
    expect(grade).toMatchObject({
      ok: true,
      item: { grade: 'PSA 10', code: 'OP09-004', marketSgd: null, marketAsOf: null, marketSource: null, marketUrl: null },
    })
    const print = patchWatchItem(priced.doc, 'WL-0001', { revision: 2, code: 'ST01-007' }, TODAY)
    expect(print).toMatchObject({
      ok: true,
      item: { code: 'ST01-007', grade: 'Raw', marketSgd: null, marketAsOf: null, marketSource: null, marketUrl: null },
    })
    const same = patchWatchItem(priced.doc, 'WL-0001', { revision: 2, notes: 'kept', code: 'OP09-004P3'.replace('P3', '') }, TODAY)
    expect(same).toMatchObject({
      ok: true,
      item: { code: 'OP09-004', notes: 'kept', marketSgd: 40, marketSource: 'Cards', marketUrl: 'https://www.pricecharting.com/a' },
    })
  })

  it('sets the four manual fields in one revision-checked call', () => {
    const made = createWatchItem(emptyWatch(), { revision: 0, code: 'EB03-053p2', grade: 'PSA 10', targetSgd: 80 }, TODAY)
    if (!made.ok) throw new Error('create')
    const missing = setWatchPrice(made.doc, 'WL-0001', { revision: 1, marketSgd: 40 }, TODAY)
    expect(missing).toMatchObject({ ok: false, error: 'bad_field', detail: 'marketAsOf' })
    const priced = setWatchPrice(made.doc, 'WL-0001', {
      revision: 1,
      marketSgd: 40,
      marketAsOf: '2026-10-16',
      marketSource: 'Cards',
      marketUrl: 'https://www.pricecharting.com/a',
    }, TODAY)
    expect(priced).toMatchObject({
      ok: true,
      doc: { revision: 2 },
      item: { marketSgd: 40, marketAsOf: '2026-10-16', marketSource: 'Cards', marketUrl: 'https://www.pricecharting.com/a' },
    })
    const badDate = setWatchPrice(made.doc, 'WL-0001', {
      revision: 1,
      marketSgd: 40,
      marketAsOf: '17 Oct 2026',
      marketSource: 'Cards',
      marketUrl: null,
    }, TODAY)
    expect(badDate).toMatchObject({ ok: false, error: 'bad_date', detail: 'marketAsOf' })
    const impossible = setWatchPrice(made.doc, 'WL-0001', {
      revision: 1,
      marketSgd: 40,
      marketAsOf: '2026-13-45',
      marketSource: 'Cards',
      marketUrl: 'https://www.pricecharting.com/a',
    }, TODAY)
    expect(impossible).toMatchObject({ ok: false, error: 'bad_date', detail: 'marketAsOf' })
    const feb30 = setWatchPrice(made.doc, 'WL-0001', {
      revision: 1,
      marketSgd: 40,
      marketAsOf: '2026-02-30',
      marketSource: 'Cards',
      marketUrl: 'https://www.pricecharting.com/a',
    }, TODAY)
    expect(feb30).toMatchObject({ ok: false, error: 'bad_date', detail: 'marketAsOf' })
    const future = setWatchPrice(made.doc, 'WL-0001', {
      revision: 1,
      marketSgd: 40,
      marketAsOf: '2026-10-17',
      marketSource: 'Cards',
      marketUrl: 'https://www.pricecharting.com/a',
    }, TODAY)
    expect(future).toMatchObject({ ok: false, error: 'bad_date', detail: 'marketAsOf' })
    const httpLink = setWatchPrice(made.doc, 'WL-0001', {
      revision: 1,
      marketSgd: 40,
      marketAsOf: '2026-10-16',
      marketSource: 'Cards',
      marketUrl: 'http://www.pricecharting.com/a',
    }, TODAY)
    expect(httpLink).toMatchObject({ ok: false, error: 'bad_url' })
    const noSource = setWatchPrice(made.doc, 'WL-0001', {
      revision: 1,
      marketSgd: 40,
      marketAsOf: '2026-10-16',
      marketSource: null,
      marketUrl: 'https://www.pricecharting.com/a',
    }, TODAY)
    expect(noSource).toMatchObject({ ok: false, error: 'bad_field', detail: 'marketSource' })
    const stale = setWatchPrice(made.doc, 'WL-0001', {
      revision: 0,
      marketSgd: 1,
      marketAsOf: '2026-10-16',
      marketSource: 'Cards',
      marketUrl: null,
    }, TODAY)
    expect(stale).toMatchObject({ ok: false, error: 'revision_conflict', revision: 1 })
  })

  it('stores EN unless the row says JP', () => {
    const en = createWatchItem(emptyWatch(), { revision: 0, code: 'OP09-004', grade: 'Raw', targetSgd: 1 }, TODAY)
    expect(en).toMatchObject({ ok: true, item: { language: 'EN' } })
    const jp = createWatchItem(emptyWatch(), { revision: 0, code: 'OP09-004', grade: 'Raw', targetSgd: 1, language: 'jp' }, TODAY)
    expect(jp).toMatchObject({ ok: true, item: { language: 'JP' } })
    const bad = createWatchItem(emptyWatch(), { revision: 0, code: 'OP09-004', grade: 'Raw', targetSgd: 1, language: 'FR' }, TODAY)
    expect(bad).toMatchObject({ ok: false, error: 'bad_field', detail: 'language' })
  })
})
