import type { Card } from '../data/seed'
import type { VisionIdentify } from './vision'
import { formatDate, formatUsMarketUsd } from './format'

export type VersionHint = 'sp' | 'manga' | 'alt'

/** Photo text/guess that names a non-base print. SPECIAL in OCR counts as SP. */
export function identifyVersionHint(identify: VisionIdentify | null | undefined): VersionHint | null {
  if (!identify) return null
  const g = (identify.parallel_guess ?? '').toLowerCase()
  const text = `${identify.read_text ?? ''} ${identify.parallel_guess ?? ''}`
  if (g.includes('manga') || /\bmanga\b/i.test(identify.read_text ?? '')) return 'manga'
  if (
    g === 'sp' ||
    g.includes('special') ||
    /\bSPECIAL\b/i.test(text) ||
    /(?:^|[^\w])SP(?:[^\w]|$)/i.test(identify.read_text ?? '')
  ) {
    return 'sp'
  }
  if (g.includes('parallel') || g.includes('alt')) return 'alt'
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
