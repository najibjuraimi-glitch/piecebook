/**
 * Sealed guidance per set. The seed CSVs carry no `sealed_guidance` column yet,
 * so these short notes are maintained here until Cards supplies them in the
 * data contract. Keep them brief and factual: which product feeds which language.
 */
export interface SealedGuidance {
  en: string
  jp: string
}

const SEALED: Record<string, SealedGuidance> = {
  'OP-09': {
    en: 'EN booster box (24 packs × 12 cards) feeds this EN checklist. EN release 13 Dec 2024.',
    jp: 'JP box of the same set (新たなる皇帝) pulls Japanese-language prints, which are not in this EN seed.',
  },
  'OP-16': {
    en: 'EN booster box (24 packs × 12 cards) feeds this EN checklist. EN release 12 Jun 2026.',
    jp: 'JP box (決戦の刻, 24 packs × 6 cards, out 30 May 2026) pulls Japanese-language prints, which are not in this EN seed.',
  },
}

export function getSealedGuidance(setCode: string): SealedGuidance | undefined {
  return SEALED[setCode]
}
