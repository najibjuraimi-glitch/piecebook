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
    en: 'EN box feeds this set · 13 Dec 2024',
    jp: 'JP box (新たなる皇帝) · 31 Aug 2024',
  },
  'OP-16': {
    en: 'EN box feeds this set · 12 Jun 2026',
    jp: 'JP box (決戦の刻) · 30 May 2026',
  },
}

export function getSealedGuidance(setCode: string): SealedGuidance | undefined {
  return SEALED[setCode]
}
