import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyPsa10,
  emptyGraded,
  piecebookPrintId,
  psa10Quote,
  quotesForSet,
  slugAgreesWithVariant,
  usdField,
} from './graded-prices.mjs'

const enelPage = 'https://opboxindex.com/cards/op05-100-enel-100-sp.html'

function row(partial) {
  return {
    set_code: 'OP-05',
    card_number: 'OP05-100p2',
    name: 'Enel',
    rarity: 'SP',
    language: 'EN',
    variant: 'Special Card',
    ...emptyGraded(),
    ...partial,
  }
}

function sold(partial = {}) {
  return {
    id: 'OP05-100_p2',
    rarity: 'SP',
    nameEn: 'Enel',
    cardPage: enelPage,
    psa10: { usd: 260, n: 7, basis: 'sold', observedOn: '2026-09-14' },
    ...partial,
  }
}

const trackedUsd = new Map([
  [enelPage, { currency: 'USD', medianUsd: 260, sampleSize: 7, sampleCollectedOn: '2026-09-14' }],
])

describe('graded price quotes', () => {
  it('maps an underscore parallel id onto the Piecebook print id', () => {
    assert.equal(piecebookPrintId('OP05-100_p2'), 'OP05-100p2')
    assert.equal(piecebookPrintId('OP05-100'), 'OP05-100')
    assert.equal(piecebookPrintId('OP05-100-p2'), null)
  })

  it('accepts a Japanese PSA 10 sold median only for that exact print', () => {
    const rows = [
      row({ card_number: 'OP05-100', rarity: 'SR', variant: '' }),
      row({ card_number: 'OP05-100p1', rarity: 'SR', variant: 'Alternate Art' }),
      row({ card_number: 'OP05-100p2' }),
    ]
    const list = {
      set: 'OP-05',
      edition: 'Japanese',
      cards: [
        sold({ id: 'OP05-100', rarity: 'SR', psa10: null, cardPage: null }),
        sold({
          id: 'OP05-100_p1',
          rarity: 'SR',
          cardPage: 'https://opboxindex.com/cards/op05-100-enel-alternate-art.html',
          psa10: null,
        }),
        sold(),
      ],
    }
    const { quotes, skipped } = quotesForSet(list, rows, trackedUsd)
    assert.deepEqual(skipped, [])
    assert.equal(quotes.size, 1)
    assert.deepEqual(quotes.get('OP05-100p2'), {
      cardNumber: 'OP05-100p2',
      usd: '260',
      asOf: '2026-09-14',
      url: enelPage,
      printing: 'japanese',
    })
    const next = applyPsa10(rows, quotes)
    assert.equal(next[0].psa10_usd, '')
    assert.equal(next[1].psa10_usd, '')
    assert.equal(next[2].psa10_usd, '260')
    assert.equal(next[2].psa10_source, 'opboxindex')
    assert.equal(next[2].psa10_printing, 'japanese')
    assert.equal(next[2].psa9_usd, '')
  })

  it('does not keep a non-USD sample or a slug that names a different finish', () => {
    const krw = psa10Quote(sold(), {
      printing: 'japanese',
      seedRow: row(),
      tracked: { currency: 'KRW', medianUsd: 260, sampleSize: 7, sampleCollectedOn: '2026-09-14' },
    })
    assert.equal(krw.ok, false)
    assert.equal(krw.reason, 'currency')

    const mangaOnSuper = psa10Quote(
      sold({
        id: 'OP13-120_p2',
        rarity: 'SEC',
        nameEn: 'Sabo',
        cardPage: 'https://opboxindex.com/cards/op13-120-sabo-120-super-alternate-art.html',
        psa10: { usd: 1301, n: 4, basis: 'sold', observedOn: '2026-09-14' },
      }),
      {
        printing: 'japanese',
        seedRow: row({ card_number: 'OP13-120p2', name: 'Sabo', rarity: 'SEC', variant: 'Manga Art', set_code: 'OP-13' }),
        tracked: null,
      },
    )
    assert.equal(mangaOnSuper.ok, false)
    assert.equal(mangaOnSuper.reason, 'variant')
  })

  it('drops an ask, a thin sample, a missing link and a borrowed base id', () => {
    const seedRow = row()
    assert.equal(psa10Quote(sold({ psa10: { usd: 260, n: 7, basis: 'auction', observedOn: '2026-09-14' } }), { printing: 'japanese', seedRow, tracked: null }).reason, 'basis')
    assert.equal(psa10Quote(sold({ psa10: { usd: 260, n: 2, basis: 'sold', observedOn: '2026-09-14' } }), { printing: 'japanese', seedRow, tracked: null }).reason, 'sample')
    assert.equal(psa10Quote(sold({ cardPage: null }), { printing: 'japanese', seedRow, tracked: null }).reason, 'url')
    assert.equal(psa10Quote(sold({ id: 'OP05-100' }), { printing: 'japanese', seedRow, tracked: null }).reason, 'absent')
    assert.equal(psa10Quote(sold({ rarity: 'SR' }), { printing: 'japanese', seedRow, tracked: null }).reason, 'rarity')
    assert.equal(psa10Quote(sold({ nameEn: 'Nami' }), { printing: 'japanese', seedRow, tracked: null }).reason, 'name')
    assert.equal(slugAgreesWithVariant('Manga Art', 'https://opboxindex.com/cards/op04-083-sabo-alternate-art-manga.html'), true)
    assert.equal(slugAgreesWithVariant('Special Card', 'https://opboxindex.com/cards/op05-100-enel-100-sp.html'), true)
    assert.equal(slugAgreesWithVariant('Full Art', 'https://opboxindex.com/cards/op02-059-boa-hancock-box-topper.html'), true)
    assert.equal(usdField(96.3), '96.3')
    assert.equal(usdField(2693.94), '2693.94')
    assert.equal(usdField(0), null)
  })

  it('clears a stale PSA 10 when the list no longer has a sold median and leaves PSA 9 untouched', () => {
    const rows = [row({ psa10_usd: '260', psa10_as_of: '2026-09-14', psa10_source: 'opboxindex', psa10_url: enelPage, psa10_printing: 'japanese', psa9_usd: '10', psa9_as_of: '2026-09-14', psa9_source: 'opboxindex', psa9_url: enelPage, psa9_printing: 'japanese' })]
    const [next] = applyPsa10(rows, new Map())
    assert.equal(next.psa10_usd, '')
    assert.equal(next.psa10_url, '')
    assert.equal(next.psa9_usd, '10')
  })

  it('refuses a list whose edition is not Japanese or English', () => {
    const { quotes, skipped } = quotesForSet({ set: 'OP-05', edition: 'Mixed', cards: [] }, [], new Map())
    assert.equal(quotes.size, 0)
    assert.equal(skipped[0].reason, 'edition')
  })
})
