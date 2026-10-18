/**
 * Landed cost of an auction hammer, in S$.
 * The rate is whatever the user typed. Nothing here fetches a price or a rate.
 * A Japanese figure is not an input.
 *
 * Hammer, buyer's premium and seller shipping are in the hammer currency.
 * The payment fee is a percent of that invoice, still in the hammer currency, before FX.
 * The forwarder fee is in S$.
 * GST is 9% of the converted invoice plus the forwarder fee.
 * Auto applies that 9% only when the import is over S$400.
 */
import { isStale, round2 } from './boughtBook'

export const GST_RATE = 0.09
export const GST_THRESHOLD_SGD = 400
/** Imports this close to S$400 get a warning. The 9% cliff is about S$36. */
export const GST_NEAR_SGD = 20

export const PREMIUM_PRESETS = [
  { id: 'ebay', label: 'eBay', percent: 0 },
  { id: 'fanatics', label: 'Fanatics', percent: 20 },
  { id: 'goldin', label: 'Goldin', percent: 22 },
] as const

export const FEE_PRESETS = [
  { id: 'ebay', label: 'eBay 0%', percent: 0 },
  { id: 'fanatics', label: 'Fanatics card 2.9%', percent: 2.9 },
  { id: 'goldin', label: 'Goldin ~3%', percent: 3 },
] as const

export type PremiumPresetId = (typeof PREMIUM_PRESETS)[number]['id']
export type FeePresetId = (typeof FEE_PRESETS)[number]['id']
export type GstMode = 'auto' | 'on' | 'off'

export interface AllInInput {
  hammer: number
  currency: string
  /** 0–100. 22 is 22% of the hammer. */
  premiumPercent: number
  /** 0–100. Applied to hammer + premium + seller shipping. */
  paymentFeePercent: number
  /**
   * Seller shipping in the hammer currency.
   * Null with `fanaticsTier` uses the Fanatics band for this hammer.
   * A number is an override and ignores the band.
   */
  sellerShipping: number | null
  fanaticsTier?: boolean
  forwarderSgd: number
  /** S$ per 1 unit of `currency`. Ignored when the currency is SGD. */
  fx: number
  gst: GstMode
}

export interface AllInResult {
  currency: string
  fx: number
  gstMode: GstMode
  gstOn: boolean
  premiumPercent: number
  paymentFeePercent: number
  hammer: number
  premium: number
  sellerShipping: number
  /** Hammer + premium + seller shipping, before the payment fee. */
  invoice: number
  paymentFee: number
  /** Invoice plus the payment fee. This is the amount that converts. */
  charged: number
  paidSgd: number
  forwarderSgd: number
  /** Converted charge plus the forwarder fee. GST looks at this. */
  importSgd: number
  gstSgd: number
  allInSgd: number
  /** Set when seller shipping came from a Fanatics band rather than a typed override. */
  shippingTier: number | null
}

