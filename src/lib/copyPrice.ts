import type { Card } from '../data/seed'
import type { VisionIdentify } from './vision'
import { formatDate, formatUsMarketUsd } from './format'

export type VersionHint = 'sp' | 'manga' | 'alt'

/** Rarity cue in OCR: a lone "SP" token or the "SPECIAL CARD" stamp. The attack attribute prints as "Special" on base cards too. */
export function textNamesSp(readText: string | null | undefined): boolean {
  const t = readText ?? ''
  return /\bSPECIAL CARD\b/i.test(t) || /(?:^|[^\w])SP(?:[^\w]|$)/.test(t)
}

/**
 * Photo text/guess that names a non-base print. The model's `parallel_guess`
 * is trusted when it gave one; OCR text only decides when it did not. SPECIAL
 * on its own is the attack attribute (OP09-070 base is a Special-attribute
 * card), so it counts as an SP cue only without a model guess.
 */
export function identifyVersionHint(identify: VisionIdentify | null | undefined): VersionHint | null {
  if (!identify) return null
  const g = (identify.parallel_guess ?? '').trim().toLowerCase()
  const text = identify.read_text ?? ''
  if (g === 'base') return null
  if (g.includes('manga')) return 'manga'
  if (g === 'sp' || g.includes('special')) return 'sp'
  if (g.includes('parallel') || g.includes('alt')) return 'alt'
  if (g) return null
  if (/\bmanga\b/i.test(text)) return 'manga'
  if (textNamesSp(text) || /\bSPECIAL\b/i.test(text)) return 'sp'
  return null
}

export function cardMatchesVersionHint(card: Card, hint: VersionHint): boolean {
  if (hint === 'sp') return card.rarity === 'SP' || /special/i.test(card.variant ?? '')
  if (hint === 'manga') return /manga/i.test(card.variant ?? '')
  return card.isParallel
}

/**
 * Seed price for the confirmed print only. Never borrow the base print's
 * market. If the photo is an SP/alt/manga and this row is not that version,
 * or a parallel has no figure of its own: "no price for this version".
 */
export function copySeedPriceLine(card: Card, identify?: VisionIdentify | null): string {
  const hint = identifyVersionHint(identify)
  if (hint && !cardMatchesVersionHint(card, hint)) return 'no price for this version'
  if (card.isParallel && (card.marketUsd == null || !card.asOf)) return 'no price for this version'
  if (card.marketUsd != null && card.asOf) {
    return `seed ${formatUsMarketUsd(card.marketUsd)} as of ${formatDate(card.asOf)} — not a sold`
  }
  return 'no seed market'
}
