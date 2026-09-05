import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getSet } from '../data/seed'
import { rosterSealedProduct, type RosterSet } from '../data/roster'
import { pluralCards } from '../lib/format'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { SealedPrice } from './SealedPrice'
import { StarIcon } from './StarButton'

/**
 * One roster set. Art band from the roster's box art (type-first when null),
 * card count from the seed CSV when the checklist is ready, "Checklist soon"
 * when it is pending, and the sealed price row only when Cards has a price.
 */
export function SetTile({ set }: { set: RosterSet }) {
  const catalog = set.cardSeedStatus === 'ready' ? getSet(set.setCode) : undefined
  const sealed = rosterSealedProduct(set)
  const watching = useWatchlist().isWatchingSet(set.setCode)
  const { isOwned } = useCollection()
  const ownedInSet = catalog ? catalog.cards.filter((c) => isOwned(c.cardNumber)).length : 0
  return (
    <Link
      to={`/sets/${encodeURIComponent(set.setCode)}`}
      className="block h-full overflow-hidden rounded-2xl border border-line bg-surface shadow-paper transition-transform duration-150 ease-out active:scale-[0.99]"
    >
      <ArtBand setCode={set.setCode} setName={set.setName} boxArtUrl={set.boxArtUrl} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">
            {set.language} set<span className="tabular normal-case tracking-normal"> · {set.setCode}</span>
          </p>
          <span className="flex items-center gap-1.5">
            {watching && <StarIcon filled className="h-4 w-4 text-ink" />}
            <ChevronRight />
          </span>
        </div>
        <p className="mt-1.5 text-title text-ink">{set.setName}</p>
        <p className="tabular mt-1 text-meta text-muted">
          {catalog ? `${pluralCards(catalog.cards.length)} in seed` : 'Checklist soon'}
          {ownedInSet > 0 && <span className="text-ink"> · you own {ownedInSet}</span>}
        </p>

        {/* The meta line above already says "EN set", so the price row reads "Box · S$750". */}
        {sealed && (
          <SealedPrice product={sealed} withLanguage={false} className="mt-4 border-t border-line pt-3.5" />
        )}
      </div>
    </Link>
  )
}

interface ArtBandProps {
  setCode: string
  setName: string
  boxArtUrl: string | null
}

/**
 * Top band of the tile. Shows Cards' booster box art when `boxArtUrl` is
 * seeded, cropped with object-fit: cover so the box face fills the band. Falls
 * back to type-first (the set code large on tinted paper) only when there is
 * no URL or the image fails to load.
 */
function ArtBand({ setCode, setName, boxArtUrl }: ArtBandProps) {
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
          <p className="tabular text-[56px] font-bold leading-none tracking-[-0.03em] text-ink">{setCode}</p>
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
