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
  /** The card-code text the model read, before it is matched to a print id. */
  codeText: string | null
  code: string | null
  /** Set code from the label, such as EB04, kept apart from the number. */
  setCode?: string | null
  name: string | null
  /** Language the model read. Ignored when the slab label has its own language word. */
  language: string | null
  /** label, card_text_english, or card_text_japanese. */
  languageEvidence?: string | null
  labelText: string | null
  crop?: string | null
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
  grade?: LegalGrade | null
  marketSgd?: number | null
  marketAsOf?: string | null
  marketSource?: string | null
  marketUrl?: string | null
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
  crop: string | null
  name: string | null
  /** Raw code text from the model, even when it is not a print id. */
  codeText: string | null
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
  /** The ask as typed, in lotAskCurrency. A USD ask is not subtracted from the S$ street. */
  lotAskAmount: number | null
  lotAskCurrency: 'SGD' | 'USD' | null
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
  const rows = text.split(/[/|\n]+/)
  for (const row of rows) {
    const tokens = row.trim().split(/\s+/).filter(Boolean)
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]
      if (/^x$/i.test(token)) {
        marks.push({ kind: 'unsold', amount: null, currency: 'SGD', count: 1 })
        continue
      }
      const num = token.match(/^(?:(SGD|S\$|USD|US\$|\$))?(\d+(?:\.\d+)?)$/i)
      if (!num) continue
      let count = 1
      const next = tokens[i + 1] || ''
      const after = tokens[i + 2] || ''
      if (/^\(sequential$/i.test(next) && /^x\d+\)$/i.test(after)) {
        count = Number(after.match(/\d+/)?.[0] || 1)
        i += 2
      } else if (/^\(sequential\s*x\s*\d+\)$/i.test(next)) {
        count = Number(next.match(/\d+/)?.[0] || 1)
        i += 1
      }
      const amount = Number(num[2])
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(count) || count < 1) {
        marks.push({ kind: 'ask', amount: null, currency: 'SGD', count: 1 })
        continue
      }
      marks.push({ kind: count > 1 ? 'bundle' : 'ask', amount, currency: currencyOf(num[1]), count })
    }
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
  if (fromLabel === 'JP' || fromLabel === 'CN' || fromLabel === 'KR' || fromLabel === 'FR') return fromLabel
  if (fromLabel === 'EN') return 'EN'
  const evidence = (sight.languageEvidence || '').trim().toLowerCase()
  if (evidence === 'card_text_japanese') return 'JP'
  if (evidence === 'card_text_english') return 'EN'
  const model = (sight.language || '').trim().toUpperCase()
  if (!sight.labelText?.trim()) return LANG.has(model) ? (model as 'EN') : null
  if (model === 'EN' && sight.confidence >= LOW_CONFIDENCE) return 'EN'
  return null
}

