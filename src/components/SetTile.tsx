import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CardSet } from '../data/seed'
import { getSealedProduct } from '../data/sealed'
import { pluralCards } from '../lib/format'
import { SealedPrice } from './SealedPrice'

export function SetTile({ set }: { set: CardSet }) {
  const language = set.cards[0]?.language ?? 'EN'
  const sealed = getSealedProduct(set.setCode, language)
  return (
    <Link
      to={`/sets/${encodeURIComponent(set.setCode)}`}
      className="block overflow-hidden rounded-2xl border border-line bg-surface shadow-paper transition-transform duration-150 ease-out active:scale-[0.99]"
    >
      <ArtBand setCode={set.setCode} setName={set.setName} boxArtUrl={sealed?.boxArtUrl ?? null} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">
            {language} set<span className="tabular normal-case tracking-normal"> · {set.setCode}</span>
          </p>
          <ChevronRight />
        </div>
        <p className="mt-1.5 text-title text-ink">{set.setName}</p>
        <p className="tabular mt-1 text-meta text-muted">{pluralCards(set.cards.length)} in seed</p>

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
 * seeded; until then (and if the image fails) it is type-first: the set code
 * large on tinted paper.
 */
function ArtBand({ setCode, setName, boxArtUrl }: ArtBandProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const showArt = Boolean(boxArtUrl) && !failed

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#EFEBE3]">
      {showArt && (
        <img
          src={boxArtUrl ?? undefined}
          alt={`${setName} booster box`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover transition-opacity duration-200 ease-out ${
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
