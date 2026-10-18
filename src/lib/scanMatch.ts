/**
 * Turn a case-scan reading into priced rows.
 * Street figures are stored English quotes only. Nothing here fetches a price.
 * A Japanese card is never given an English price, and an English card is
 * never given a Japanese one. A low-confidence or ambiguous print is not priced.
 */
import { isStale, round2, type LegalGrade, type PriceQuote } from './boughtBook'
import { manualPrintQuote } from './manualQuotes'
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
  /** The user picked this print. The read name is not checked again. */
  picked?: boolean
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
  /** `manual` when the figure was typed, not read from the seed. */
  detail: string | null
  sources: ScanSource[]
  sourcesDisagree: boolean
  /** Sold comps kept as evidence. They are not the street price. */
  evidence: { usd: number; asOf: string; source: string }[]
}

export interface WatchTarget {
  id: string
  printId: string
  targetSgd: number | null
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
  /** The label is a promo or collection that is not in the seed. */
  collection: boolean
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
 * A PSA set name that is not itself a set code.
 * `EN 2ND ANNIVERSARY SET` is OP-09. `PB STORAGE BOX SET-GOLD` is OP-08.
 */
export function setPrefix(raw: string | null | undefined): string | null {
  const token = setToken(raw)
  if (token) return token
  if (!raw?.trim()) return null
  const text = raw.toUpperCase()
  if (/2\s*ND\s+ANNIVERSARY/.test(text)) return 'OP09'
  if (/\bPB\b/.test(text) && /STORAGE\s+BOX/.test(text)) return 'OP08'
  return null
}

/**
 * `#106` plus a separate set `EB04` is `EB04-106`.
 * A code that is already a print id is left as that id. A year is not a number.
 */
function zeroPrintId(id: string): boolean {
  return /-000(?:p\d+)?$/i.test(id)
}

export function assembleCode(code: string | null | undefined, setCode: string | null | undefined): string | null {
  const raw = (code || '').trim()
  const loosened = raw ? loosenCode(raw) : ''
  const split = loosened ? splitPrintCode(loosened) : null
  if (split && zeroPrintId(split.id)) return null
  if (split) return loosened
  const set = setPrefix(setCode)
  const num = raw.match(/^#?\s*(\d{1,3})$/)
  if (num && set && Number(num[1]) > 0) return `${set}-${num[1].padStart(3, '0')}`
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

function nameHits(want: string, have: string): boolean {
  const left = want.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const right = have.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (left.length < 2 || !right) return false
  if (right === left) return true
  const haveTokens = right.split(' ').filter((token) => token.length > 1)
  const wantTokens = left.split(' ').filter((token) => token.length > 1)
  if (!wantTokens.length || !haveTokens.length) return false
  if (wantTokens.length === 1) return haveTokens.includes(wantTokens[0])
  return wantTokens.every((token) => haveTokens.includes(token))
}

/** `#061` plus `Luffy` across every set, when the label set name did not resolve. */
function nameNumberCandidates(name: string | null, code: string | null, rows: PrintRow[]): string[] {
  const num = (code || '').trim().match(/^#?\s*(\d{1,3})$/)
  const want = (name || '').trim()
  if (!num || want.length < 2) return []
  const suffix = `-${num[1].padStart(3, '0')}`
  return rows
    .filter((row) => {
      const base = row.cardNumber.toUpperCase().replace(/P\d+$/, '')
      if (!base.endsWith(suffix)) return false
      return nameHits(want, row.name || '') || nameHits(want, row.character || '')
    })
    .map((row) => row.cardNumber)
}

function nameCandidates(name: string | null, setRaw: string | null, rows: PrintRow[]): string[] {
  const want = (name || '').trim()
  if (want.length < 2) return []
  const prefix = setToken(setRaw)
  return rows
    .filter((row) => {
      if (!nameHits(want, row.name || '') && !nameHits(want, row.character || '')) return false
      if (!prefix) return true
      const home = row.cardNumber.split('-')[0].toUpperCase()
      const listed = (row.setCode || '').replace(/-/g, '').toUpperCase()
      return home === prefix || listed === prefix
    })
    .map((row) => row.cardNumber)
}

/** Promo and collection labels. A 2nd-anniversary set name is a real set, handled by setPrefix. */
export function collectionLabel(text: string | null | undefined): boolean {
  const t = (text || '').toUpperCase()
  if (!t.trim()) return false
  if (/\bFILM\s+RED\b/.test(t)) return true
  if (/2\s*ND\s+ANNIVERSARY/.test(t)) return false
  return /PREMIUM\s+CARD\s+COLL/.test(t)
    || /PREMIUM\s+COLLECTION/.test(t)
    || /GIFT\s+COLLECTION/.test(t)
    || /ANNIVERSARY\s+SET/.test(t)
    || /\bPROMO\b/.test(t)
    || /\bPCC\b/.test(t)
    || /\bP-\d{1,4}\b/.test(t)
}

function collectionPrint(row: PrintRow): boolean {
  const variant = row.variant.toLowerCase()
  return variant.includes('premium') || variant.includes('gift collection') || variant.includes('promo')
}

function baseOrAa(row: PrintRow): boolean {
  if (row.cardNumber.toUpperCase() === row.baseNumber.toUpperCase()) return true
  return row.variant.toLowerCase().includes('alternate')
}

function namesAgree(read: string | null | undefined, print: PrintRow): boolean {
  if (!read?.trim()) return true
  return nameHits(read, print.name || '') || nameHits(read, print.character || '')
}

function labelNumber(sight: Pick<ScanSight, 'code' | 'codeText' | 'labelText'>): string | null {
  const labeled = `${sight.labelText || ''} ${sight.codeText || ''}`.match(/#\s*(\d{1,3})\b/)
  if (labeled && Number(labeled[1]) > 0) return labeled[1].padStart(3, '0')
  const fromCode = splitPrintCode(loosenCode(sight.code || sight.codeText || ''))
  const num = fromCode?.id.match(/-(\d{3})$/)
  if (num && num[1] !== '000') return num[1]
  return null
}

/**
 * The read code named a different person. Try the label's set plus its number,
 * then that name plus the number in every set.
 */
function recoverByName(
  sight: Pick<ScanSight, 'code' | 'codeText' | 'name' | 'labelText' | 'parallel'>,
  setRaw: string | null,
  rows: PrintRow[],
  readCode: string | null,
): { printId: string | null; ambiguous: boolean; candidates: string[]; nameMismatch: boolean; codeText: string | null } | null {
  const num = labelNumber(sight)
  const fromSet = num ? assembleCode(`#${num}`, setRaw) : null
  const echoed = readCode || sight.codeText || sight.code
  if (fromSet && splitPrintCode(loosenCode(fromSet))) {
    const retry = resolveScanPrint(fromSet, sight.parallel, rows)
    const named = retry.candidates.filter((id) => {
      const row = rows.find((item) => item.cardNumber.toUpperCase() === id.toUpperCase())
      return row && namesAgree(sight.name, row)
    })
    if (named.length === 1) return { printId: named[0], ambiguous: false, candidates: named, nameMismatch: false, codeText: fromSet }
    if (named.length > 1) return { printId: null, ambiguous: true, candidates: named, nameMismatch: false, codeText: fromSet }
    if (!retry.candidates.length) return { printId: null, ambiguous: false, candidates: [], nameMismatch: false, codeText: fromSet }
  }
  const across = num ? nameNumberCandidates(sight.name, `#${num}`, rows) : []
  if (across.length === 1) return { printId: across[0], ambiguous: false, candidates: across, nameMismatch: false, codeText: echoed }
  if (across.length > 1) return { printId: null, ambiguous: true, candidates: across, nameMismatch: false, codeText: echoed }
  return null
}

function promoUnread(code: string | null, label: string | null, setName: string | null): boolean {
  const blob = `${code || ''} ${label || ''} ${setName || ''}`
  return /\bP-\d{1,4}\b/i.test(blob) || collectionLabel(blob)
}

const CANDIDATE_CAP = 8

function limitCandidates(ids: string[], name: string | null | undefined, parallel: string | null | undefined, rows: PrintRow[], keepReadCode = false): string[] {
  let list = ids
  if (name?.trim()) {
    const agreed = list.filter((id) => {
      const row = rows.find((item) => item.cardNumber.toUpperCase() === id.toUpperCase())
      return row && namesAgree(name, row)
    })
    if (agreed.length) list = agreed
    else if (!(keepReadCode && list.length === 0)) list = nameCandidates(name, null, rows)
  }
  const word = (parallel || '').trim().toLowerCase()
  const ranked = list
    .map((id, index) => {
      const row = rows.find((item) => item.cardNumber.toUpperCase() === id.toUpperCase())
      const parallelFirst = row && word && wordMatches(row, word) ? 0 : 1
      return { id, parallelFirst, index }
    })
    .sort((a, b) => a.parallelFirst - b.parallelFirst || a.index - b.index)
  return ranked.slice(0, CANDIDATE_CAP).map((item) => item.id)
}

/** Set plus number, the Shanks Silver alias, a manga label, or a name inside one set. */
export function readScanCode(
  sight: Pick<ScanSight, 'code' | 'codeText' | 'setCode' | 'name' | 'labelText' | 'parallel' | 'slab' | 'picked'>,
  rows: PrintRow[],
): { codeText: string | null; printId: string | null; ambiguous: boolean; candidates: string[]; nameMismatch: boolean; collection: boolean } {
  const setRaw = sight.setCode || sight.slab?.setName || null
  const rawCode = (sight.code || sight.codeText || '').trim() || null
  const assembled = assembleCode(rawCode, setRaw)
  let codeText = assembled || rawCode
  const alias = shanksSilverAlias([sight.code, sight.codeText, sight.setCode, sight.name, sight.labelText, sight.parallel, sight.slab?.setName])
  if (alias && rows.some((row) => row.cardNumber.toUpperCase() === alias.toUpperCase())) {
    return { codeText: alias, printId: alias, ambiguous: false, candidates: [alias], nameMismatch: false, collection: false }
  }
  const parallel = mangaFromAltLabel(setRaw, assembled, sight.labelText ?? null, sight.parallel, rows)
  let resolved = { ...resolveScanPrint(assembled, parallel, rows), nameMismatch: false }
  const labelBlob = `${sight.labelText || ''} ${sight.setCode || ''} ${sight.slab?.setName || ''}`
  const mappedSet = Boolean(setRaw && !setToken(setRaw) && setPrefix(setRaw))
  if (collectionLabel(labelBlob) && !mappedSet) {
    const collection = resolved.candidates
      .map((id) => rows.find((row) => row.cardNumber.toUpperCase() === id.toUpperCase()))
      .filter((row): row is PrintRow => Boolean(row && collectionPrint(row)))
    const current = resolved.printId ? rows.find((row) => row.cardNumber.toUpperCase() === resolved.printId!.toUpperCase()) : undefined
    if (!current || (baseOrAa(current) && !collectionPrint(current))) {
      if (collection.length === 0) {
        return { codeText, printId: null, ambiguous: false, candidates: [], nameMismatch: false, collection: true }
      }
      resolved = collection.length === 1
        ? { printId: collection[0].cardNumber, ambiguous: false, candidates: collection.map((row) => row.cardNumber), nameMismatch: false }
        : { printId: null, ambiguous: true, candidates: collection.map((row) => row.cardNumber), nameMismatch: false }
    }
  }
  if (!sight.picked && resolved.printId && sight.name?.trim()) {
    const print = rows.find((row) => row.cardNumber.toUpperCase() === resolved.printId!.toUpperCase())
    if (print && !namesAgree(sight.name, print)) {
      const recovered = recoverByName(sight, setRaw, rows, codeText)
      if (recovered) {
        codeText = recovered.codeText || codeText
        resolved = recovered
      } else {
        resolved = {
          printId: null,
          ambiguous: true,
          candidates: nameCandidates(sight.name, sight.slab ? setRaw : null, rows),
          nameMismatch: true,
        }
      }
    }
  }
  const parsed = assembled ? splitPrintCode(loosenCode(assembled)) : null
  if (!parsed && !resolved.printId && !resolved.nameMismatch && !fullPrintCode(codeText)) {
    const named = nameCandidates(sight.name ?? null, setRaw, rows)
    if (named.length) resolved = { printId: null, ambiguous: true, candidates: named, nameMismatch: false }
  }
  if (!resolved.printId && resolved.candidates.length === 0 && !resolved.nameMismatch && !fullPrintCode(codeText)) {
    const across = nameNumberCandidates(sight.name ?? null, sight.code || sight.codeText, rows)
    if (across.length) resolved = { printId: null, ambiguous: true, candidates: across, nameMismatch: false }
  }
  const candidates = limitCandidates(resolved.candidates, sight.name, sight.parallel, rows, fullPrintCode(codeText))
  const printId = resolved.printId && candidates.some((id) => id.toUpperCase() === resolved.printId!.toUpperCase()) ? resolved.printId : null
  return { codeText, printId, ambiguous: resolved.ambiguous || (resolved.printId != null && printId == null && candidates.length > 0), candidates, nameMismatch: resolved.nameMismatch, collection: false }
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
  return { status: 'none', sgd: null, source: null, asOf: null, url: null, stale: false, label: 'No price yet', detail: null, sources: [], sourcesDisagree: false, evidence: [] }
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
      detail: null,
      sources,
      sourcesDisagree: seed != null && seed.sgd !== manual.sgd,
      evidence: [],
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
    detail: quote?.detail ?? null,
    sources: [seed],
    sourcesDisagree: false,
    evidence: [],
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

function likedFromText(text: string, manga: boolean): string | null {
  const who = text.toLowerCase()
  if (who.includes('luffy')) return 'Luffy'
  if (who.includes('nami')) return 'Nami'
  if (who.includes('boa') || who.includes('hancock')) return 'Boa'
  if (who.includes('sanji') && manga) return 'Sanji manga'
  return null
}

/** The print's character when the card was identified. The read name only when it was not. */
function likedOf(print: PrintRow | undefined, name: string | null, parallel: string | null): string | null {
  if (print?.character) {
    return likedFromText(print.character, (print.variant || '').toLowerCase().includes('manga'))
  }
  if (print) return null
  const parallelText = (parallel || '').toLowerCase()
  return likedFromText(`${name || ''} ${parallel || ''}`, parallelText.includes('manga'))
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
  const confidence = resolved.nameMismatch ? Math.min(sight.confidence, LOW_CONFIDENCE - 0.01) : sight.confidence
  const lowConfidence = confidence < LOW_CONFIDENCE
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
  const targetHit = Boolean(watch && watch.targetSgd != null && sticker?.currency === 'SGD' && sticker.amount <= watch.targetSgd)
  const evidence = street.detail === 'manual' && resolved.printId && grade ? manualPrintQuote(resolved.printId, grade)?.comps ?? [] : []
  const streetWithEvidence = evidence.length ? { ...street, evidence } : street
  const drag = dragReason({
    language,
    labelLang: languageFromLabel(sight.labelText),
    lowConfidence,
    ambiguous: resolved.ambiguous,
    forSale,
    printId: resolved.printId,
    codeText: resolved.codeText,
    known: resolved.candidates.length > 0 || resolved.printId != null,
    promo: promoUnread(resolved.codeText, sight.labelText, sight.slab?.setName ?? sight.setCode ?? null),
    collection: resolved.collection,
    street: streetWithEvidence,
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
    confidence,
    lowConfidence,
    ambiguous: resolved.ambiguous,
    candidates: resolved.candidates,
    priced: fresh,
    forSale,
    sticker,
    bundle,
    street: streetWithEvidence,
    gapSgd,
    gapPct,
    underStreet,
    targetHit,
    watchId: watch?.id ?? null,
    liked: likedOf(print, sight.name, sight.parallel),
    slab: sight.slab,
    certUrl: certUrl(sight.slab),
    condition: sight.condition ?? emptyCondition(),
    drag,
    contributionSgd: fresh ? round2(street.sgd! * 0.9) : null,
    collection: resolved.collection,
  }
}

function fullPrintCode(code: string | null): boolean {
  if (!code) return false
  const split = splitPrintCode(loosenCode(code))
  return Boolean(split && !split.rest)
}

function dragReason(input: {
  language: string | null
  labelLang: 'EN' | 'JP' | 'CN' | 'KR' | 'FR' | null
  lowConfidence: boolean
  ambiguous: boolean
  forSale: boolean
  printId: string | null
  codeText: string | null
  known: boolean
  promo: boolean
  collection: boolean
  street: ScanStreet
  slab: ScanSlab | null
  grade: LegalGrade | null
}): string | null {
  if (!input.forSale) return 'Not for sale'
  if (input.labelLang && input.labelLang !== 'EN') return `${input.labelLang} is not priced as English`
  if (input.language == null) return 'Language not read'
  if (input.language !== 'EN') return `${input.language} is not priced as English`
  if (!input.printId && !input.ambiguous && fullPrintCode(input.codeText)) {
    return input.promo || input.collection ? 'Promo/collection: not in price data' : 'print not in seed'
  }
  if (input.lowConfidence) return 'Low confidence'
  if (input.ambiguous) return 'Print not exact'
  if (!input.printId && (input.promo || input.collection)) return 'Promo/collection: not in price data'
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
    picked: true,
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
