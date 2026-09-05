import { getSetIntro } from './intros'
import { formatDate } from '../lib/format'

/**
 * Sealed guidance per set: which box feeds the EN set and when, and the JP box
 * it mirrors. Derived from Cards' `data/set-intros.json` (EN / JP release dates
 * and the JP title from Bandai's product pages), so no set needs hand-written
 * copy. The strip shows the language as a badge beside each line, so the copy
 * itself does not repeat it ("EN  Box feeds…", not "EN  EN box feeds…").
 */
export interface SealedGuidance {
  en: string
  jp: string
}

/** Sets whose EN product is not a plain booster box; the derived line would be misleading. */
const OVERRIDES: Record<string, Partial<SealedGuidance>> = {
  'EB-04': { en: 'No EN box · cards ship in OP14-EB04 (16 Jan 2026) and OP15-EB04 (3 Apr 2026)' },
}

export function getSealedGuidance(setCode: string, language = 'EN'): SealedGuidance | undefined {
  const intro = getSetIntro(setCode, language)
  const override = OVERRIDES[setCode] ?? {}
  const en = override.en ?? (intro?.enReleased ? `Box feeds this set · ${formatDate(intro.enReleased)}` : null)
  const jp =
    override.jp ??
    (intro?.jpReleased
      ? `Box${intro.jpName ? ` (${intro.jpName})` : ''} · ${formatDate(intro.jpReleased)}`
      : null)
  if (!en && !jp) return undefined
  return { en: en ?? '—', jp: jp ?? '—' }
}

/**
 * The sealed product a set's box prices describe. Built from the roster row
 * (`data/sets-roster-en.json`): SG ask in SGD, US market in USD, both as of
 * `asOf`, the US figure from the daily TCGCSV feed. `boxArtUrl` is the official
 * TCGplayer render (or a local path Cards wrote), null for type-first.
 */
export interface SealedProduct {
  setCode: string
  setName: string
  language: string
  product: string
  boxArtUrl: string | null
  sgAskSgd: number | null
  sgSource: string | null
  usMarketUsd: number | null
  usSource: string | null
  asOf: string | null
}

/**
 * Short product noun for the price row: "EN box", or just "Box" when the
 * surrounding UI already states the language (avoids "EN … EN box").
 */
export function sealedProductLabel(p: SealedProduct, withLanguage = true): string {
  const noun = p.product === 'booster_box' ? 'box' : p.product.replace(/_/g, ' ')
  if (withLanguage) return `${p.language} ${noun}`
  return noun.charAt(0).toUpperCase() + noun.slice(1)
}
