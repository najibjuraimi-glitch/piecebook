/**
 * Turn a case-scan reading into priced rows.
 * Street figures are stored English quotes only. Nothing here fetches a price.
 * A Japanese card is never given an English price, and an English card is
 * never given a Japanese one. A low-confidence or ambiguous print is not priced.
 */
import { isStale, round2, type LegalGrade, type PriceQuote } from './boughtBook'
import { exactPrintId, splitPrintCode, type PrintRow } from './printResolve'

export const LOW_CONFIDENCE = 0.8
export const UNDER_STREET_PCT = 10

export interface ScanBox {
  x: number
  y: number
  w: number
  h: number
}

export interface ScanSticker {
  amount: number
  currency: string
}

export interface ScanSlab {
  grader: string | null
  grade: string | null
  cert: string | null
  year: string | null
  setName: string | null
  blackLabel: boolean
}

export interface ScanCondition {
  /** An estimate from this photo. Never a grade and never a PSA prediction. */
  judge: 'estimate' | 'too_small' | 'blurry'
  confidence: 'low' | 'medium' | 'high' | null
  whitening: boolean
  surface: string[]
  leftRight: string | null
  topBottom: string | null
  note: string
}

export interface ScanSight {
  row: number
  col: number
  box: ScanBox | null
  code: string | null
  name: string | null
  /** Language the model read. Ignored when the slab label has its own language word. */
  language: string | null
  labelText: string | null
  /** base, aa, sp, manga, gold, silver, 2nd anni, or a print id. */
  parallel: string | null
  confidence: number
  sticker: ScanSticker | null
  slab: ScanSlab | null
  condition: ScanCondition
}

export interface ScanSource {
  source: string
  asOf: string
  sgd: number
  usd: number | null
  /** Room for a later low / median / last. Stored quotes are `market` today. */
  kind: 'market' | 'low' | 'median' | 'last'
}

export interface ScanStreet {
  status: 'fresh' | 'stale' | 'none'
  sgd: number | null
  source: string | null
  asOf: string | null
  url: string | null
  stale: boolean
  label: 'No price yet' | null
  sources: ScanSource[]
  sourcesDisagree: boolean
}

export interface WatchTarget {
  id: string
  printId: string
  targetSgd: number
}

export interface CaptionMark {
  kind: 'ask' | 'unsold' | 'bundle'
  amount: number | null
  currency: string
  count: number
}

export interface ScanRow {
  index: number
  row: number
  col: number
  box: ScanBox | null
  imageUrl: string | null
  name: string | null
  language: 'EN' | 'JP' | 'CN' | 'KR' | 'FR' | null
  languageUnsure: boolean
  printId: string | null
  parallel: string | null
  confidence: number
  lowConfidence: boolean
  ambiguous: boolean
  candidates: string[]
  priced: boolean
  forSale: boolean
  sticker: ScanSticker | null
  bundle: { amount: number; currency: string; count: number; index: number } | null
  street: ScanStreet
  gapSgd: number | null
  gapPct: number | null
  underStreet: boolean
  targetHit: boolean
  watchId: string | null
  liked: string | null
  slab: ScanSlab | null
  certUrl: string | null
  condition: ScanCondition
  /** Why this card is left out of the lot sum. Null when it counts. */
  drag: string | null
  contributionSgd: number | null
}

export interface ScanSummary {
  cards: ScanRow[]
  lotAskSgd: number | null
  /** Sum of fresh English street prices for cards that clear. */
  lotStreetSgd: number | null
  lotGapSgd: number | null
  maxOfferSgd: number | null
  bundles: { index: number; askSgd: number | null; singlesSgd: number | null; gapSgd: number | null }[]
}

export interface QuoteFor {
  (printId: string, grade: LegalGrade): PriceQuote | null
}

const LANG = new Set(['EN', 'JP', 'CN', 'KR', 'FR'])

