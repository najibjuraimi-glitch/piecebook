import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getSet } from '../data/seed'
import { rosterSealedProduct, type RosterSet } from '../data/roster'
import { formatDate, formatUsMarketUsd } from '../lib/format'
import { useCollection } from '../store/collection'
import { ChevronRight } from './SetTile'

/**
 * One starter deck as a quiet row under the booster tiles (6.5): the official
 * render, code and name, then release date · cards in seed · daily TCGplayer
 * price. Thirty-six decks as rows, not tiles, so the boosters stay the page.
 */
export function StarterDeckRow({ set }: { set: RosterSet }) {
  const catalog = set.cardSeedStatus === 'ready' ? getSet(set.setCode) : undefined
  const sealed = rosterSealedProduct(set)
  const { isOwned } = useCollection()
  const ownedInSet = catalog ? catalog.cards.filter((c) => isOwned(c.cardNumber)).length : 0
  const [failed, setFailed] = useState(false)
  const meta = [
    set.enReleased ? formatDate(set.enReleased) : null,
    catalog ? `${catalog.cards.length} different cards` : 'Checklist soon · not on Limitless yet',
    sealed?.usMarketUsd !== null && sealed?.usMarketUsd !== undefined ? formatUsMarketUsd(sealed.usMarketUsd) : null,
  ].filter((m): m is string => m !== null)
  return (
    <Link
      to={`/sets/${encodeURIComponent(set.setCode)}`}
      className="flex min-h-[64px] items-center gap-3 px-3 py-2.5 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
        {set.boxArtUrl && !failed ? (
          <img src={set.boxArtUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-contain p-0.5" />
        ) : (
          <span className="tabular text-[11px] font-semibold text-muted">{set.setCode}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-5 text-ink">
          <span className="tabular text-muted">{set.setCode}</span> · {set.setName}
        </p>
        <p className="tabular text-meta text-muted">
          {ownedInSet > 0 && <span className="text-ink">you own {ownedInSet} · </span>}
          {meta.join(' · ')}
        </p>
      </div>
      <ChevronRight />
    </Link>
  )
}
