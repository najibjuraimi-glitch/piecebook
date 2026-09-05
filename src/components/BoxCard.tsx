import { useState } from 'react'
import type { RosterSet } from '../data/roster'
import { boxImageUrl } from '../data/roster'
import type { SealedGuidance, SealedProduct } from '../data/sealed'
import type { SetIntro } from '../data/intros'
import { boxPriceHistory } from '../data/boxPrices'
import { changeSince } from '../data/history'
import { formatDate, formatSignedUsd, formatUsd } from '../lib/format'

interface Props {
  set: RosterSet
  /** The EN booster box price row (newest daily feed point); undefined when the set has no EN box. */
  product?: SealedProduct
  /** Cards' facts about the box and set: packs per box, cards per pack, JP title and dates. */
  intro?: SetIntro
  /** EN / JP lines; the EN line carries the override for sets without an EN box (EB-04). */
  guidance?: SealedGuidance
  className?: string
}

/**
 * The box as a product at the top of set detail (3.2): official TCGplayer
 * render, TCGplayer market price read daily with its date and movement, then
 * the box's own facts. One card, one figure, no buy or seller chrome. Sets with
 * no EN box (EB-04) get the guidance line instead of a price.
 */
export function BoxCard({ set, product, intro, guidance, className = '' }: Props) {
  if (!product && !guidance) return null
  const points = boxPriceHistory(set.setCode).map((p) => ({ asOf: p.asOf, usd: p.marketUsd, source: 'limitless' as const }))
  const change = changeSince(points, 30)
  const facts = [
    intro?.packsPerBox ? `${intro.packsPerBox} packs` : null,
    intro?.cardsPerPack ? `${intro.cardsPerPack} cards per pack` : null,
  ].filter((f): f is string => f !== null)
  // Dates live in About this set below; the card keeps only the box's own facts and its JP counterpart.
  const jp = intro?.jpName ? `JP box ${intro.jpName}` : null
  const hasBox = Boolean(product && product.usMarketUsd !== null)

  return (
    <section aria-label="Sealed" className={`flex gap-4 rounded-2xl border border-line bg-surface p-4 tablet:gap-6 tablet:p-5 ${className}`}>
      {hasBox && <BoxImage set={set} />}

      <div className="min-w-0 flex-1">
        <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">{hasBox ? `${set.language} booster box` : 'Sealed'}</p>

        {hasBox && product ? (
          <>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <p className="tabular text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-ink">{formatUsd(product.usMarketUsd ?? 0)}</p>
              {product.asOf && <p className="tabular text-meta text-muted">as of {formatDate(product.asOf)}</p>}
            </div>
            <p className="tabular mt-0.5 text-meta text-muted">
              {change ? (
                <>
                  <span className={change.delta > 0 ? 'font-medium text-good' : change.delta < 0 ? 'font-medium text-bad' : 'text-ink'}>
                    {change.delta === 0 ? 'Unchanged' : formatSignedUsd(change.delta)}
                  </span>{' '}
                  since {formatDate(change.since.asOf)}
                </>
              ) : points.length === 1 ? (
                `TCGplayer market · read daily since ${formatDate(points[0].asOf)}`
              ) : (
                'TCGplayer market · read daily'
              )}
            </p>
          </>
        ) : (
          guidance && <p className="tabular mt-1 text-body text-ink">{guidance.en}</p>
        )}

        {(facts.length > 0 || jp) && (
          <p className="tabular mt-3 border-t border-line pt-3 text-meta text-muted">{[...facts, jp].filter(Boolean).join(' · ')}</p>
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
          alt={`${set.setName} booster box`}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full object-contain p-1.5 transition-opacity duration-200 ease-out ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {!(show && loaded) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#EFEBE3]">
          <span className="tabular text-[15px] font-semibold text-ink">{set.setCode}</span>
        </div>
      )}
    </div>
  )
}
