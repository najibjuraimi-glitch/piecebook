import { useState } from 'react'
import type { RosterSet } from '../data/roster'
import { boxImageUrl, displayCode, displayName } from '../data/roster'
import type { SealedGuidance, SealedProduct } from '../data/sealed'
import type { SetIntro } from '../data/intros'
import { boxPriceHistory } from '../data/boxPrices'
import { changeSince } from '../data/history'
import { formatDate, formatShortDate, formatSignedUsMarketUsd, formatUsd } from '../lib/format'

interface Props {
  set: RosterSet
  /** The EN booster box price row (newest daily feed point); undefined when the set has no EN box. */
  product?: SealedProduct
  /** Cards' facts about the box and set: packs per box, cards per pack, JP title and dates. */
  intro?: SetIntro
  /** EN / JP lines; the EN line carries the override for sets without an EN box (EB-04). */
  guidance?: SealedGuidance
  /** Upcoming set (7.5): the figure is TCGplayer's pre-order market and is labelled so; the render shows even before a price exists. */
  presale?: boolean
  className?: string
}

/**
 * The box as a product at the top of set detail (3.2): official TCGplayer
 * render, TCGplayer market price with its date and, from the second daily
 * reading, its movement, then the box's own facts. One card, one figure, no buy
 * or seller chrome. Sets with no EN box (EB-04) get the guidance line instead
 * of a price.
 */
/** "booster box", "starter deck" — the roster's product in words. */
const productNoun = (product: string) => product.replace(/_/g, ' ')

const SEP = ' · '

export function BoxCard({ set, product, intro, guidance, presale = false, className = '' }: Props) {
  if (!product && !guidance && !presale) return null
  const points = boxPriceHistory(set.setCode).map((p) => ({ asOf: p.asOf, usd: p.marketUsd, source: 'limitless' as const }))
  const change = changeSince(points, 30)
  const facts = [
    intro?.packsPerBox ? `${intro.packsPerBox} packs` : null,
    intro?.cardsPerPack ? `${intro.cardsPerPack} cards per pack` : null,
  ].filter((f): f is string => f !== null)
  // Dates live in About this set below; the card keeps only the box's own facts and its JP counterpart.
  const jp = intro?.jpName ? `JP box ${intro.jpName}` : null
  const hasBox = Boolean(product && product.usMarketUsd !== null)
  // `pre-order market · TCGplayer · as of 4 Sep 2026`, or `TCGplayer market · as of 4 Sep 2026` once released.
  // From the second reading the movement leads and the as-of date follows it when the line has room.
  const lead = presale ? ['pre-order market', 'TCGplayer'] : ['TCGplayer market']
  const asOf = product?.asOf ? `as of ${formatDate(product.asOf)}` : null

  return (
    <section aria-label="Sealed" className={`flex gap-4 rounded-2xl border border-line bg-surface p-4 tablet:gap-6 tablet:p-5 ${className}`}>
      {(hasBox || presale) && <BoxImage set={set} />}

      <div className="min-w-0 flex-1">
        <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">{hasBox || presale ? `${set.language} ${productNoun(set.product)}` : 'Sealed'}</p>

        {hasBox && product ? (
          <>
            <p className="tabular mt-1 text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-ink">{formatUsd(product.usMarketUsd ?? 0)}</p>
            {/* The line qualifies the figure (whose market, which day), so it reads in ink. */}
            <p className="tabular mt-0.5 text-meta text-ink">
              {lead.join(SEP)}
              {SEP}
              {/* Clauses wrap whole, so a narrow column breaks at a separator rather than inside a date. */}
              {change ? (
                <>
                  <span className="whitespace-nowrap">
                    <span className="font-medium">{change.delta === 0 ? 'no change' : formatSignedUsMarketUsd(change.delta)}</span> since{' '}
                    {formatShortDate(change.since.asOf)}
                  </span>
                  {asOf && (
                    <>
                      {'\u00a0· '}
                      <span className="whitespace-nowrap">{asOf}</span>
                    </>
                  )}
                </>
              ) : (
                <span className="whitespace-nowrap">{asOf}</span>
              )}
            </p>
          </>
        ) : presale ? (
          <p className="tabular mt-1 text-body text-ink">No pre-order market yet · TCGplayer</p>
        ) : (
          guidance && <p className="tabular mt-1 text-body text-ink">{guidance.en}</p>
        )}

        {(facts.length > 0 || jp) && (
          <p className="tabular mt-3 border-t border-line pt-3 text-meta text-muted">{[...facts, jp].filter(Boolean).join(SEP)}</p>
        )}
      </div>
    </section>
  )
}

/** The render on white, framed; type-first when the set has no EN box or the image fails. */
function BoxImage({ set }: { set: RosterSet }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const src = set.tcgplayerProductId ? boxImageUrl(set.tcgplayerProductId, 'in_1000x1000') : set.boxArtUrl
  const show = Boolean(src) && !failed
  return (
    <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl bg-white tablet:w-36">
      {show && (
        <img
          src={src ?? undefined}
          alt={`${displayName(set)} ${productNoun(set.product)}`}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full object-contain p-1.5 transition-opacity duration-200 ease-out ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {!(show && loaded) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#EFEBE3] px-2 text-center">
          {/* The code when it is real; a provisional code is never shown, so the name stands in. */}
          {displayCode(set) ? (
            <span className="tabular text-[15px] font-semibold text-ink">{set.setCode}</span>
          ) : (
            <span className="line-clamp-3 text-[11px] font-medium leading-4 text-ink">{displayName(set)}</span>
          )}
        </div>
      )}
    </div>
  )
}
