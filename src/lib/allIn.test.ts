import { describe, expect, it } from 'vitest'
import { allIn, FANATICS_SHIPPING_PROMPT, fanaticsShipping, FEE_PRESETS, gstWarning, maxHammer, PREMIUM_PRESETS, watchBidTarget } from './allIn'
import { todayIso } from './format'

const goldin = {
  currency: 'USD',
  premiumPercent: 22,
  paymentFeePercent: 0,
  sellerShipping: 5,
  forwarderSgd: 10,
  fx: 1.3,
  gst: 'on' as const,
}

describe('all-in', () => {
  it('adds premium, seller shipping, the typed rate, the forwarder and GST', () => {
    const result = allIn({ ...goldin, hammer: 100 })
    expect(result).toMatchObject({
      hammer: 100,
      premium: 22,
      sellerShipping: 5,
      invoice: 127,
      fx: 1.3,
      paidSgd: 165.1,
      forwarderSgd: 10,
      gstSgd: 15.76,
      allInSgd: 190.86,
    })
  })

  it('uses the house presets and ignores a typed rate when the hammer is already S$', () => {
    expect(PREMIUM_PRESETS.map((preset) => [preset.id, preset.percent])).toEqual([
      ['ebay', 0],
      ['fanatics', 20],
      ['goldin', 22],
    ])
    expect(FEE_PRESETS.map((preset) => [preset.id, preset.percent])).toEqual([
      ['ebay', 0],
      ['fanatics', 2.9],
      ['goldin', 3],
    ])
    const ebay = allIn({ hammer: 40, currency: 'usd', premiumPercent: 0, paymentFeePercent: 0, sellerShipping: 0, forwarderSgd: 0, fx: 1.25, gst: 'off' })
    expect(ebay).toMatchObject({ premium: 0, paidSgd: 50, gstSgd: 0, allInSgd: 50 })
    const local = allIn({ hammer: 50, currency: 'SGD', premiumPercent: 20, paymentFeePercent: 0, sellerShipping: 0, forwarderSgd: 4, fx: 99, gst: 'on' })
    expect(local).toMatchObject({ fx: 1, premium: 10, invoice: 60, paidSgd: 60, gstSgd: 5.76, allInSgd: 69.76 })
  })

  it('rejects a rate, a premium or a hammer that is not usable', () => {
    expect(allIn({ ...goldin, hammer: 100, fx: 0 })).toBeNull()
    expect(allIn({ ...goldin, hammer: 100, premiumPercent: 101 })).toBeNull()
    expect(allIn({ ...goldin, hammer: 100, paymentFeePercent: 101 })).toBeNull()
    expect(allIn({ ...goldin, hammer: -1 })).toBeNull()
    expect(allIn({ ...goldin, hammer: 100, currency: 'US' })).toBeNull()
  })

  it('lands a Fanatics US$1,000 card win at US$1,257.23 before FX', () => {
    const result = allIn({
      hammer: 1000,
      currency: 'USD',
      premiumPercent: 20,
      paymentFeePercent: 2.9,
      sellerShipping: 15,
      forwarderSgd: 7,
      fx: 1,
      gst: 'off',
    })
    expect(result).toMatchObject({
      invoice: 1215,
      paymentFee: 35.23,
      charged: 1250.23,
      forwarderSgd: 7,
      allInSgd: 1257.23,
    })
  })

  it('charges GST in Auto only when the import is over S$400', () => {
    const fx = 1.279918
    const shared = {
      currency: 'USD',
      premiumPercent: 0,
      paymentFeePercent: 0,
      forwarderSgd: 0,
      fx,
      gst: 'auto' as const,
    }
    const under = allIn({ ...shared, hammer: 250, sellerShipping: 20 })
    expect(under).toMatchObject({ importSgd: 345.58, gstOn: false, gstSgd: 0, allInSgd: 345.58 })
    expect(gstWarning('auto', under!.importSgd)).toBeNull()
    const atLine = allIn({ ...shared, hammer: 292.52, sellerShipping: 20 })
    const over = allIn({ ...shared, hammer: 292.53, sellerShipping: 20 })
    expect(atLine).toMatchObject({ importSgd: 400, gstOn: false, allInSgd: 400 })
    expect(over).toMatchObject({ importSgd: 400.01, gstOn: true, gstSgd: 36, allInSgd: 436.01 })
    expect(gstWarning('on', under!.importSgd)).toMatch(/Auto would leave it off/)
    expect(gstWarning('off', over!.importSgd)).toMatch(/Auto would add 9%/)
    expect(gstWarning('auto', atLine!.importSgd)).toMatch(/close to that line/)
  })
})

