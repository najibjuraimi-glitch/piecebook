import { PSA_FEES, type PsaFeeConfig, type PsaFeeTier, type PsaFeeTierId } from '../data/psaFees'
import { usdToSgd } from './fx'
import { FX_USD_SGD } from '../data/fx'

/** Typical eBay vault-sell take-home, about 13% in fees. Not a quote. */
export const VAULT_SELL_FEE_RATE = 0.13
export const VAULT_SELL_FEE_NOTE = 'typical eBay vault-sell take-home, about 13% in fees — not a quote'

/** eBay vault withdrawal (USD), as approved for this worksheet. */
export const VAULT_WITHDRAWAL_UNDER_500_USD = 19.99
export const VAULT_WITHDRAWAL_500_TO_4999_USD = 24.99

/** Singapore GST on the import (value + Buy&Ship). */
export const SG_GST_RATE = 0.09

/** A PSA 9 “about covers” raw when drifted V9 is at least 95% of raw. */
export const NINE_COVERS_RATIO = 0.95

/** New EN sets (released in the last 12 months) default to −2%/mo on V9/V10. */
export const NEW_SET_WINDOW_MONTHS = 12
export const NEW_SET_MONTHLY_DRIFT = -0.02
export const OLDER_SET_MONTHLY_DRIFT = 0

export type PriceKind = 'sold' | 'guess'

export interface PricePoint {
  usd: number
  source: string
  asOf: string
  kind: PriceKind
}

export interface PopInput {
  tens: number
  nines: number
  total: number
  source: string
  asOf: string
}

export type P10Band = 'low' | 'mid' | 'high'
export type Verdict = 'go' | 'borderline' | 'no-go'
export type ExitId = 'vault-sell' | 'ship-sg' | 'keep'

/** Exits that turn the card into cash. Keep is a paper value and never the "best exit" (F9). */
export const CASH_EXITS: readonly ExitId[] = ['vault-sell', 'ship-sg']

export interface GradeWorthInput {
  raw: PricePoint
  v9: PricePoint
  v10: PricePoint
  v8?: PricePoint | null
  pop: PopInput
  shipToPortlandUsd: number
  shipToPsaUsd: number
  buyAndShipUsd?: number | null
  months: number
  monthlyDrift: number
  cannotBeTen: boolean
  fees?: PsaFeeConfig
  fxRate?: number
}

export interface ExitLine {
  id: ExitId
  label: string
  netUsd: number | null
  netSgd: number | null
  note: string
  missing?: string
}

export interface SelectedFee {
  id: PsaFeeTierId
  name: string
  feeUsd: number
  declaredMaxUsd: number
  overDeclared: boolean
}

export interface GradeWorth {
  p10: number
  p9: number
  pRest: number
  p10Band: P10Band
  p10Starting: number
  v9Drifted: number
  v10Drifted: number
  v8OrRaw: number
  evUsd: number
  evSgd: number
  costInUsd: number
  costInSgd: number
  evOverCost: number
  fee: SelectedFee
  maxBuyUsd: number
  maxBuySgd: number
  nineCoversRaw: boolean
  verdict: Verdict
  reason: string
  exits: ExitLine[]
  bestExit: ExitId | null
  fxRate: number
}

export function monthsBetween(fromIso: string, toIso: string): number {
  const a = parseIsoDate(fromIso)
  const b = parseIsoDate(toIso)
  if (!a || !b) return Number.POSITIVE_INFINITY
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30
}

/** −2%/mo when the EN release is within 12 months of `asOf`; 0 otherwise. No date → older (0), not a guess that it is new. */
export function defaultMonthlyDrift(enReleased: string | null | undefined, asOfIso: string): number {
  if (!enReleased) return OLDER_SET_MONTHLY_DRIFT
  const months = monthsBetween(enReleased, asOfIso)
  if (!Number.isFinite(months) || months > NEW_SET_WINDOW_MONTHS) return OLDER_SET_MONTHLY_DRIFT
  return NEW_SET_MONTHLY_DRIFT
}

export function driftValue(usd: number, monthlyDrift: number, months: number): number {
  return usd * (1 + monthlyDrift) ** months
}

export function p10Band(rate: number): P10Band {
  if (rate < 0.2) return 'low'
  if (rate < 0.4) return 'mid'
  return 'high'
}