/** Language word on a slab label. JP wins when the set name also says EN. Null when no language word was read. */
export function languageFromLabel(label: string | null | undefined): 'EN' | 'JP' | 'CN' | 'KR' | 'FR' | null {
  if (!label?.trim()) return null
  const words = label.toUpperCase().match(/[A-Z]+/g) ?? []
  const has = (...tokens: string[]) => words.some((word) => tokens.includes(word))
  if (has('JP', 'JPN', 'JAPANESE')) return 'JP'
  if (has('CN', 'CHN', 'CHINESE')) return 'CN'
  if (has('KR', 'KOR', 'KOREAN')) return 'KR'
  if (has('FR', 'FRA', 'FRENCH')) return 'FR'
  if (has('EN', 'ENG', 'ENGLISH')) return 'EN'
  return null
}

export function parseCaption(text: string): CaptionMark[] {
  const marks: CaptionMark[] = []
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^x$/i.test(line)) {
      marks.push({ kind: 'unsold', amount: null, currency: 'SGD', count: 1 })
      continue
    }
    const match = line.match(/^(?:(SGD|S\$|USD|US\$|\$)\s*)?(\d+(?:\.\d+)?)\s*(?:\(\s*sequential\s*x\s*(\d+)\s*\)|x\s*(\d+))?$/i)
    if (!match) continue
    const currency = currencyOf(match[1])
    const amount = Number(match[2])
    const count = Number(match[3] || match[4] || 1)
    if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(count) || count < 1) continue
    marks.push({ kind: count > 1 ? 'bundle' : 'ask', amount, currency, count })
  }
  return marks
}

function currencyOf(token: string | undefined): string {
  if (!token) return 'SGD'
  const t = token.toUpperCase()
  if (t === 'USD' || t === 'US$' || t === '$') return 'USD'
  return 'SGD'
}

function confirmedLanguage(sight: ScanSight): 'EN' | 'JP' | 'CN' | 'KR' | 'FR' | null {
  const fromLabel = languageFromLabel(sight.labelText)
  if (sight.labelText?.trim()) return fromLabel
  const model = (sight.language || '').trim().toUpperCase()
  return LANG.has(model) ? (model as 'EN') : null
}

function gradeOf(slab: ScanSlab | null): LegalGrade | null {
  if (!slab) return 'raw'
  const grade = (slab.grade || '').trim().toUpperCase()
  if (!grade) return null
  if (/\b10\b/.test(grade)) return 'psa10'
  if (/\b9(?:\.0)?\b/.test(grade) && !grade.includes('9.5')) return 'psa9'
  return null
}

function familyOf(rows: PrintRow[], code: string): PrintRow[] {
  const base = code.replace(/p\d+$/i, '').toUpperCase()
  return rows.filter((row) => row.baseNumber.toUpperCase() === base || row.cardNumber.toUpperCase() === base)
}

function wordMatches(row: PrintRow, word: string): boolean {
  const variant = row.variant.toLowerCase()
  const rarity = row.rarity.toUpperCase()
  const base = row.cardNumber.toUpperCase() === row.baseNumber.toUpperCase()
  const w = word.toLowerCase()
  if (['base', 'regular'].includes(w)) return base
  if (['aa', 'alt', 'alternate', 'alternate art'].includes(w)) return variant.includes('alternate')
  if (['sp', 'special'].includes(w)) return variant.includes('special') || rarity === 'SP'
  if (w === 'manga') return variant.includes('manga')
  if (['gold', 'gold sp'].includes(w)) return variant.includes('gold')
  if (w === 'silver') return variant.includes('silver')
  if (['2nd', '2nd anni', 'anniversary'].includes(w)) return variant.includes('anni') || variant.includes('anniversary')
  return variant.includes(w)
}

