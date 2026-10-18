import { legalGrade } from './boughtBook'
import { formatSgd } from './format'
import type { ScanRow } from './scanMatch'

/**
 * How far a sticker sits under the street price before the label changes color.
 * Green is further under than `greenAbovePct`. Amber runs from `amberPct` through that line.
 */
export const LABEL_UNDER = {
  amberPct: 5,
  greenAbovePct: 10,
} as const

export type LabelTone = 'green' | 'amber' | 'neutral' | 'muted'

export interface OverlayLabel {
  languageTag: 'EN' | 'JP' | '?'
  code: string
  grade: string
  price: string
  sticker: string | null
  tone: LabelTone
}

export interface PlacedLabel {
  index: number
  left: number
  top: number
}

export interface BookPrice {
  printId: string
  grade: string | null
  marketSgd: number | null
  /** JP only when the watch or holding row says so. An English manual price is not a JP comp. */
  language: string | null
}

/** Live view on a phone with a camera. A desktop pointer keeps the upload form. */
export function preferLiveScan(camera: boolean, coarsePointer: boolean): boolean {
  return camera && coarsePointer
}

export function gradeAsRead(slab: { grader?: string | null; grade?: string | null } | null | undefined): string {
  if (!slab) return 'Raw'
  const text = [slab.grader, slab.grade].map((part) => (part || '').trim()).filter(Boolean).join(' ')
  return text || 'Raw'
}

export function codeAsRead(codeText: string | null | undefined): string {
  const text = (codeText || '').trim()
  return text || '—'
}

function languageTag(language: string | null | undefined): 'EN' | 'JP' | '?' {
  const tag = (language || '').trim().toUpperCase()
  if (tag === 'EN' || tag === 'JP') return tag
  return '?'
}

function gapPct(street: number, sticker: number): number {
  return ((street - sticker) / street) * 100
}

function toneForGap(gap: number): LabelTone {
  if (gap > LABEL_UNDER.greenAbovePct) return 'green'
  if (gap >= LABEL_UNDER.amberPct) return 'amber'
  return 'neutral'
}

function stickerLine(sticker: { amount: number; currency: string } | null): string | null {
  if (!sticker || !Number.isFinite(sticker.amount)) return null
  const currency = sticker.currency.trim().toUpperCase() || 'SGD'
  if (currency === 'SGD') return formatSgd(sticker.amount)
  return `${currency} ${sticker.amount}`
}

/**
 * One overlay chip. A JP card is colored only against a JP comp.
 * No sticker means the price alone, in a neutral color.
 */
export function overlayLabel(input: {
  language: string | null
  codeText: string | null
  gradeText: string | null
  sticker: { amount: number; currency: string } | null
  enStreetSgd: number | null
  jpCompSgd: number | null
  stale?: boolean
}): OverlayLabel {
  const language = languageTag(input.language)
  const code = codeAsRead(input.codeText)
  const grade = (input.gradeText || '').trim() || '—'
  const sticker = stickerLine(input.sticker)
  const comparable = input.sticker != null && input.sticker.currency.trim().toUpperCase() === 'SGD' && input.sticker.amount > 0
  if (language === 'JP') {
    if (input.jpCompSgd == null || !(input.jpCompSgd > 0)) {
      return { languageTag: language, code, grade, price: 'no JP comp', sticker, tone: 'muted' }
    }
    if (!comparable) {
      return { languageTag: language, code, grade, price: formatSgd(input.jpCompSgd), sticker, tone: 'neutral' }
    }
    return {
      languageTag: language,
      code,
      grade,
      price: formatSgd(input.jpCompSgd),
      sticker,
      tone: toneForGap(gapPct(input.jpCompSgd, input.sticker!.amount)),
    }
  }
  const street = input.enStreetSgd
  if (language !== 'EN' || street == null || !(street > 0)) {
    return { languageTag: language, code, grade, price: 'No price yet', sticker, tone: 'neutral' }
  }
  if (input.stale) {
    return { languageTag: language, code, grade, price: `${formatSgd(street)} · Stale`, sticker, tone: 'neutral' }
  }
  if (!comparable) {
    return { languageTag: language, code, grade, price: formatSgd(street), sticker, tone: 'neutral' }
  }
  return {
    languageTag: language,
    code,
    grade,
    price: formatSgd(street),
    sticker,
    tone: toneForGap(gapPct(street, input.sticker!.amount)),
  }
}