export function startingRates(pop: PopInput): { p10: number; p9: number; pRest: number } {
  if (pop.total <= 0) return { p10: 0, p9: 0, pRest: 1 }
  const p10 = clamp01(pop.tens / pop.total)
  // Tens + nines over total is a typo; the three shares must still sum to 1 or EV overcounts.
  const p9 = Math.min(clamp01(pop.nines / pop.total), 1 - p10)
  return { p10, p9, pRest: 1 - p10 - p9 }
}

/** Photos can zero a 10. They never raise one. */
export function applyPhotoRule(rates: { p10: number; p9: number; pRest: number }, cannotBeTen: boolean) {
  if (!cannotBeTen) return rates
  return { p10: 0, p9: rates.p9, pRest: 1 - rates.p9 }
}

export function selectPsaFee(v10Usd: number, fees: PsaFeeConfig = PSA_FEES): SelectedFee {
  const standard = mustTier(fees, 'standard')
  const priority = mustTier(fees, 'priority')
  const express = mustTier(fees, 'express')
  let chosen: PsaFeeTier
  if (v10Usd > express.declaredMaxUsd) chosen = express
  else if (v10Usd > priority.declaredMaxUsd) chosen = express
  else if (v10Usd > fees.priorityBumpOverUsd) chosen = priority
  else chosen = standard
  return {
    id: chosen.id,
    name: chosen.name,
    feeUsd: chosen.feeUsd,
    declaredMaxUsd: chosen.declaredMaxUsd,
    overDeclared: v10Usd > express.declaredMaxUsd,
  }
}

export function vaultWithdrawalUsd(valueUsd: number): number | null {
  if (valueUsd < 500) return VAULT_WITHDRAWAL_UNDER_500_USD
  if (valueUsd < 5000) return VAULT_WITHDRAWAL_500_TO_4999_USD
  return null
}

export function evaluateGradeWorth(input: GradeWorthInput): GradeWorth {
  const fees = input.fees ?? PSA_FEES
  const fxRate = input.fxRate ?? FX_USD_SGD.rate
  const starting = startingRates(input.pop)
  const rates = applyPhotoRule(starting, input.cannotBeTen)
  const v9Drifted = driftValue(input.v9.usd, input.monthlyDrift, input.months)
  const v10Drifted = driftValue(input.v10.usd, input.monthlyDrift, input.months)
  const v8OrRaw = input.v8 ? input.v8.usd : input.raw.usd
  const evUsd = rates.p10 * v10Drifted + rates.p9 * v9Drifted + rates.pRest * v8OrRaw
  const fee = selectPsaFee(input.v10.usd, fees)
  const extra = input.shipToPortlandUsd + fee.feeUsd + input.shipToPsaUsd
  const costInUsd = input.raw.usd + extra
  const evOverCost = costInUsd > 0 ? evUsd / costInUsd : 0
  const nineCoversRaw = v9Drifted >= input.raw.usd * NINE_COVERS_RATIO
  const maxBuyUsd = maxBuyRaw({
    extra,
    p10: rates.p10,
    p9: rates.p9,
    pRest: rates.pRest,
    v9Drifted,
    v10Drifted,
    v8: input.v8?.usd ?? null,
  })
  const verdict = decideVerdict(evOverCost, nineCoversRaw, v9Drifted, input.raw.usd)
  const exits = buildExits(evUsd, input.buyAndShipUsd, fxRate)
  const bestExit = pickBestExit(exits)
  const reason = oneLineReason({
    verdict,
    evOverCost,
    nineCoversRaw,
    cannotBeTen: input.cannotBeTen,
    rawUsd: input.raw.usd,
    v9Drifted,
    fee,
    maxBuyUsd,
  })

  return {
    p10: rates.p10,
    p9: rates.p9,
    pRest: rates.pRest,
    p10Band: p10Band(rates.p10),
    p10Starting: starting.p10,
    v9Drifted,
    v10Drifted,
    v8OrRaw,
    evUsd,
    evSgd: usdToSgd(evUsd, fxRate),
    costInUsd,
    costInSgd: usdToSgd(costInUsd, fxRate),
    evOverCost,
    fee,
    maxBuyUsd,
    maxBuySgd: usdToSgd(maxBuyUsd, fxRate),
    nineCoversRaw,
    verdict,
    reason,
    exits,
    bestExit,
    fxRate,
  }
}