describe('max hammer', () => {
  it('solves the hammer that lands on the all-in', () => {
    const forward = allIn({ ...goldin, hammer: 100 })!
    const back = asBid(maxHammer({ ...goldin, targetSgd: forward.allInSgd }))
    expect(back.hammer).toBe(100)
    expect(back.allInSgd).toBe(forward.allInSgd)
  })

  it('steps the hammer down so the all-in stays inside a tighter target', () => {
    const target = 190.85
    const back = asBid(maxHammer({ ...goldin, targetSgd: target }))
    expect(back.hammer).toBeLessThan(100)
    expect(back.allInSgd).toBeLessThanOrEqual(target)
    const next = allIn({ ...goldin, hammer: roundUpCent(back.hammer) })
    expect(next!.allInSgd).toBeGreaterThan(target)
  })

  it('returns no hammer when shipping and the forwarder already pass the target', () => {
    expect(
      maxHammer({
        currency: 'USD',
        premiumPercent: 0,
        paymentFeePercent: 0,
        sellerShipping: 40,
        forwarderSgd: 0,
        fx: 2,
        gst: 'off',
        targetSgd: 50,
      }),
    ).toBeNull()
  })

  it('allows a zero hammer when nothing is added on top', () => {
    const back = maxHammer({
      currency: 'SGD',
      premiumPercent: 0,
      paymentFeePercent: 0,
      sellerShipping: 0,
      forwarderSgd: 0,
      fx: 1,
      gst: 'off',
      targetSgd: 0,
    })
    expect(back).toMatchObject({ hammer: 0, allInSgd: 0 })
  })

  it('stays under a target that sits inside the GST jump', () => {
    const shared = {
      currency: 'USD',
      premiumPercent: 0,
      paymentFeePercent: 0,
      sellerShipping: 20,
      forwarderSgd: 0,
      fx: 1.279918,
      gst: 'auto' as const,
    }
    const inside = maxHammer({ ...shared, targetSgd: 420 })
    expect(inside).toMatchObject({ hammer: 292.52, importSgd: 400, gstOn: false, allInSgd: 400 })
    const above = maxHammer({ ...shared, targetSgd: 436.01 })
    expect(above).toMatchObject({ hammer: 292.53, gstOn: true, allInSgd: 436.01 })
    expect(asBid(above).allInSgd).toBeLessThanOrEqual(436.01)
  })

  it('returns the exact JPY cent', () => {
    const shared = {
      currency: 'JPY',
      premiumPercent: 0,
      paymentFeePercent: 0,
      sellerShipping: 1500,
      forwarderSgd: 0,
      fx: 0.0088,
      gst: 'off' as const,
    }
    const back = maxHammer({ ...shared, targetSgd: 600 })
    expect(back).toMatchObject({ hammer: 66682.38, allInSgd: 600 })
    const next = allIn({ ...shared, hammer: 66682.39 })
    expect(next!.allInSgd).toBeGreaterThan(600)
  })

  it('uses a Fanatics shipping tier unless an amount overrides it', () => {
    expect(fanaticsShipping(749.99)).toBeNull()
    expect(fanaticsShipping(750)).toBe(15)
    expect(fanaticsShipping(1499.99)).toBe(15)
    expect(fanaticsShipping(1500)).toBe(25)
    expect(fanaticsShipping(3000)).toBe(25)
    expect(fanaticsShipping(3000.01)).toBeNull()
    const tier = allIn({
      hammer: 1300,
      currency: 'USD',
      premiumPercent: 20,
      paymentFeePercent: 0,
      sellerShipping: null,
      fanaticsTier: true,
      forwarderSgd: 0,
      fx: 1,
      gst: 'off',
    })
    expect(tier).toMatchObject({ premium: 260, sellerShipping: 25, shippingTier: 25 })
    const override = allIn({ ...tier!, sellerShipping: 15, fanaticsTier: true, hammer: 1300, gst: 'off' })
    expect(override).toMatchObject({ sellerShipping: 15, shippingTier: null })
    expect(
      allIn({
        hammer: 100,
        currency: 'USD',
        premiumPercent: 20,
        paymentFeePercent: 2.9,
        sellerShipping: null,
        fanaticsTier: true,
        forwarderSgd: 0,
        fx: 1,
        gst: 'off',
      }),
    ).toBeNull()
    expect(
      allIn({
        hammer: 2600,
        currency: 'USD',
        premiumPercent: 20,
        paymentFeePercent: 2.9,
        sellerShipping: null,
        fanaticsTier: true,
        forwarderSgd: 0,
        fx: 1,
        gst: 'off',
      }),
    ).toBeNull()
  })

  it('solves the Boa EB03 max from the Fanatics card fee, not the no-fee hammer', () => {
    const shared = {
      currency: 'USD',
      premiumPercent: 20,
      paymentFeePercent: 2.9,
      sellerShipping: null,
      fanaticsTier: true,
      forwarderSgd: 8.96,
      fx: 1.279918,
      gst: 'off' as const,
    }
    const back = maxHammer({ ...shared, targetSgd: 2140.11 })
    expect(back).toMatchObject({ hammer: 1327.62, sellerShipping: 25, paymentFeePercent: 2.9, gstOn: false })
    const noFee = maxHammer({ ...shared, paymentFeePercent: 0, targetSgd: 2140.11 })
    expect(noFee).toMatchObject({ hammer: 1366.72 })
    expect(maxHammer({ ...shared, targetSgd: 50 })).toBe('fanatics-shipping')
    expect(maxHammer({ ...shared, targetSgd: 100_000 })).toBe('fanatics-shipping')
    expect(FANATICS_SHIPPING_PROMPT).toBe('Type the shipping from the Fanatics checkout.')
  })
})