export interface MaxHammerInput {
  currency: string
  premiumPercent: number
  paymentFeePercent: number
  sellerShipping: number | null
  fanaticsTier?: boolean
  forwarderSgd: number
  fx: number
  gst: GstMode
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
  /** Manual figures are English. The page says so. */
  language: 'EN'
  /** False when the only basis is a stale manual figure. The page waits for a tap. */
  prefill: boolean
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

/**
 * Fanatics seller shipping by hammer + premium.
 * US$15 from US$750 up to US$1,500, US$25 from US$1,500 through US$3,000.
 * Outside that, null. A typed amount overrides this.
 */
export function fanaticsShipping(closing: number): 15 | 25 | null {
  if (closing >= 1500 && closing <= 3000) return 25
  if (closing >= 750 && closing < 1500) return 15
  return null
}

function shippingFor(hammer: number, premiumPercent: number, typed: number | null, tier: boolean): { amount: number; tier: number | null } {
  const premium = round2((round2(hammer) * premiumPercent) / 100)
  const closing = round2(round2(hammer) + premium)
  const band = tier ? fanaticsShipping(closing) : null
  if (typed != null) return { amount: typed, tier: band }
  if (band != null) return { amount: band, tier: band }
  if (tier && closing > 3000) return { amount: 25, tier: 25 }
  return { amount: 0, tier: null }
}

function gstApplies(mode: GstMode, importSgd: number): boolean {
  if (mode === 'on') return true
  if (mode === 'off') return false
  return importSgd > GST_THRESHOLD_SGD
}

/** A warning when GST is close to the S$400 line, or an On/Off choice disagrees with Auto. */
export function gstWarning(mode: GstMode, importSgd: number): string | null {
  const over = importSgd > GST_THRESHOLD_SGD
  if (mode === 'on' && !over) return 'GST is on. Auto would leave it off at S$400 or under.'
  if (mode === 'off' && over) return 'GST is off. Auto would add 9% above S$400.'
  if (Math.abs(importSgd - GST_THRESHOLD_SGD) <= GST_NEAR_SGD) return 'GST starts above S$400. This import is close to that line.'
  return null
}

/** Forward: a hammer and the costs around it, landed in S$. Null when an input is not a usable number. */
export function allIn(input: AllInInput): AllInResult | null {
  const currency = currencyOf(input.currency)
  if (!currency) return null
  if (!money(input.hammer) || !money(input.forwarderSgd)) return null
  if (input.sellerShipping != null && !money(input.sellerShipping)) return null
  if (!percentOk(input.premiumPercent) || !percentOk(input.paymentFeePercent)) return null
  if (input.gst !== 'auto' && input.gst !== 'on' && input.gst !== 'off') return null
  const sgd = currency === 'SGD'
  const fx = sgd ? 1 : input.fx
  if (!sgd && (!Number.isFinite(fx) || fx <= 0)) return null
  const hammer = round2(input.hammer)
  const premium = round2((hammer * input.premiumPercent) / 100)
  const resolved = shippingFor(hammer, input.premiumPercent, input.sellerShipping, input.fanaticsTier === true)
  const sellerShipping = round2(resolved.amount)
  const invoice = round2(hammer + premium + sellerShipping)
  const charged = round2(invoice * (1 + input.paymentFeePercent / 100))
  const paymentFee = round2(charged - invoice)
  const paidSgd = sgd ? charged : round2(charged * fx)
  const forwarderSgd = round2(input.forwarderSgd)
  const importSgd = round2(paidSgd + forwarderSgd)
  const gstOn = gstApplies(input.gst, importSgd)
  const gstSgd = gstOn ? round2(importSgd * GST_RATE) : 0
  return {
    currency,
    fx,
    gstMode: input.gst,
    gstOn,
    premiumPercent: input.premiumPercent,
    paymentFeePercent: input.paymentFeePercent,
    hammer,
    premium,
    sellerShipping,
    invoice,
    paymentFee,
    charged,
    paidSgd,
    forwarderSgd,
    importSgd,
    gstSgd,
    allInSgd: round2(importSgd + gstSgd),
    shippingTier: input.sellerShipping == null ? resolved.tier : null,
  }
}

/** Hammer estimate with the fee divided out. GST is either fully on or fully off. Shipping is the typed amount. */
function rawHammer(input: MaxHammerInput, fx: number, gstOn: boolean, sellerShipping: number): number | null {
  const premiumFactor = 1 + input.premiumPercent / 100
  const feeFactor = 1 + input.paymentFeePercent / 100
  if (premiumFactor <= 0 || feeFactor <= 0) return null
  const gstFactor = gstOn ? 1 + GST_RATE : 1
  const beforeGst = input.targetSgd / gstFactor
  const paidSgd = beforeGst - input.forwarderSgd
  const charged = paidSgd / fx
  const invoice = charged / feeFactor
  return (invoice - sellerShipping) / premiumFactor
}

/**
 * Reverse: the highest hammer, in cents of the hammer currency, whose all-in is still at or under the target.
 * The search is a bisection, so the GST jump at S$400 and a yen both land on the exact cent.
 * Null when the shipping and forwarder already pass the target.
 */
export function maxHammer(input: MaxHammerInput): AllInResult | null {
  const currency = currencyOf(input.currency)
  if (!currency) return null
  if (!money(input.forwarderSgd) || !money(input.targetSgd)) return null
  if (input.sellerShipping != null && !money(input.sellerShipping)) return null
  if (!percentOk(input.premiumPercent) || !percentOk(input.paymentFeePercent)) return null
  if (input.gst !== 'auto' && input.gst !== 'on' && input.gst !== 'off') return null
  const sgd = currency === 'SGD'
  const fx = sgd ? 1 : input.fx
  if (!sgd && (!Number.isFinite(fx) || fx <= 0)) return null
  const shared = {
    currency,
    premiumPercent: input.premiumPercent,
    paymentFeePercent: input.paymentFeePercent,
    sellerShipping: input.sellerShipping,
    fanaticsTier: input.fanaticsTier === true,
    forwarderSgd: input.forwarderSgd,
    fx,
    gst: input.gst,
  }
  const fits = (cents: number) => {
    if (cents < 0 || !Number.isSafeInteger(cents)) return false
    const result = allIn({ ...shared, hammer: cents / 100 })
    return result != null && result.allInSgd <= input.targetSgd + 1e-9
  }
  if (!fits(0)) return null
  const shippingGuess = input.sellerShipping ?? 0
  let hi = 1
  for (const gstOn of [false, true]) {
    const guess = rawHammer(input, fx, gstOn, shippingGuess)
    if (guess != null && Number.isFinite(guess) && guess > 0) hi = Math.max(hi, Math.ceil(guess * 100) + 2)
  }
  let grown = 0
  while (fits(hi)) {
    if (hi >= 1e14 || grown > 50) return null
    hi = Math.min(1e14, hi * 2)
    grown += 1
  }
  let lo = 0
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (fits(mid)) lo = mid
    else hi = mid - 1
  }
  if (!fits(lo)) return null
  return allIn({ ...shared, hammer: lo / 100 })
}

/**
 * Target for the reverse calculator.
 * A watch row's own target wins. Otherwise 0.9 × its manual English figure.
 * A stale or undated manual figure is shown and is not filled in until the user confirms.
 * A seed quote is not read.
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
      language: 'EN',
      prefill: true,
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
    language: 'EN',
    prefill: !market.stale,
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