function sameGrade(read: string, book: string | null): boolean {
  const left = legalGrade(read)
  const right = legalGrade(book || '')
  return Boolean(left && right && left === right)
}

/** The manual SGD figure on a watch or holding row that is marked JP, for this print and grade. */
export function manualJpComp(rows: BookPrice[], printId: string | null, gradeText: string | null): number | null {
  if (!printId || !gradeText || gradeText === '—') return null
  const want = printId.toUpperCase()
  const hits = rows.filter((row) => {
    if ((row.language || '').trim().toUpperCase() !== 'JP') return false
    if (row.printId.toUpperCase() !== want) return false
    if (row.marketSgd == null || !Number.isFinite(row.marketSgd) || row.marketSgd < 0) return false
    return sameGrade(gradeText, row.grade)
  })
  if (!hits.length) return null
  const price = hits[0].marketSgd as number
  if (hits.some((row) => row.marketSgd !== price)) return null
  return price
}

export function bookPrices(input: {
  watch?: { code?: string | null; grade?: string | null; marketSgd?: number | null; language?: string | null }[]
  holdings?: { code?: string | null; exactPrint?: string | null; grade?: string | null; marketValueSgd?: number | null; language?: string | null }[]
}): BookPrice[] {
  const out: BookPrice[] = []
  for (const row of input.watch ?? []) {
    if (!row.code) continue
    out.push({ printId: row.code, grade: row.grade ?? null, marketSgd: row.marketSgd ?? null, language: row.language ?? null })
  }
  for (const row of input.holdings ?? []) {
    const id = (row.exactPrint || row.code || '').trim()
    if (!id) continue
    out.push({ printId: id, grade: row.grade ?? null, marketSgd: row.marketValueSgd ?? null, language: row.language ?? null })
  }
  return out
}

export function overlayForCard(card: Pick<ScanRow, 'language' | 'codeText' | 'slab' | 'sticker' | 'street' | 'printId'>, rows: BookPrice[]): OverlayLabel {
  const grade = gradeAsRead(card.slab)
  return overlayLabel({
    language: card.language,
    codeText: card.codeText,
    gradeText: grade,
    sticker: card.sticker,
    enStreetSgd: card.language === 'EN' && card.street.sgd != null && (card.street.status === 'fresh' || card.street.status === 'stale') ? card.street.sgd : null,
    jpCompSgd: card.language === 'JP' ? manualJpComp(rows, card.printId, grade) : null,
    stale: card.language === 'EN' && card.street.status === 'stale',
  })
}

const CHIP_W = 156
const CHIP_H = 84

/** Keep each label inside the frame, and step a later label down when it would cover an earlier one. */
export function placeOverlayLabels(
  items: { index: number; x: number; y: number }[],
  frame: { x: number; y: number; w: number; h: number },
): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  const maxLeft = Math.max(8, frame.x + frame.w - CHIP_W)
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let left = Math.min(Math.max(8, frame.x + item.x), maxLeft)
    let top = Math.max(8, frame.y + item.y)
    for (let guard = 0; guard < 6; guard += 1) {
      const hit = placed.some((other) => Math.abs(other.left - left) < CHIP_W - 8 && Math.abs(other.top - top) < CHIP_H - 8)
      if (!hit) break
      top += 36
    }
    placed.push({ index: item.index, left, top })
  }
  return placed
}