describe('watch bid target', () => {
  const today = todayIso()

  it('prefers the row target over the manual figure', () => {
    const target = watchBidTarget(
      { targetSgd: 80, marketSgd: 100, marketSource: 'Cards', marketAsOf: '2020-01-01' },
      today,
    )
    expect(target).toMatchObject({
      from: 'target',
      targetSgd: 80,
      marketSgd: 100,
      source: 'Cards',
      asOf: '2020-01-01',
      stale: true,
    })
  })

  it('uses 0.9 times the manual English figure and marks an undated one stale', () => {
    const dated = watchBidTarget(
      { targetSgd: null, marketSgd: 10.05, marketSource: 'Cards', marketAsOf: today },
      today,
    )
    expect(dated).toMatchObject({ from: 'market', targetSgd: 9.05, source: 'Cards', asOf: today, stale: false, marketSgd: 10.05, language: 'EN', prefill: true })
    const undated = watchBidTarget({ targetSgd: null, marketSgd: 100, marketSource: ' ', marketAsOf: null }, today)
    expect(undated).toMatchObject({ from: 'market', targetSgd: 90, source: 'Manual', asOf: null, stale: true, language: 'EN', prefill: false })
  })

  it('stays empty when the row has no target and no manual figure', () => {
    expect(watchBidTarget({ targetSgd: null, marketSgd: null, marketSource: null, marketAsOf: null }, today)).toBeNull()
  })
})

function asBid(result: ReturnType<typeof maxHammer>) {
  if (result == null || result === 'fanatics-shipping') throw new Error('expected a hammer')
  return result
}

function roundUpCent(hammer: number): number {
  return Math.round(hammer * 100 + 1) / 100
}