export function resolveScanPrint(code: string | null, parallel: string | null, rows: PrintRow[]): { printId: string | null; ambiguous: boolean; candidates: string[] } {
  const split = splitPrintCode(code || '')
  const family = split ? familyOf(rows, split.id) : []
  const candidates = family.map((row) => row.cardNumber)
  const word = (parallel || split?.rest || '').trim().toLowerCase()
  const exact = exactPrintId(code)
  if (exact && !word) {
    const hit = rows.find((row) => row.cardNumber.toUpperCase() === exact.toUpperCase())
    if (!hit) return { printId: null, ambiguous: false, candidates }
    const bareBase = hit.cardNumber.toUpperCase() === hit.baseNumber.toUpperCase()
    if (bareBase && family.length > 1) return { printId: null, ambiguous: true, candidates }
    return { printId: hit.cardNumber, ambiguous: false, candidates }
  }
  if (!word || !family.length) return { printId: exact && rows.some((row) => row.cardNumber.toUpperCase() === exact.toUpperCase()) ? exact : null, ambiguous: false, candidates }
  const named = family.filter((row) => wordMatches(row, word))
  if (named.length === 1) return { printId: named[0].cardNumber, ambiguous: false, candidates }
  return { printId: null, ambiguous: true, candidates: (named.length ? named : family).map((row) => row.cardNumber) }
}

function emptyStreet(): ScanStreet {
  return { status: 'none', sgd: null, source: null, asOf: null, url: null, stale: false, label: 'No price yet', sources: [], sourcesDisagree: false }
}

function streetFor(quote: PriceQuote | null, today: string): ScanStreet {
  if (!quote || quote.sgd == null || !quote.source || !quote.asOf) return emptyStreet()
  const stale = isStale(quote.asOf, today)
  const source: ScanSource = { source: quote.source, asOf: quote.asOf, sgd: quote.sgd, usd: quote.usd, kind: 'market' }
  return {
    status: stale ? 'stale' : 'fresh',
    sgd: quote.sgd,
    source: quote.source,
    asOf: quote.asOf,
    url: quote.url,
    stale,
    label: stale ? 'No price yet' : null,
    sources: [source],
    sourcesDisagree: false,
  }
}

function likedOf(name: string | null, parallel: string | null, variant: string | null): string | null {
  const text = `${name || ''} ${parallel || ''} ${variant || ''}`.toLowerCase()
  if (text.includes('luffy')) return 'Luffy'
  if (text.includes('nami')) return 'Nami'
  if (text.includes('boa') || text.includes('hancock')) return 'Boa'
  if (text.includes('sanji') && text.includes('manga')) return 'Sanji manga'
  return null
}

function certUrl(slab: ScanSlab | null): string | null {
  if (!slab?.cert) return null
  const grader = (slab.grader || '').toUpperCase()
  if (!grader || grader === 'PSA') return `https://www.psacard.com/cert/${encodeURIComponent(slab.cert)}`
  return null
}

function emptyCondition(): ScanCondition {
  return { judge: 'estimate', confidence: null, whitening: false, surface: [], leftRight: null, topBottom: null, note: '' }
}

export function normaliseCondition(raw: Partial<ScanCondition> | null | undefined): ScanCondition {
  const surface = Array.isArray(raw?.surface) ? raw.surface.filter((flag) => ['scratch', 'dent', 'print_line'].includes(flag)) : []
  const judge = raw?.judge === 'too_small' || raw?.judge === 'blurry' ? raw.judge : 'estimate'
  const confidence = raw?.confidence === 'low' || raw?.confidence === 'medium' || raw?.confidence === 'high' ? raw.confidence : null
  return {
    judge,
    confidence,
    whitening: raw?.whitening === true,
    surface,
    leftRight: typeof raw?.leftRight === 'string' ? raw.leftRight.slice(0, 16) : null,
    topBottom: typeof raw?.topBottom === 'string' ? raw.topBottom.slice(0, 16) : null,
    note: typeof raw?.note === 'string' ? raw.note.slice(0, 160) : '',
  }
}

/**
 * Price one photo's cards. `quoteFor` reads stored English quotes only.
 * Caption marks, when present, replace stickers in grid order (left to right, top to bottom).
 */
