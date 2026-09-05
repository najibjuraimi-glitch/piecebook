import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getSet } from '../data/seed'
import { comingLine, displayCode, isUpcoming, rosterSealedProduct, type RosterSet } from '../data/roster'
import { latestBoxPrice } from '../data/boxPrices'
import { formatUsMarketUsd, pluralCards } from '../lib/format'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { SealedPrice } from './SealedPrice'
import { StarIcon } from './StarButton'

/**
 * One roster set. Art band from the roster's box art (type-first when null),
 * card count from the seed CSV when the checklist is ready, "Checklist soon"
 * when it is pending, and the sealed price row only when Cards has a price.
 *
 * An upcoming set (7.5) shows the same render, its name with no code (the code
 * is provisional until Limitless confirms it), `Coming 20 Nov 2026`, and the
 * pre-order market where TCGCSV has one; no packs / cards line.
 */
export function SetTile({ set }: { set: RosterSet }) {
  const upcoming = isUpcoming(set)
  const catalog = set.cardSeedStatus === 'ready' ? getSet(set.setCode) : undefined
  const sealed = upcoming ? undefined : rosterSealedProduct(set)
  const presale = upcoming ? latestBoxPrice(set.setCode) : undefined
  const code = displayCode(set)
  const watching = useWatchlist().isWatchingSet(set.setCode)
  const { isOwned } = useCollection()
  const ownedInSet = catalog ? catalog.cards.filter((c) => isOwned(c.cardNumber)).length : 0
  return (
    <Link
      to={`/sets/${encodeURIComponent(set.setCode)}`}
      className="block h-full overflow-hidden rounded-2xl border border-line bg-surface shadow-paper transition-transform duration-150 ease-out active:scale-[0.99]"
    >
      <ArtBand fallback={code ?? set.setName} fallbackIsCode={code !== null} setName={set.setName} boxArtUrl={set.boxArtUrl} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">
            {set.language} {set.product === 'starter_deck' ? 'starter deck' : 'set'}
            {code && <span className="tabular normal-case tracking-normal"> · {code}</span>}
          </p>
          <span className="flex items-center gap-1.5">
            {watching && <StarIcon filled className="h-4 w-4 text-ink" />}
            <ChevronRight />
          </span>
        </div>
        <p className="mt-1.5 text-title text-ink">{set.setName}</p>
        {upcoming ? (
          <p className="tabular mt-1 text-meta text-muted">{comingLine(set) ?? 'Checklist soon'}</p>
        ) : (
          <p className="tabular mt-1 text-meta text-muted">
            {catalog ? (set.product === 'starter_deck' ? `${catalog.cards.length} different cards` : `${pluralCards(catalog.cards.length)} in seed`) : 'Checklist soon'}
            {ownedInSet > 0 && <span className="text-ink"> · you own {ownedInSet}</span>}
          </p>
        )}

        {/* The meta line above already says "EN set", so the price row reads "Box · S$750". */}
        {sealed && (
          <SealedPrice product={sealed} withLanguage={false} className="mt-4 border-t border-line pt-3.5" />
        )}
        {/* Pre-orders open before release: TCGplayer's market for the box, named as such. Nothing when TCGCSV has no price yet. */}
        {presale && (
          <p className="tabular mt-4 border-t border-line pt-3.5 text-[15px] font-medium leading-5 text-ink">
            pre-order market {formatUsMarketUsd(presale.marketUsd)} · TCGplayer
          </p>
        )}
      </div>
    </Link>
  )
}

interface ArtBandProps {
  /** Type-first fallback when there is no art: the set code, or the name for a set whose code is still provisional. */
  fallback: string
  fallbackIsCode: boolean
  setName: string
  boxArtUrl: string | null
}

/**
 * Top band of the tile. Shows Cards' booster box art when `boxArtUrl` is
 * seeded, cropped with object-fit: cover so the box face fills the band. Falls
 * back to type-first (the set code large on tinted paper) only when there is
 * no URL or the image fails to load.
 */
function ArtBand({ fallback, fallbackIsCode, setName, boxArtUrl }: ArtBandProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const showArt = Boolean(boxArtUrl) && !failed

  return (
    <div className={`relative aspect-[3/2] w-full overflow-hidden ${showArt && loaded ? 'bg-white' : 'bg-[#EFEBE3]'}`}>
      {showArt && (
        <img
          src={boxArtUrl ?? undefined}
          alt={`${setName} booster box`}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          // Design: centre cover. Vendored box fronts are pre-framed to the band's 3:2 so the
          // face fills the band with lightbox walls and floor already outside the frame.
          className={`h-full w-full object-contain p-3 transition-opacity duration-200 ease-out ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
      {!(showArt && loaded) && (
        <div className="absolute inset-0 flex items-end p-5">
          {fallbackIsCode ? (
            <p className="tabular text-[56px] font-bold leading-none tracking-[-0.03em] text-ink">{fallback}</p>
          ) : (
            <p className="text-display text-ink">{fallback}</p>
          )}
        </div>
      )}
    </div>
  )
}

export function ChevronRight({ className = 'h-5 w-5 text-muted' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M7.5 4.5L13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
