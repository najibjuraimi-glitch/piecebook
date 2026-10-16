import { describe, expect, it } from 'vitest'
import { PSA_FEES } from '../data/psaFees'
import {
  NAMI_ST01_007_WORKSHEET,
  applyPhotoRule,
  defaultMonthlyDrift,
  driftValue,
  evaluateGradeWorth,
  selectPsaFee,
  startingRates,
  vaultWithdrawalUsd,
  photoWouldChangeTheCall,
  type GradeWorthInput,
} from './gradeWorth'

const SHIPS = { shipToPortlandUsd: 10, shipToPsaUsd: 12 }

function sold(usd: number): GradeWorthInput['raw'] {
  return { usd, source: 'test sold', asOf: '2026-10-01', kind: 'sold' }
}

function pop(tens: number, nines: number, total: number): GradeWorthInput['pop'] {
  return { tens, nines, total, source: 'test pop', asOf: '2026-10-01' }
}

function base(partial: Partial<GradeWorthInput> & Pick<GradeWorthInput, 'raw' | 'v9' | 'v10' | 'pop'>): GradeWorthInput {
  return {
    months: 4.5,
    monthlyDrift: 0,
    cannotBeTen: false,
    buyAndShipUsd: 25,
    ...SHIPS,
    ...partial,
  }
}

describe('grade-worth math', () => {
  it('1 · Go: cheap raw, a PSA 9 still covers, EV clears 1.2×', () => {
    const result = evaluateGradeWorth(
      base({
        raw: sold(18),
        v9: sold(95),
        v10: sold(280),
        pop: pop(40, 30, 100),
      }),
    )
    expect(result.fee.id).toBe('standard')
    expect(result.fee.feeUsd).toBe(59.99)
    expect(result.p10).toBeCloseTo(0.4, 5)
    expect(result.p9).toBeCloseTo(0.3, 5)
    expect(result.evUsd).toBeCloseTo(0.4 * 280 + 0.3 * 95 + 0.3 * 18, 5)
    expect(result.costInUsd).toBeCloseTo(18 + 10 + 59.99 + 12, 5)
    expect(result.evOverCost).toBeGreaterThanOrEqual(1.2)
    expect(result.nineCoversRaw).toBe(true)
    expect(result.verdict).toBe('go')
    expect(result.bestExit).toBe('keep')
    expect(result.maxBuyUsd).toBeGreaterThan(18)
    expect(result.evSgd).toBeGreaterThan(0)
    expect(result.costInSgd).toBeGreaterThan(0)
  })

  it('2 · Borderline: EV covers cost in but not the 1.2× line', () => {
    const result = evaluateGradeWorth(
      base({
        raw: sold(20),
        v9: sold(90),
        v10: sold(220),
        pop: pop(35, 40, 100),
      }),
    )
    expect(result.evOverCost).toBeGreaterThanOrEqual(1)
    expect(result.evOverCost).toBeLessThan(1.2)
    expect(result.nineCoversRaw).toBe(true)
    expect(result.verdict).toBe('borderline')
  })

  it('3 · No-go: Nami ST01-007 at US$256 raw', () => {
    const result = evaluateGradeWorth({
      ...NAMI_ST01_007_WORKSHEET,
      fees: PSA_FEES,
    })
    expect(result.verdict).toBe('no-go')
    expect(result.nineCoversRaw).toBe(false)
    expect(result.evUsd).toBeLessThan(result.costInUsd)
    expect(result.maxBuyUsd).toBeLessThan(256)
    expect(result.reason.toLowerCase()).toContain('no-go')
    expect(result.fee.id).toBe('standard')
  })

  it('4 · No-go: photos rule out a 10 and the remaining book does not pay', () => {
    const go = evaluateGradeWorth(
      base({
        raw: sold(18),
        v9: sold(95),
        v10: sold(280),
        pop: pop(40, 30, 100),
      }),
    )
    expect(go.verdict).toBe('go')
    const ruledOut = evaluateGradeWorth(
      base({
        raw: sold(18),
        v9: sold(95),
        v10: sold(280),
        pop: pop(40, 30, 100),
        cannotBeTen: true,
      }),
    )
    expect(ruledOut.p10).toBe(0)
    expect(ruledOut.p9).toBeCloseTo(0.3, 5)
    expect(ruledOut.verdict).toBe('no-go')
    expect(ruledOut.reason.toLowerCase()).toMatch(/rule out a 10|photos already/)
  })

  it('5 · Priority fee when V10 is over US$1,000', () => {
    const result = evaluateGradeWorth(
      base({
        raw: sold(80),
        v9: sold(400),
        v10: sold(1400),
        pop: pop(20, 30, 100),
      }),
    )
    expect(result.fee.id).toBe('priority')
    expect(result.fee.feeUsd).toBe(79.99)
    expect(result.costInUsd).toBeCloseTo(80 + 10 + 79.99 + 12, 5)
    expect(result.verdict).toBe('go')
    expect(selectPsaFee(1000).id).toBe('standard')
    expect(selectPsaFee(1000.01).id).toBe('priority')
    expect(selectPsaFee(1500.01).id).toBe('express')
    expect(selectPsaFee(1500.01).feeUsd).toBe(199)
  })
})