export function photoWouldChangeTheCall(opts: {
  frontReject?: string | null
  backReject?: string | null
  frontCannotBeTen: boolean
  backCannotBeTen: boolean
  hasFront: boolean
  hasBack: boolean
  visionRead?: boolean
  visionRuledOut?: boolean
}): string {
  const failed = [opts.frontReject ? `front (${opts.frontReject})` : null, opts.backReject ? `back (${opts.backReject})` : null].filter(
    Boolean,
  )
  if (failed.length) {
    return `Retake the ${failed.join(' and the ')}: whole card in frame, short side 800px or more, camera square-on (under ~8°).`
  }
  if (opts.frontCannotBeTen || opts.backCannotBeTen) {
    const which = [opts.frontCannotBeTen ? 'front' : null, opts.backCannotBeTen ? 'back' : null].filter(Boolean).join(' and ')
    return `A cleaner photo will not put a 10 back on the table — ${which} centering has already ruled one out.`
  }
  if (opts.visionRuledOut) {
    return 'These photos rule out a PSA 10 — a defect on a corner, edge or surface. They still never confirm one.'
  }
  if (!opts.hasFront || !opts.hasBack) {
    const missing = !opts.hasFront && !opts.hasBack ? 'front and back' : !opts.hasFront ? 'front' : 'back'
    return `Add a square-on ${missing} so centering can try to rule a 10 out. Photos never confirm one.`
  }
  if (opts.visionRead) {
    return 'The photo check did not find a defect that rules out a 10. Corners, edges and surface still never confirm one.'
  }
  return 'Corners, edges and surface are not read yet. An angled surface photo — once that slice lands — would cap a high 10-rate at mid. It cannot confirm a 10.'
}

function decideVerdict(evOverCost: number, nineCoversRaw: boolean, v9Drifted: number, rawUsd: number): Verdict {
  if (evOverCost >= 1.2 && nineCoversRaw) return 'go'
  const nineClose = v9Drifted >= rawUsd * 0.85
  if (evOverCost >= 1 && (nineCoversRaw || nineClose)) return 'borderline'
  return 'no-go'
}

function oneLineReason(opts: {
  verdict: Verdict
  evOverCost: number
  nineCoversRaw: boolean
  cannotBeTen: boolean
  rawUsd: number
  v9Drifted: number
  fee: SelectedFee
  maxBuyUsd: number
}): string {
  const x = opts.evOverCost.toFixed(2)
  const photo = opts.cannotBeTen ? ' Photos already rule out a 10.' : ''
  const feeNote = opts.fee.overDeclared
    ? ` Typed PSA 10 sold is over the Express declared cap (US$${opts.fee.declaredMaxUsd.toLocaleString('en-US')}).`
    : ''
  if (opts.verdict === 'go') {
    return `Go: expected value is ${x}× cost in, and a PSA 9 still about covers the raw.${photo}${feeNote}`
  }
  if (opts.verdict === 'borderline') {
    if (opts.evOverCost >= 1.2 && !opts.nineCoversRaw) {
      return `Borderline: expected value clears 1.2×, but a PSA 9 (US$${opts.v9Drifted.toFixed(0)}) only about-covers raw near US$${opts.rawUsd.toFixed(0)}.${photo}`
    }
    return `Borderline: expected value is ${x}× cost in — it covers the outlay but not the 1.2× line.${photo}${feeNote}`
  }
  if (!opts.nineCoversRaw) {
    return `No-go: a PSA 9 at the typed sold does not cover US$${opts.rawUsd.toFixed(0)} raw, and expected value sits under the 1.2× line.${photo}${feeNote}`
  }
  return `No-go: expected value is ${x}× cost in. Highest raw this worksheet still likes is US$${opts.maxBuyUsd.toFixed(2)}.${photo}${feeNote}`
}