/** PSA 9 and PSA 10 only. A BGS 10, including Pristine, is not a PSA 10. */
function gradeOf(slab: ScanSlab | null): LegalGrade | null {
  if (!slab) return 'raw'
  const grader = (slab.grader || '').trim().toUpperCase()
  const grade = (slab.grade || '').trim().toUpperCase()
  if (!grader || !grade) return null
  if (grader !== 'PSA') return null
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

/** `EB-04-003` and `EB04 003` are the same print id as `EB04-003`. */
export function loosenCode(raw: string): string {
  let text = raw.trim().toUpperCase().replace(/\s+/g, ' ')
  text = text.replace(/^([A-Z]{1,4})-(\d{2})[-\s](\d{3})/, '$1$2-$3')
  text = text.replace(/^([A-Z]{1,4}\d{2})\s+(\d{3})/, '$1-$2')
  return text
}

/** `EB04`, `EB-04`, `OP13`. A four-digit year is not a set. */
export function setToken(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const match = raw.toUpperCase().match(/\b([A-Z]{1,4})-?(\d{2})\b/)
  if (!match) return null
  return `${match[1]}${match[2]}`
}

/**
 * `#106` plus a separate set `EB04` is `EB04-106`.
 * A code that is already a print id is left as that id. A year is not a number.
 */
export function assembleCode(code: string | null | undefined, setCode: string | null | undefined): string | null {
  const raw = (code || '').trim()
  const loosened = raw ? loosenCode(raw) : ''
  if (loosened && splitPrintCode(loosened)) return loosened
  const set = setToken(setCode)
  const num = raw.match(/^#?\s*(\d{1,3})$/)
  if (num && set) return `${set}-${num[1].padStart(3, '0')}`
  return raw || null
}

/** PSA label `OP13 EN / SHANKS / 3RD ANNIVERSARY-SILVER / #004` is OP09-004 Shanks Silver, not Sabo. */
export const SHANKS_SILVER_ID = 'OP09-004p4'
export const SHANKS_SILVER_TCGPLAYER = 657443
export const SHANKS_SILVER_SLUG = 'shanks-silver-op09-004'

export function shanksSilverAlias(parts: Array<string | null | undefined>): string | null {
  const blob = parts.filter((part) => part && part.trim()).join(' ').toUpperCase().replace(/[_-]+/g, ' ')
  if (!blob.includes('SHANKS') || !blob.includes('SILVER')) return null
  if (!/#\s*0*04\b/.test(blob) && !/\b0*04\b/.test(blob)) return null
  const anniversary = /3\s*RD\s+ANNIVERSARY/.test(blob)
  const op13 = /\bOP\s*13\b/.test(blob)
  if (!anniversary && !op13) return null
  return SHANKS_SILVER_ID
}

const ALT_LABEL_IS_MANGA = new Set(['PRB02', 'OP12', 'OP14', 'OP15'])

/** On these sets a slab that says ALTERNATE ART is the manga print, when the family has one. */
function mangaFromAltLabel(setRaw: string | null, code: string | null, label: string | null, parallel: string | null, rows: PrintRow[]): string | null {
  const text = (label || '').toUpperCase()
  if (!text.includes('ALTERNATE ART')) return parallel
  const fromCode = code ? setToken(code) : null
  const set = setToken(setRaw) || fromCode
  if (!set || !ALT_LABEL_IS_MANGA.has(set)) return parallel
  const split = code ? splitPrintCode(loosenCode(code)) : null
  if (!split) return parallel
  const manga = familyOf(rows, split.id).filter((row) => row.variant.toLowerCase().includes('manga'))
  if (manga.length === 1) return 'manga'
  return parallel
}

function nameCandidates(name: string | null, setRaw: string | null, rows: PrintRow[]): string[] {
  const want = (name || '').trim().toLowerCase()
  const set = setToken(setRaw)
  if (want.length < 2 || !set) return []
  return rows
    .filter((row) => {
      const rowName = (row.name || '').trim().toLowerCase()
      if (!rowName || rowName !== want) return false
      const home = row.cardNumber.split('-')[0]
      const listed = (row.setCode || '').replace(/-/g, '').toUpperCase()
      return home === set || listed === set
    })
    .map((row) => row.cardNumber)
}

function contradictsAa(parallel: string | null, label: string | null, printId: string | null, rows: PrintRow[]): boolean {
  const text = (label || '').toUpperCase()
  if (!/\b(PROMO|PCC)\b/.test(text) || text.includes('ALTERNATE ART')) return false
  const word = (parallel || '').trim().toLowerCase()
  if (['aa', 'alt', 'alternate', 'alternate art'].includes(word)) return true
  const print = printId ? rows.find((row) => row.cardNumber.toUpperCase() === printId.toUpperCase()) : undefined
  return (print?.variant || '').toLowerCase().includes('alternate')
}

function promoUnread(code: string | null, label: string | null): boolean {
  const blob = `${code || ''} ${label || ''}`.toUpperCase()
  return /\bP-\d{1,4}\b/.test(blob) || /\bPROMO\b/.test(blob) || /\bPCC\b/.test(blob)
}

/** Set plus number, the Shanks Silver alias, a manga label, or a name inside one set. */
export function readScanCode(
  sight: Pick<ScanSight, 'code' | 'codeText' | 'setCode' | 'name' | 'labelText' | 'parallel' | 'slab'>,
  rows: PrintRow[],
): { codeText: string | null; printId: string | null; ambiguous: boolean; candidates: string[] } {
  const setRaw = sight.setCode || sight.slab?.setName || null
  const assembled = assembleCode(sight.code || sight.codeText, setRaw)
  const alias = shanksSilverAlias([sight.code, sight.codeText, sight.setCode, sight.name, sight.labelText, sight.parallel, sight.slab?.setName])
  if (alias && rows.some((row) => row.cardNumber.toUpperCase() === alias.toUpperCase())) {
    return { codeText: alias, printId: alias, ambiguous: false, candidates: [alias] }
  }
  const parallel = mangaFromAltLabel(setRaw, assembled, sight.labelText ?? null, sight.parallel, rows)
  let resolved = resolveScanPrint(assembled, parallel, rows)
  if (contradictsAa(parallel, sight.labelText ?? null, resolved.printId, rows)) {
    resolved = { printId: null, ambiguous: true, candidates: resolved.candidates }
  }
  const parsed = assembled ? splitPrintCode(loosenCode(assembled)) : null
  if (!parsed) {
    const named = nameCandidates(sight.name ?? null, setRaw, rows)
    if (!resolved.printId && named.length) resolved = { printId: null, ambiguous: true, candidates: named }
  }
  return { codeText: assembled || sight.codeText || sight.code, printId: resolved.printId, ambiguous: resolved.ambiguous, candidates: resolved.candidates }
}

export function resolveScanPrint(code: string | null, parallel: string | null, rows: PrintRow[]): { printId: string | null; ambiguous: boolean; candidates: string[] } {
  const split = splitPrintCode(loosenCode(code || ''))
  const family = split ? familyOf(rows, split.id) : []
  const candidates = family.map((row) => row.cardNumber)
  const word = (parallel || split?.rest || '').trim().toLowerCase()
  const exact = exactPrintId(loosenCode(code || ''))
  if (exact) {
    const hit = rows.find((row) => row.cardNumber.toUpperCase() === exact.toUpperCase())
    if (hit) {
      const bareBase = hit.cardNumber.toUpperCase() === hit.baseNumber.toUpperCase()
      if (!bareBase) {
        if (!word || wordMatches(hit, word)) return { printId: hit.cardNumber, ambiguous: false, candidates }
        return { printId: null, ambiguous: true, candidates }
      }
      if (!word) {
        if (family.length > 1) return { printId: null, ambiguous: true, candidates }
        return { printId: hit.cardNumber, ambiguous: false, candidates }
      }
    }
  }
  if (!word || !family.length) return { printId: null, ambiguous: false, candidates }
  const named = family.filter((row) => wordMatches(row, word))
  if (named.length === 1) return { printId: named[0].cardNumber, ambiguous: false, candidates }
  return { printId: null, ambiguous: true, candidates: (named.length ? named : family).map((row) => row.cardNumber) }
}

function emptyStreet(): ScanStreet {
  return { status: 'none', sgd: null, source: null, asOf: null, url: null, stale: false, label: 'No price yet', sources: [], sourcesDisagree: false }
}

function streetFor(quote: PriceQuote | null, today: string, manual: { sgd: number; asOf: string; source: string; url: string | null } | null): ScanStreet {
  const seed = quote && quote.sgd != null && quote.source && quote.asOf
    ? { source: quote.source, asOf: quote.asOf, sgd: quote.sgd, usd: quote.usd, kind: 'market' as const }
    : null
  if (manual) {
    const fresh: ScanSource = { source: manual.source, asOf: manual.asOf, sgd: manual.sgd, usd: null, kind: 'market' }
    const sources = seed ? [fresh, seed] : [fresh]
    return {
      status: 'fresh',
      sgd: manual.sgd,
      source: manual.source,
      asOf: manual.asOf,
      url: manual.url,
      stale: false,
      label: null,
      sources,
      sourcesDisagree: seed != null && seed.sgd !== manual.sgd,
    }
  }
  if (!seed) return emptyStreet()
  const stale = isStale(seed.asOf, today)
  return {
    status: stale ? 'stale' : 'fresh',
    sgd: seed.sgd,
    source: seed.source,
    asOf: seed.asOf,
    url: quote?.url ?? null,
    stale,
    label: stale ? 'No price yet' : null,
    sources: [seed],
    sourcesDisagree: false,
  }
}

/** A fresh manual English price for this print and grade. It counts ahead of a stale seed quote. */
function manualQuote(printId: string, grade: LegalGrade, targets: WatchTarget[] | undefined, today: string): { sgd: number; asOf: string; source: string; url: string | null } | null {
  const hit = targets?.find((target) => {
    if (target.printId.toUpperCase() !== printId.toUpperCase()) return false
    if (target.grade !== grade) return false
    if (target.marketSgd == null || !Number.isFinite(target.marketSgd) || target.marketSgd < 0) return false
    if (!target.marketAsOf || !target.marketSource) return false
    if (!target.marketUrl?.startsWith('https://')) return false
    if (isStale(target.marketAsOf, today)) return false
    return true
  })
  if (!hit || hit.marketSgd == null || !hit.marketAsOf || !hit.marketSource) return null
  return { sgd: hit.marketSgd, asOf: hit.marketAsOf, source: hit.marketSource, url: hit.marketUrl || null }
}

function likedOf(print: PrintRow | undefined): string | null {
  const who = (print?.character || '').toLowerCase()
  if (!who) return null
  const variant = (print?.variant || '').toLowerCase()
  if (who.includes('luffy')) return 'Luffy'
  if (who.includes('nami')) return 'Nami'
  if (who.includes('boa') || who.includes('hancock')) return 'Boa'
  if (who.includes('sanji') && variant.includes('manga')) return 'Sanji manga'
  return null
}

function certUrl(slab: ScanSlab | null): string | null {
  if (!slab?.cert) return null
  const grader = (slab.grader || '').toUpperCase()
  if (!grader || grader === 'PSA') return `https://www.psacard.com/cert/${encodeURIComponent(slab.cert)}`
  if (grader === 'BGS' || grader === 'BECKETT') return `https://www.beckett.com/grading/card-lookup?item_id=${encodeURIComponent(slab.cert)}`
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
  lotAskCurrency?: 'SGD' | 'USD' | null
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
  const currency = input.lotAskCurrency === 'USD' ? 'USD' : 'SGD'
  return summariseRows(cards, lotAsk, currency)
}

/** Lot totals from rows already priced. Used again after the user picks a print. */
export function summariseRows(cards: ScanRow[], lotAsk: number | null, currency: 'SGD' | 'USD' = 'SGD'): ScanSummary {
  const clearing = cards.filter((card) => card.priced && card.forSale && card.street.status === 'fresh' && card.street.sgd != null)
  const lotStreet = clearing.length ? round2(clearing.reduce((sum, card) => sum + (card.street.sgd ?? 0), 0)) : null
  const sgdAsk = currency === 'SGD' ? lotAsk : null
  return {
    cards,
    lotAskSgd: sgdAsk,
    lotAskAmount: lotAsk,
    lotAskCurrency: lotAsk == null ? null : currency,
    lotStreetSgd: lotStreet,
    lotGapSgd: sgdAsk != null && lotStreet != null ? round2(lotStreet - sgdAsk) : null,
    maxOfferSgd: lotStreet != null ? round2(lotStreet * 0.9) : null,
    bundles: bundleSums(cards),
  }
}

/** Opens /bid with the lot target, the house, the ask currency, and each clearing card's street. */
export function lotOfferPath(scan: ScanSummary, preset: 'ebay' | 'fanatics' | 'goldin' = 'ebay'): string {
  const params = new URLSearchParams()
  if (scan.maxOfferSgd != null) params.set('target', String(scan.maxOfferSgd))
  params.set('preset', preset)
  params.set('currency', scan.lotAskCurrency === 'USD' ? 'USD' : 'SGD')
  const lot = scan.cards
    .filter((card) => card.priced && card.forSale && card.printId && card.street.sgd != null)
    .map((card) => `${card.printId}:${card.street.sgd}`)
    .join(',')
  if (lot) params.set('lot', lot)
  return `/bid?${params.toString()}`
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
  const resolved = readScanCode(sight, input.prints)
  const lowConfidence = sight.confidence < LOW_CONFIDENCE
  const print = resolved.printId ? input.prints.find((row) => row.cardNumber.toUpperCase() === resolved.printId!.toUpperCase()) : undefined
  const forSale = mark?.kind !== 'unsold'
  const sticker = mark?.kind === 'ask' && mark.amount != null ? { amount: mark.amount, currency: mark.currency } : mark ? null : sight.sticker
  const bundle = mark?.kind === 'bundle' && mark.amount != null && mark.bundleIndex != null
    ? { amount: mark.amount, currency: mark.currency, count: mark.count, index: mark.bundleIndex }
    : null
  const grade = gradeOf(sight.slab)
  const canPrice = language === 'EN' && !lowConfidence && !resolved.ambiguous && resolved.printId != null && forSale && grade != null
  const quote = canPrice ? input.quoteFor(resolved.printId!, grade) : null
  const manual = canPrice && resolved.printId ? manualQuote(resolved.printId, grade, input.targets, input.today) : null
  const street = canPrice ? streetFor(quote, input.today, manual) : emptyStreet()
  const fresh = street.status === 'fresh' && street.sgd != null
  const compare = fresh && sticker?.currency === 'SGD'
  const gapSgd = compare ? round2(street.sgd! - sticker.amount) : null
  const gapPct = compare && street.sgd! > 0 ? round2(((street.sgd! - sticker.amount) / street.sgd!) * 100) : null
  const underStreet = gapPct != null && gapPct > UNDER_STREET_PCT
  const watch = resolved.printId ? input.targets?.find((target) => target.printId.toUpperCase() === resolved.printId!.toUpperCase()) : undefined
  const targetHit = Boolean(watch && sticker?.currency === 'SGD' && sticker.amount <= watch.targetSgd)
  const drag = dragReason({
    language,
    lowConfidence,
    ambiguous: resolved.ambiguous,
    forSale,
    printId: resolved.printId,
    codeText: resolved.codeText,
    known: resolved.candidates.length > 0 || resolved.printId != null,
    promo: promoUnread(resolved.codeText, sight.labelText),
    street,
    slab: sight.slab,
    grade,
  })
  return {
    index,
    row: sight.row,
    col: sight.col,
    box: sight.box,
    imageUrl: input.imageUrl ?? null,
    crop: sight.crop ?? null,
    name: sight.name,
    codeText: resolved.codeText,
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
    liked: likedOf(print),
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
  codeText: string | null
  known: boolean
  promo: boolean
  street: ScanStreet
  slab: ScanSlab | null
  grade: LegalGrade | null
}): string | null {
  if (!input.forSale) return 'Not for sale'
  if (input.language == null) return 'Language not read'
  if (input.language !== 'EN') return `${input.language} is not priced as English`
  if (input.lowConfidence) return 'Low confidence'
  if (input.ambiguous) return 'Print not exact'
  if (!input.printId && input.promo) return 'Promo not in price data'
  if (!input.printId) return 'print not in seed'
  if (input.slab && input.grade == null) {
    return input.slab.grade ? 'no stored price for this print/grade' : 'Slab grade not read'
  }
  if (input.street.status === 'none') return 'no stored price for this print/grade'
  if (input.street.status !== 'fresh') return 'No price yet'
  return null
}

/** The user picked a print for a low-confidence or ambiguous card. Reprices that row only. */
export function choosePrint(card: ScanRow, printId: string, quoteFor: QuoteFor, today: string, prints: PrintRow[], targets: WatchTarget[] = []): ScanRow {
  const sight: ScanSight = {
    row: card.row,
    col: card.col,
    box: card.box,
    crop: card.crop,
    code: printId,
    codeText: printId,
    setCode: null,
    name: card.name,
    language: card.language,
    languageEvidence: null,
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
