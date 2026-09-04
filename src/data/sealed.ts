import sealedSeed from '../../data/sealed-seed.json'

/**
 * Sealed guidance per set. The seed CSVs carry no `sealed_guidance` column yet,
 * so these short notes are maintained here until Cards supplies them in the
 * data contract. Keep them brief and factual: which product feeds which language.
 */
export interface SealedGuidance {
  en: string
  jp: string
}

// The strip shows the language as a badge beside each line, so the copy itself
// does not repeat it ("EN  Box feeds…", not "EN  EN box feeds…").
const SEALED: Record<string, SealedGuidance> = {
  'OP-09': {
    en: 'Box feeds this set · 13 Dec 2024',
    jp: 'Box (新たなる皇帝) · 31 Aug 2024',
  },
  'OP-16': {
    en: 'Box feeds this set · 12 Jun 2026',
    jp: 'Box (決戦の刻) · 30 May 2026',
  },
}

export function getSealedGuidance(setCode: string): SealedGuidance | undefined {
  return SEALED[setCode]
}

/**
 * One sealed product row from Cards' `data/sealed-seed.json`. Prices are seed
 * values (SG ask in SGD, US market in USD) as of `asOf`; there is no live feed.
 * `boxArtUrl` is null until Cards fills it; the UI stays type-first meanwhile.
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

function toProduct(row: (typeof sealedSeed)[number]): SealedProduct {
  const sg = Number(row.sgAskSgd)
  const us = Number(row.usMarketUsd)
  return {
    setCode: row.setCode,
    setName: row.setName,
    language: row.language || 'EN',
    product: row.product || 'booster_box',
    boxArtUrl: row.boxArtUrl || null,
    sgAskSgd: Number.isFinite(sg) ? sg : null,
    sgSource: row.sgSource || null,
    usMarketUsd: Number.isFinite(us) ? us : null,
    usSource: row.usSource || null,
    asOf: row.asOf || null,
  }
}

const SEALED_PRODUCTS: SealedProduct[] = sealedSeed.map(toProduct)

/** The EN booster box for a set, if Cards has seeded one. */
export function getSealedProduct(
  setCode: string,
  language = 'EN',
  product = 'booster_box',
): SealedProduct | undefined {
  return SEALED_PRODUCTS.find(
    (p) => p.setCode === setCode && p.language === language && p.product === product,
  )
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
