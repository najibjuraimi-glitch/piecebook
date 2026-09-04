import { sealedProductLabel, type SealedProduct } from '../data/sealed'
import { formatDate, formatSgd, formatUsMarketUsd } from '../lib/format'

const SEP = ' · '

/**
 * Two-line sealed price from Cards' seed: SG ask first (primary), US market and
 * as-of date muted underneath. Falls back to the US figure as primary when the
 * SG ask is missing. Renders nothing when neither price is seeded.
 *
 * `withLanguage` controls the "EN" in "EN box"; pass false where the language
 * is already visible in the same stack (e.g. under an "EN set" meta line).
 */
export function sealedPriceLines(
  p: SealedProduct,
  withLanguage = true,
): { primary: string; secondary: string | null } | null {
  const label = sealedProductLabel(p, withLanguage)
  const sg = p.sgAskSgd !== null ? formatSgd(p.sgAskSgd) : null
  const us = p.usMarketUsd !== null ? formatUsMarketUsd(p.usMarketUsd) : null
  const asOf = p.asOf ? `as of ${formatDate(p.asOf)}` : null

  if (sg) {
    const secondary = [us, asOf].filter(Boolean).join(SEP)
    return { primary: `${label}${SEP}${sg}`, secondary: secondary || null }
  }
  if (us) return { primary: `${label}${SEP}${us}`, secondary: asOf }
  return null
}

interface Props {
  product: SealedProduct
  /** Set false when the language is already shown nearby; the row then reads "Box · S$750". */
  withLanguage?: boolean
  className?: string
}

export function SealedPrice({ product, withLanguage = true, className = '' }: Props) {
  const lines = sealedPriceLines(product, withLanguage)
  if (!lines) return null
  return (
    <div className={`tabular ${className}`}>
      <p className="text-[15px] font-medium leading-5 text-ink">{lines.primary}</p>
      {lines.secondary && <p className="mt-0.5 text-meta text-muted">{lines.secondary}</p>}
    </div>
  )
}