export function matchScan(input: {
  sights: ScanSight[]
  prints: PrintRow[]
  quoteFor: QuoteFor
  today: string
  targets?: WatchTarget[]
  caption?: string
  lotAskSgd?: number | null
  imageUrl?: string | null
}): ScanSummary {
  const ordered = input.sights
    .map((sight, index) => ({ sight, index }))
    .sort((a, b) => a.sight.row - b.sight.row || a.sight.col - b.sight.col || a.index - b.index)
  const marks = input.caption?.trim() ? parseCaption(input.caption) : []
  const assigned = assignCaption(ordered.length, marks)
  const cards: ScanRow[] = ordered.map(({ sight, index }, order) =>
    priceSight(sight, index, assigned[order] ?? null, input),
  )
  const lotAsk = input.lotAskSgd != null && Number.isFinite(input.lotAskSgd) && input.lotAskSgd >= 0 ? round2(input.lotAskSgd) : null
  return summariseRows(cards, lotAsk)
}

/** Lot totals from rows already priced. Used again after the user picks a print. */
export function summariseRows(cards: ScanRow[], lotAskSgd: number | null): ScanSummary {
  const clearing = cards.filter((card) => card.priced && card.forSale && card.street.status === 'fresh' && card.street.sgd != null)
  const lotStreet = clearing.length ? round2(clearing.reduce((sum, card) => sum + (card.street.sgd ?? 0), 0)) : null
  return {
    cards,
    lotAskSgd,
    lotStreetSgd: lotStreet,
    lotGapSgd: lotAskSgd != null && lotStreet != null ? round2(lotStreet - lotAskSgd) : null,
    maxOfferSgd: lotStreet != null ? round2(lotStreet * 0.9) : null,
    bundles: bundleSums(cards),
  }
}

function assignCaption(count: number, marks: CaptionMark[]): (CaptionMark & { bundleIndex: number | null })[] {
  const slots: (CaptionMark & { bundleIndex: number | null })[] = []
  let bundleIndex = 0
  for (const mark of marks) {
    const n = mark.kind === 'bundle' ? mark.count : 1
    for (let i = 0; i < n && slots.length < count; i += 1) {
      slots.push({ ...mark, bundleIndex: mark.kind === 'bundle' ? bundleIndex : null })
    }
    if (mark.kind === 'bundle') bundleIndex += 1
  }
  return slots
}

function priceSight(
  sight: ScanSight,
  index: number,
  mark: (CaptionMark & { bundleIndex: number | null }) | null,
  input: { prints: PrintRow[]; quoteFor: QuoteFor; today: string; targets?: WatchTarget[]; imageUrl?: string | null },
): ScanRow {
  const language = confirmedLanguage(sight)
  const resolved = resolveScanPrint(sight.code, sight.parallel, input.prints)
  const lowConfidence = sight.confidence < LOW_CONFIDENCE
  const print = resolved.printId ? input.prints.find((row) => row.cardNumber.toUpperCase() === resolved.printId!.toUpperCase()) : undefined
  const forSale = mark?.kind !== 'unsold'
  const sticker = mark?.kind === 'ask' && mark.amount != null ? { amount: mark.amount, currency: mark.currency } : mark ? null : sight.sticker
  const bundle = mark?.kind === 'bundle' && mark.amount != null && mark.bundleIndex != null
    ? { amount: mark.amount, currency: mark.currency, count: mark.count, index: mark.bundleIndex }
    : null
  const canPrice = language === 'EN' && !lowConfidence && !resolved.ambiguous && resolved.printId != null && forSale && gradeOf(sight.slab) != null
  const quote = canPrice ? input.quoteFor(resolved.printId!, gradeOf(sight.slab)!) : null
  const street = canPrice ? streetFor(quote, input.today) : emptyStreet()
  const fresh = street.status === 'fresh' && street.sgd != null
  const compare = fresh && sticker?.currency === 'SGD'
  const gapSgd = compare ? round2(street.sgd! - sticker.amount) : null
  const gapPct = compare && street.sgd! > 0 ? round2(((street.sgd! - sticker.amount) / street.sgd!) * 100) : null
  const underStreet = gapPct != null && gapPct > UNDER_STREET_PCT
  const watch = resolved.printId ? input.targets?.find((target) => target.printId.toUpperCase() === resolved.printId!.toUpperCase()) : undefined
  const targetHit = Boolean(watch && sticker?.currency === 'SGD' && sticker.amount <= watch.targetSgd)
  const drag = dragReason({ language, lowConfidence, ambiguous: resolved.ambiguous, forSale, printId: resolved.printId, street, slab: sight.slab })
  return {
    index,
    row: sight.row,
    col: sight.col,
    box: sight.box,
    imageUrl: input.imageUrl ?? null,
    name: sight.name,
    language,
    languageUnsure: language == null,
    printId: resolved.printId,
    parallel: sight.parallel,
    confidence: sight.confidence,
    lowConfidence,
    ambiguous: resolved.ambiguous,
    candidates: resolved.candidates,
    priced: fresh,
    forSale,
    sticker,
    bundle,
    street,
    gapSgd,
    gapPct,
    underStreet,
    targetHit,
    watchId: watch?.id ?? null,
    liked: likedOf(sight.name, sight.parallel, print?.variant ?? null),
    slab: sight.slab,
    certUrl: certUrl(sight.slab),
    condition: sight.condition ?? emptyCondition(),
    drag,
    contributionSgd: fresh ? round2(street.sgd! * 0.9) : null,
  }
}