describe('grade-worth helpers', () => {
  it('starting 10-rate is tens / total; photos never raise it', () => {
    const rates = startingRates(pop(12, 40, 80))
    expect(rates.p10).toBeCloseTo(0.15, 5)
    expect(applyPhotoRule(rates, false).p10).toBeCloseTo(0.15, 5)
    expect(applyPhotoRule(rates, true).p10).toBe(0)
  })

  it('new sets drift −2%/mo; ST-01 is older (0)', () => {
    expect(defaultMonthlyDrift('2026-06-12', '2026-10-16')).toBe(-0.02)
    expect(defaultMonthlyDrift('2022-12-02', '2026-10-16')).toBe(0)
    expect(defaultMonthlyDrift(null, '2026-10-16')).toBe(0)
    expect(driftValue(100, -0.02, 5)).toBeCloseTo(100 * 0.98 ** 5, 8)
  })

  it('vault withdrawal tiers', () => {
    expect(vaultWithdrawalUsd(256)).toBe(19.99)
    expect(vaultWithdrawalUsd(500)).toBe(24.99)
    expect(vaultWithdrawalUsd(4999)).toBe(24.99)
    expect(vaultWithdrawalUsd(4999.5)).toBe(24.99)
    expect(vaultWithdrawalUsd(5000)).toBeNull()
  })

  it('pop shares always sum to 1, even when tens + nines is typed over total', () => {
    const over = startingRates(pop(70, 50, 100))
    expect(over.p10).toBeCloseTo(0.7, 8)
    expect(over.p9).toBeCloseTo(0.3, 8)
    expect(over.pRest).toBeCloseTo(0, 8)
    expect(over.p10 + over.p9 + over.pRest).toBeCloseTo(1, 8)
    const result = evaluateGradeWorth(base({ raw: sold(18), v9: sold(95), v10: sold(280), pop: pop(70, 50, 100) }))
    expect(result.evUsd).toBeCloseTo(0.7 * 280 + 0.3 * 95, 5)
  })

  it('ship-to-Singapore exit nets withdrawal, Buy&Ship and 9% GST on both', () => {
    const result = evaluateGradeWorth(
      base({ raw: sold(18), v9: sold(95), v10: sold(280), pop: pop(40, 30, 100), buyAndShipUsd: 25 }),
    )
    const sg = result.exits.find((e) => e.id === 'ship-sg')!
    const ev = result.evUsd
    expect(sg.netUsd).toBeCloseTo(ev - 19.99 - 25 - 0.09 * (ev + 25), 8)
    const vault = result.exits.find((e) => e.id === 'vault-sell')!
    expect(vault.netUsd).toBeCloseTo(ev * 0.87, 8)
    const missing = evaluateGradeWorth(
      base({ raw: sold(18), v9: sold(95), v10: sold(280), pop: pop(40, 30, 100), buyAndShipUsd: null }),
    )
    expect(missing.exits.find((e) => e.id === 'ship-sg')!.netUsd).toBeNull()
    expect(missing.bestExit).not.toBe('ship-sg')
  })

  it('max buy is the highest raw that still clears Go', () => {
    const input = base({ raw: sold(18), v9: sold(95), v10: sold(280), pop: pop(40, 30, 100) })
    const result = evaluateGradeWorth(input)
    const atMax = evaluateGradeWorth({ ...input, raw: sold(result.maxBuyUsd) })
    expect(atMax.verdict).toBe('go')
    const overMax = evaluateGradeWorth({ ...input, raw: sold(result.maxBuyUsd + 0.5) })
    expect(overMax.verdict).not.toBe('go')
  })

  it('photo note names vision once corners/edges/surface have been read', () => {
    const both = {
      frontCannotBeTen: false,
      backCannotBeTen: false,
      hasFront: true,
      hasBack: true,
    }
    expect(photoWouldChangeTheCall(both)).toMatch(/not read yet/)
    expect(photoWouldChangeTheCall({ ...both, visionRead: true })).toMatch(/did not find a defect/)
    expect(photoWouldChangeTheCall({ ...both, visionRead: true, visionRuledOut: true })).toMatch(
      /rule out a PSA 10/,
    )
  })
})
