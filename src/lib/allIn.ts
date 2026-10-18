/**
 * Landed cost of an auction hammer, in S$.
 * The rate is whatever the user typed. Nothing here fetches a price or a rate.
 * A Japanese figure is not an input.
 *
 * Hammer, buyer's premium and seller shipping are in the hammer currency.
 * The forwarder fee is in S$, the same slot as forwarding on a holding.
 * GST, when on, is 9% of the converted invoice plus the forwarder fee.
 * All-in is those S$ parts added together.
 */
import { isStale, round2 } from './boughtBook'

export const GST_RATE = 0.09

export const PREMIUM_PRESETS = [
  { id: 'ebay', label: 'eBay', percent: 0 },
  { id: 'fanatics', label: 'Fanatics', percent: 20 },
  { id: 'goldin', label: 'Goldin', percent: 22 },
] as const

export type PremiumPresetId = (typeof PREMIUM_PRESETS)[number]['id']

export interface AllInInput {
  hammer: number
  currency: string
  /** 0–100. 22 is 22% of the hammer. */
  premiumPercent: number
  sellerShipping: number
  forwarderSgd: number
  /** S$ per 1 unit of `currency`. Ignored when the currency is SGD. */
  fx: number
  gst: boolean
}

export interface AllInResult {
  currency: string
  fx: number
  gstOn: boolean
  premiumPercent: number
  hammer: number
  premium: number
  sellerShipping: number
  /** Hammer + premium + seller shipping, in the hammer currency. */
  invoice: number
  /** Invoice converted to S$. */
  paidSgd: number
  forwarderSgd: number
  gstSgd: number
  allInSgd: number
}

export interface MaxHammerInput {
  currency: string
  premiumPercent: number
  sellerShipping: number
  forwarderSgd: number
  fx: number
  gst: boolean
  targetSgd: number
}

export interface WatchBidSource {
  targetSgd: number | null
  /** Manual English figure. A seed quote is not this field. */
  marketSgd: number | null
  marketSource: string | null
  marketAsOf: string | null
}

export interface WatchBidTarget {
  targetSgd: number
  from: 'target' | 'market'
  source: string | null
  asOf: string | null
  stale: boolean
  marketSgd: number | null
}

function currencyOf(raw: string): string | null {
  const currency = raw.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return null
  return currency
}

function money(n: number): boolean {
  return Number.isFinite(n) && n >= 0
}

function percentOk(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 100
}

/** Forward: a hammer and the costs around it, landed in S$. Null when an input is not a usable number. */
export function allIn(input: AllInInput): AllInResult | null {
  const currency = currencyOf(input.currency)
  if (!currency) return null
  if (!money(input.hammer) || !money(input.sellerShipping) || !money(input.forwarderSgd)) return null
  if (!percentOk(input.premiumPercent)) return null
  const sgd = currency === 'SGD'
  const fx = sgd ? 1 : input.fx
  if (!sgd && (!Number.isFinite(fx) || fx <= 0)) return null
  const hammer = round2(input.hammer)
  const premium = round2((hammer * input.premiumPercent) / 100)
  const sellerShipping = round2(input.sellerShipping)
  const invoice = round2(hammer + premium + sellerShipping)
  const paidSgd = sgd ? invoice : round2(invoice * fx)
  const forwarderSgd = round2(input.forwarderSgd)
  const gstBase = round2(paidSgd + forwarderSgd)
  const gstSgd = input.gst ? round2(gstBase * GST_RATE) : 0
  return {
    currency,
    fx,
    gstOn: input.gst,
    premiumPercent: input.premiumPercent,
    hammer,
    premium,
    sellerShipping,
    invoice,
    paidSgd,
    forwarderSgd,
    gstSgd,
    allInSgd: round2(gstBase + gstSgd),
  }
}

function rawHammer(input: MaxHammerInput, fx: number): number | null {
  const premiumFactor = 1 + input.premiumPercent / 100
  if (premiumFactor <= 0) return null
  const gstFactor = input.gst ? 1 + GST_RATE : 1
  const beforeGst = input.targetSgd / gstFactor
  const invoiceSgd = beforeGst - input.forwarderSgd
  const invoice = invoiceSgd / fx
  return (invoice - input.sellerShipping) / premiumFactor
}

/**
 * Reverse: the highest hammer, in cents, whose all-in is still at or under the target.
 * Null when the shipping and forwarder already pass the target.
 */
export function maxHammer(input: MaxHammerInput): AllInResult | null {
  const currency = currencyOf(input.currency)
  if (!currency) return null
  if (!money(input.sellerShipping) || !money(input.forwarderSgd) || !money(input.targetSgd)) return null
  if (!percentOk(input.premiumPercent)) return null
  const sgd = currency === 'SGD'
  const fx = sgd ? 1 : input.fx
  if (!sgd && (!Number.isFinite(fx) || fx <= 0)) return null
  const exact = rawHammer(input, fx)
  if (exact == null || !Number.isFinite(exact)) return null
  const shared = {
    currency,
    premiumPercent: input.premiumPercent,
    sellerShipping: input.sellerShipping,
    forwarderSgd: input.forwarderSgd,
    fx,
    gst: input.gst,
  }
  const fits = (cents: number) => {
    if (cents < 0) return false
    const result = allIn({ ...shared, hammer: cents / 100 })
    return result != null && result.allInSgd <= input.targetSgd + 1e-9
  }
  let cents = Math.floor(exact * 100 + 1e-8)
  if (cents < 0) cents = 0
  for (let step = 0; step < 8 && !fits(cents); step += 1) {
    if (cents === 0) return null
    cents -= 1
  }
  for (let step = 0; step < 8 && fits(cents + 1); step += 1) cents += 1
  if (!fits(cents)) return null
  return allIn({ ...shared, hammer: cents / 100 })
}

/**
 * Target for the reverse calculator.
 * A watch row's own target wins. Otherwise 0.9 × its manual English figure.
 * A seed quote is not read. An undated manual figure is stale.
 */
export function watchBidTarget(item: WatchBidSource, today: string): WatchBidTarget | null {
  const market = manualOf(item, today)
  if (item.targetSgd != null && money(item.targetSgd)) {
    return {
      targetSgd: round2(item.targetSgd),
      from: 'target',
      source: market?.source ?? null,
      asOf: market?.asOf ?? null,
      stale: market?.stale ?? false,
      marketSgd: market?.sgd ?? null,
    }
  }
  if (!market) return null
  return {
    targetSgd: round2(market.sgd * 0.9),
    from: 'market',
    source: market.source,
    asOf: market.asOf,
    stale: market.stale,
    marketSgd: market.sgd,
  }
}

function manualOf(item: WatchBidSource, today: string): { sgd: number; source: string; asOf: string | null; stale: boolean } | null {
  if (item.marketSgd == null || !money(item.marketSgd)) return null
  const asOf = item.marketAsOf && /^\d{4}-\d{2}-\d{2}$/.test(item.marketAsOf) ? item.marketAsOf : null
  return {
    sgd: round2(item.marketSgd),
    source: item.marketSource?.trim() || 'Manual',
    asOf,
    stale: asOf ? isStale(asOf, today) : true,
  }
}
