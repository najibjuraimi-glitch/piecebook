import { describe, expect, it } from 'vitest'
import { getCard } from '../data/seed'
import { usdToSgd } from './fx'
import { advicePrices, NO_PRICE_YET } from './cardPrices'

describe('advicePrices', () => {
  it('uses the seed market for raw and leaves PSA 9 and PSA 10 empty', () => {
    const card = getCard('ST01-007')!
    expect(card.marketUsd).toBe(0.7)
    const [raw, psa9, psa10] = advicePrices(card)
    expect(raw).toMatchObject({
      label: 'Raw',
      usd: 0.7,
      sgd: usdToSgd(0.7),
      source: 'Limitless',
      url: 'https://onepiece.limitlesstcg.com/cards/en/ST01-007',
      asOf: '2026-09-05',
      detail: 'ungraded TCGplayer market',
    })
    expect(psa9).toMatchObject({ label: 'PSA 9', usd: null, sgd: null, source: null, url: null, asOf: null, detail: null })
    expect(psa10).toMatchObject({ label: 'PSA 10', usd: null, sgd: null, source: null, url: null, asOf: null, detail: null })
    expect(NO_PRICE_YET).toBe('No price yet')
  })

  it('does not borrow a base print price for a parallel with no market of its own', () => {
    const base = getCard('OP17-118')!
    const parallel = getCard('OP17-118p2')!
    expect(base.marketUsd).toBe(22.22)
    expect(parallel.marketUsd).toBeNull()
    expect(advicePrices(parallel).every((row) => row.usd == null && row.url == null)).toBe(true)
  })

  it('keeps a parallel’s own market and does not invent graded prices', () => {
    const card = getCard('OP16-001p1')!
    expect(card.marketUsd).toBe(49.36)
    const [raw, psa9, psa10] = advicePrices(card)
    expect(raw.usd).toBe(49.36)
    expect(raw.sgd).toBe(usdToSgd(49.36))
    expect(raw.url).toBeNull()
    expect(psa9.usd).toBeNull()
    expect(psa10.usd).toBeNull()
  })

  it('says nothing when the seed has no market and no date', () => {
    const card = getCard('EB05-033')!
    expect(card.marketUsd).toBeNull()
    expect(card.asOf).toBeNull()
    expect(advicePrices(card).every((row) => row.usd == null && row.asOf == null && row.source == null)).toBe(true)
  })

  it('drops a figure that has a number but no date', () => {
    const card = { ...getCard('ST01-007')!, asOf: null }
    expect(advicePrices(card)[0].usd).toBeNull()
  })

  it('shows a Japanese PSA 10 sold median on that print only', () => {
    const card = getCard('OP05-100p2')!
    expect(card.marketUsd).toBe(133.85)
    const [raw, psa9, psa10] = advicePrices(card)
    expect(raw.usd).toBe(133.85)
    expect(raw.detail).toBe('ungraded TCGplayer market')
    expect(psa9.usd).toBeNull()
    expect(psa10).toMatchObject({
      usd: 260,
      sgd: usdToSgd(260),
      source: 'OP Box Index',
      url: 'https://opboxindex.com/cards/op05-100-enel-100-sp.html',
      asOf: '2026-09-14',
      detail: 'Japanese printing · sold median',
    })
    const base = advicePrices(getCard('OP05-100')!)
    const other = advicePrices(getCard('OP05-100p1')!)
    expect(base[2].usd).toBeNull()
    expect(other[2].usd).toBeNull()
    expect(base[2].url).toBeNull()
    expect(other[2].url).toBeNull()
  })

  it('uses the typed PSA 10 for Shanks Silver and no other grade', () => {
    const card = getCard('OP09-004p4')!
    const [raw, psa9, psa10] = advicePrices(card)
    expect(raw.usd).toBeNull()
    expect(psa9.usd).toBeNull()
    expect(psa10).toMatchObject({
      usd: 1350.5,
      sgd: usdToSgd(1350.5),
      source: 'PriceCharting',
      url: 'https://www.pricecharting.com/game/one-piece-carrying-on-his-will/shanks-silver-op09-004',
      asOf: '2026-10-18',
      detail: 'manual',
    })
  })

  it('drops a graded number that does not name its printing', () => {
    const card = {
      ...getCard('OP05-100p2')!,
      psa10Usd: 260,
      psa10AsOf: '2026-09-14',
      psa10Source: 'opboxindex',
      psa10Url: 'https://opboxindex.com/cards/op05-100-enel-100-sp.html',
      psa10Printing: null,
    }
    expect(advicePrices(card)[2].usd).toBeNull()
  })
})
