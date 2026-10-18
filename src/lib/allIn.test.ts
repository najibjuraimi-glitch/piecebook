import { describe, expect, it } from 'vitest'
import { allIn, maxHammer, PREMIUM_PRESETS, watchBidTarget } from './allIn'
import { todayIso } from './format'

const goldin = {
  currency: 'USD',
  premiumPercent: 22,
  sellerShipping: 5,
  forwarderSgd: 10,
  fx: 1.3,
  gst: true,
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
    const ebay = allIn({ hammer: 40, currency: 'usd', premiumPercent: 0, sellerShipping: 0, forwarderSgd: 0, fx: 1.25, gst: false })
    expect(ebay).toMatchObject({ premium: 0, paidSgd: 50, gstSgd: 0, allInSgd: 50 })
    const local = allIn({ hammer: 50, currency: 'SGD', premiumPercent: 20, sellerShipping: 0, forwarderSgd: 4, fx: 99, gst: true })
    expect(local).toMatchObject({ fx: 1, premium: 10, invoice: 60, paidSgd: 60, gstSgd: 5.76, allInSgd: 69.76 })
  })

  it('rejects a rate, a premium or a hammer that is not usable', () => {
    expect(allIn({ ...goldin, hammer: 100, fx: 0 })).toBeNull()
    expect(allIn({ ...goldin, hammer: 100, premiumPercent: 101 })).toBeNull()
    expect(allIn({ ...goldin, hammer: -1 })).toBeNull()
    expect(allIn({ ...goldin, hammer: 100, currency: 'US' })).toBeNull()
  })
})

describe('max hammer', () => {
  it('solves the hammer that lands on the all-in', () => {
    const forward = allIn({ ...goldin, hammer: 100 })!
    const back = maxHammer({ ...goldin, targetSgd: forward.allInSgd })
    expect(back?.hammer).toBe(100)
    expect(back?.allInSgd).toBe(forward.allInSgd)
  })

  it('steps the hammer down so the all-in stays inside a tighter target', () => {
    const target = 190.85
    const back = maxHammer({ ...goldin, targetSgd: target })
    expect(back).not.toBeNull()
    expect(back!.hammer).toBeLessThan(100)
    expect(back!.allInSgd).toBeLessThanOrEqual(target)
    const next = allIn({ ...goldin, hammer: roundUpCent(back!.hammer) })
    expect(next!.allInSgd).toBeGreaterThan(target)
  })

  it('returns no hammer when shipping and the forwarder already pass the target', () => {
    expect(
      maxHammer({
        currency: 'USD',
        premiumPercent: 0,
        sellerShipping: 40,
        forwarderSgd: 0,
        fx: 2,
        gst: false,
        targetSgd: 50,
      }),
    ).toBeNull()
  })

  it('allows a zero hammer when nothing is added on top', () => {
    const back = maxHammer({
      currency: 'SGD',
      premiumPercent: 0,
      sellerShipping: 0,
      forwarderSgd: 0,
      fx: 1,
      gst: false,
      targetSgd: 0,
    })
    expect(back).toMatchObject({ hammer: 0, allInSgd: 0 })
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
    expect(dated).toMatchObject({ from: 'market', targetSgd: 9.05, source: 'Cards', asOf: today, stale: false, marketSgd: 10.05 })
    const undated = watchBidTarget({ targetSgd: null, marketSgd: 100, marketSource: ' ', marketAsOf: null }, today)
    expect(undated).toMatchObject({ from: 'market', targetSgd: 90, source: 'Manual', asOf: null, stale: true })
  })

  it('stays empty when the row has no target and no manual figure', () => {
    expect(watchBidTarget({ targetSgd: null, marketSgd: null, marketSource: null, marketAsOf: null }, today)).toBeNull()
  })
})

function roundUpCent(hammer: number): number {
  return Math.round(hammer * 100 + 1) / 100
}