function dragReason(input: {
  language: string | null
  lowConfidence: boolean
  ambiguous: boolean
  forSale: boolean
  printId: string | null
  street: ScanStreet
  slab: ScanSlab | null
}): string | null {
  if (!input.forSale) return 'Not for sale'
  if (input.language == null) return 'Language not read'
  if (input.language !== 'EN') return `${input.language} is not priced as English`
  if (input.lowConfidence) return 'Low confidence'
  if (input.ambiguous || !input.printId) return 'Print not exact'
  if (input.slab && !input.slab.grade) return 'Slab grade not read'
  if (input.street.status !== 'fresh') return 'No price yet'
  return null
}

/** The user picked a print for a low-confidence or ambiguous card. Reprices that row only. */
export function choosePrint(card: ScanRow, printId: string, quoteFor: QuoteFor, today: string, prints: PrintRow[], targets: WatchTarget[] = []): ScanRow {
  const sight: ScanSight = {
    row: card.row,
    col: card.col,
    box: card.box,
    code: printId,
    name: card.name,
    language: card.language,
    labelText: null,
    parallel: null,
    confidence: 1,
    sticker: card.sticker,
    slab: card.slab,
    condition: card.condition,
  }
  const mark = card.bundle
    ? { kind: 'bundle' as const, amount: card.bundle.amount, currency: card.bundle.currency, count: card.bundle.count, bundleIndex: card.bundle.index }
    : card.forSale
      ? null
      : { kind: 'unsold' as const, amount: null, currency: 'SGD', count: 1, bundleIndex: null }
  return priceSight(sight, card.index, mark, { prints, quoteFor, today, targets, imageUrl: card.imageUrl })
}

function bundleSums(cards: ScanRow[]): ScanSummary['bundles'] {
  const groups = new Map<number, ScanRow[]>()
  for (const card of cards) {
    if (!card.bundle) continue
    const list = groups.get(card.bundle.index) ?? []
    list.push(card)
    groups.set(card.bundle.index, list)
  }
  return [...groups.entries()].map(([index, group]) => {
    const ask = group[0].bundle?.currency === 'SGD' ? group[0].bundle.amount : null
    const singles = group.filter((card) => card.priced && card.street.sgd != null)
    const singlesSgd = singles.length ? round2(singles.reduce((sum, card) => sum + (card.street.sgd ?? 0), 0)) : null
    return { index, askSgd: ask, singlesSgd, gapSgd: ask != null && singlesSgd != null ? round2(singlesSgd - ask) : null }
  })
}
