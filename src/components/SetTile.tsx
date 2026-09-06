import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getSet } from '../data/seed'
import { comingLine, displayCode, displayName, isUpcoming, productLabel, rosterSealedProduct, type RosterSet } from '../data/roster'
import { latestBoxPrice } from '../data/boxPrices'
import { formatDate, formatUsMarketUsd, pluralCards } from '../lib/format'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { SealedPrice } from './SealedPrice'
import { StarIcon } from './StarButton'

/**
 * One roster set. Art band from the roster's box art (type-first when null),
 * card count from the checklist when it is ready, "Checklist soon" when it is
 * pending, and the sealed price row only when Cards has a price.
 *
 * An upcoming set (7.5) reads like any other tile: eyebrow `EN set · OP-18`
 * (or `EN extra booster · EB-05`), TCGplayer's name once, `Coming 20 Nov 2026`
 * where the count would be, and `Box · pre-order US $399.72 · as of 4 Sep 2026`
 * where TCGCSV has a pre-order market; no packs / cards line. While TCGplayer
 * serves no render, the band is short and carries only the date.
 */
export function SetTile({ set }: { set: RosterSet }) {
  const upcoming = isUpcoming(set)
  const catalog = set.cardSeedStatus === 'ready' ? getSet(set.setCode) : undefined
  const sealed = upcoming ? undefined : rosterSealedProduct(set)
  const presale = upcoming ? latestBoxPrice(set.setCode) : undefined
  const code = displayCode(set)
  const name = displayName(set)
  const coming = upcoming ? comingLine(set) : null
  const watching = useWatchlist().isWatchingSet(set.setCode)
  const { isOwned } = useCollection()
  const ownedInSet = catalog ? catalog.cards.filter((c) => isOwned(c.cardNumber)).length : 0
  return (
    <Link
      to={`/sets/${encodeURIComponent(set.setCode)}`}
      className="block h-full overflow-hidden rounded-2xl border border-line bg-surface shadow-paper transition-transform duration-150 ease-out active:scale-[0.99]"
    >
      <ArtBand
        fallback={code ?? name}
        fallbackIsCode={code !== null}
        setName={name}
        boxArtUrl={set.boxArtUrl}
        pending={upcoming ? { line: coming } : undefined}
      />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">
            {set.language} {productLabel(set)}
            {code && <span className="tabular normal-case tracking-normal"> · {code}</span>}
          </p>
          <span className="flex items-center gap-1.5">
            {watching && <StarIcon filled className="h-4 w-4 text-ink" />}
            <ChevronRight />
          </span>
        </div>
        <p className="mt-1.5 text-title text-ink">{name}</p>
        {upcoming ? (
          // The date qualifies the whole tile, so it reads in ink, not as a caption.
          <p className="tabular mt-1 text-meta text-ink">{coming ?? 'Checklist soon'}</p>
        ) : (
          <p className="tabular mt-1 text-meta text-muted">
            {catalog ? (set.product === 'starter_deck' ? `${catalog.cards.length} different cards` : pluralCards(catalog.cards.length)) : 'Checklist soon'}
            {ownedInSet > 0 && <span className="text-ink"> · you own {ownedInSet}</span>}
          </p>
        )}

        {/* The meta line above already says "EN set", so the price row reads "Box · S$750". */}
        {sealed && (
          <SealedPrice product={sealed} withLanguage={false} className="mt-4 border-t border-line pt-3.5" />
        )}
        {/* Pre-orders open before release: the same one-line shape as a released box, the figure named as a pre-order. Nothing when TCGCSV has no price yet. */}
        {presale && (
          <p className="tabular mt-4 border-t border-line pt-3.5 text-[15px] font-medium leading-5 text-ink">
            Box · pre-order {formatUsMarketUsd(presale.marketUsd)} · as of {formatDate(presale.asOf)}
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
  /** An upcoming set (7.5): until TCGplayer serves the render, a short band carrying only its date line. */
  pending?: { line: string | null }
}

/**
 * Top band of the tile. Shows the box render when `boxArtUrl` is set, letterboxed
 * on white so the box face fills the 3:2 band. Falls back to type-first (the set
 * code large on tinted paper) only when there is no URL or the image fails to
 * load. For an upcoming set the fallback is a short 96px band with the date
 * alone (the name sits under it, once); the full band returns with the render.
 */
function ArtBand({ fallback, fallbackIsCode, setName, boxArtUrl, pending }: ArtBandProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const showArt = Boolean(boxArtUrl) && !failed
  const artShown = showArt && loaded
  const short = Boolean(pending) && !artShown

  return (
    <div className={`relative w-full overflow-hidden ${short ? 'h-24' : 'aspect-[3/2]'} ${artShown ? 'bg-white' : 'bg-[#EFEBE3]'}`}>
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
      {!artShown &&
        (pending ? (
          <div className="absolute inset-0 flex items-end p-5" aria-hidden="true">
            {pending.line && <p className="tabular text-[15px] font-medium leading-5 text-ink">{pending.line}</p>}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-end p-5">
            {fallbackIsCode ? (
              <p className="tabular text-[56px] font-bold leading-none tracking-[-0.03em] text-ink">{fallback}</p>
            ) : (
              <p className="text-display text-ink">{fallback}</p>
            )}
          </div>
        ))}
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