function buildExits(evUsd: number, buyAndShipUsd: number | null | undefined, fxRate: number): ExitLine[] {
  const vaultNet = evUsd * (1 - VAULT_SELL_FEE_RATE)
  const withdrawal = vaultWithdrawalUsd(evUsd)
  let sg: ExitLine
  if (buyAndShipUsd == null || !Number.isFinite(buyAndShipUsd)) {
    sg = {
      id: 'ship-sg',
      label: 'Ship to Singapore',
      netUsd: null,
      netSgd: null,
      note: 'Needs a Buy&Ship figure with a source — not invented.',
      missing: 'Buy&Ship',
    }
  } else if (withdrawal == null) {
    sg = {
      id: 'ship-sg',
      label: 'Ship to Singapore',
      netUsd: null,
      netSgd: null,
      note: 'Vault withdrawal over US$4,999 is not in the posted tiers — type that fee before this exit can run.',
      missing: 'withdrawal over US$4,999',
    }
  } else {
    const gst = SG_GST_RATE * (evUsd + buyAndShipUsd)
    const net = evUsd - withdrawal - buyAndShipUsd - gst
    sg = {
      id: 'ship-sg',
      label: 'Ship to Singapore',
      netUsd: net,
      netSgd: usdToSgd(net, fxRate),
      note: `Vault withdrawal US$${withdrawal.toFixed(2)} + Buy&Ship + 9% GST on value and Buy&Ship.`,
    }
  }

  return [
    {
      id: 'vault-sell',
      label: 'eBay vault-sell',
      netUsd: vaultNet,
      netSgd: usdToSgd(vaultNet, fxRate),
      note: VAULT_SELL_FEE_NOTE,
    },
    sg,
    {
      id: 'keep',
      label: 'Keep (no sale)',
      netUsd: evUsd,
      netSgd: usdToSgd(evUsd, fxRate),
      note: 'Paper value: drifted expected value before any selling cost. Not an exit, so never the best exit.',
    },
  ]
}

/** Highest net among the cash exits that can run. Keep carries no selling cost, so it would always win and say nothing. */
export function pickBestExit(exits: ExitLine[]): ExitId | null {
  let best: ExitLine | null = null
  for (const e of exits) {
    if (!CASH_EXITS.includes(e.id) || e.netUsd == null) continue
    if (!best || e.netUsd > (best.netUsd ?? Number.NEGATIVE_INFINITY)) best = e
  }
  return best?.id ?? null
}

function maxBuyRaw(opts: {
  extra: number
  p10: number
  p9: number
  pRest: number
  v9Drifted: number
  v10Drifted: number
  v8: number | null
}): number {
  const evOf = (raw: number) => opts.p10 * opts.v10Drifted + opts.p9 * opts.v9Drifted + opts.pRest * (opts.v8 ?? raw)
  const ok = (raw: number) => evOf(raw) >= 1.2 * (raw + opts.extra) && opts.v9Drifted >= raw * NINE_COVERS_RATIO
  if (!ok(0)) return 0
  let lo = 0
  let hi = Math.max(opts.v9Drifted / NINE_COVERS_RATIO, evOf(0) / 1.2, 1)
  if (ok(hi)) {
    // Unlikely; cap at the 9-covers line.
    hi = opts.v9Drifted / NINE_COVERS_RATIO
  }
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2
    if (ok(mid)) lo = mid
    else hi = mid
  }
  return Math.floor(lo * 100) / 100
}

function mustTier(fees: PsaFeeConfig, id: PsaFeeTierId): PsaFeeTier {
  const t = fees.tiers.find((x) => x.id === id)
  if (!t) throw new Error(`PSA fee config missing ${id}`)
  return t
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function parseIsoDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Worked example for tests and review shots — labelled numbers, not market facts. */
export const NAMI_ST01_007_WORKSHEET = {
  cardNumber: 'ST01-007',
  raw: { usd: 256, source: 'worked example — not a sold', asOf: '2026-10-16', kind: 'guess' as const },
  v9: { usd: 180, source: 'worked example — not a sold', asOf: '2026-10-16', kind: 'guess' as const },
  v10: { usd: 420, source: 'worked example — not a sold', asOf: '2026-10-16', kind: 'guess' as const },
  pop: { tens: 12, nines: 40, total: 80, source: 'worked example — not a PSA pull', asOf: '2026-10-16' },
  shipToPortlandUsd: 12,
  shipToPsaUsd: 15,
  buyAndShipUsd: 25,
  months: 4.5,
  monthlyDrift: 0,
  cannotBeTen: false,
}
