/**
 * Prints of one card number, for a holding or a watch row.
 * English stored prices only are the value. A Japanese figure is labeled JP
 * and is never the value. Nothing here fetches a price.
 */
import { ALL_CARDS, compareCardNumbers, rarityLabel, type Card } from '../data/seed'
import { advicePrices } from './cardPrices'
import { exactPrintId, splitPrintCode } from './printResolve'
import type { LegalGrade } from './boughtBook'

export interface EnglishPrintPrice {
  sgd: number
  usd: number
  source: string
  asOf: string
}

export interface JapanesePrintNote {
  grade: string
  usd: number
  source: string
  asOf: string
}

export interface SeedPrintLine {
  cardNumber: string
  rarity: string
  rarityLabel: string
  variant: string | null
  imageUrl: string | null
  pinned: boolean
  /** English stored price for the row's grade. Null is "no price". */
  english: EnglishPrintPrice | null
  /** Present on the seed, shown labeled JP, never used as the value. */
  japanese: JapanesePrintNote[]
}

export interface PrintMatch {
  /** Card number inside the code, parallel suffix removed. Null when the code has none. */
  base: string | null
  prints: SeedPrintLine[]
  pinnedId: string | null
  /** No exactPrint, and the code itself is not treated as the pin. */
  exactMissing: boolean
  /** The code has words after the card number, so it is not one print. */
  ambiguous: boolean
}

function baseOf(code: string): string | null {
  const split = splitPrintCode(code)
  if (!split) return null
  return split.id.replace(/p\d+$/i, '')
}

function isJapanese(detail: string | null): boolean {
  return (detail || '').toLowerCase().includes('japanese')
}

function pricesFor(card: Card, grade: LegalGrade | null): { english: EnglishPrintPrice | null; japanese: JapanesePrintNote[] } {
  const rows = advicePrices(card)
  const japanese: JapanesePrintNote[] = []
  for (const row of rows) {
    if (row.usd == null || !row.source || !row.asOf) continue
    if (isJapanese(row.detail) || (card.language || '').toUpperCase() !== 'EN') {
      japanese.push({ grade: row.label, usd: row.usd, source: row.source, asOf: row.asOf })
    }
  }
  const wanted = grade ?? 'raw'
  const row = rows.find((price) => price.grade === wanted)
  const english =
    row &&
    row.usd != null &&
    row.sgd != null &&
    row.source &&
    row.asOf &&
    !isJapanese(row.detail) &&
    (card.language || 'EN').toUpperCase() === 'EN'
      ? { sgd: row.sgd, usd: row.usd, source: row.source, asOf: row.asOf }
      : null
  return { english, japanese }
}

/**
 * Every seed print of the card number inside `code`.
 * `exactPrint` pins a holding. A watch row passes `codeIsPin` so its print id is the pin.
 */
export function matchPrints(input: {
  code: string
  exactPrint?: string | null
  grade?: LegalGrade | null
  codeIsPin?: boolean
}): PrintMatch {
  const split = splitPrintCode(input.code)
  const base = baseOf(input.code)
  const cards = base
    ? ALL_CARDS.filter((card) => card.baseNumber.toUpperCase() === base.toUpperCase()).sort((a, b) =>
        compareCardNumbers(a.cardNumber, b.cardNumber),
      )
    : []
  const fromExact = exactPrintId(input.exactPrint)
  const fromCode = input.codeIsPin ? exactPrintId(input.code) : null
  const pinnedId = fromExact ?? fromCode
  const prints: SeedPrintLine[] = cards.map((card) => {
    const { english, japanese } = pricesFor(card, input.grade ?? null)
    return {
      cardNumber: card.cardNumber,
      rarity: card.rarity,
      rarityLabel: rarityLabel(card.rarity),
      variant: card.variant,
      imageUrl: card.imageUrl,
      pinned: pinnedId != null && card.cardNumber.toUpperCase() === pinnedId.toUpperCase(),
      english,
      japanese,
    }
  })
  return {
    base,
    prints,
    pinnedId: prints.some((print) => print.pinned) ? pinnedId : null,
    exactMissing: pinnedId == null,
    ambiguous: Boolean(split?.rest),
  }
}
