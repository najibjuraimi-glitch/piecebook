import React from 'react'
import { Link } from 'react-router-dom'
import type { Card } from '../data/seed'
import { formatSignedPercent, formatSignedUsd, formatUsd } from '../lib/format'
import type { GridMove } from '../data/history'
import { CardArt } from './CardArt'
import { RarityChip } from './RarityChip'
import { StarIcon } from './StarButton'

interface Props {
  card: Card
  /** Held or listed copy whose code is this print. */
  inPortfolio?: boolean
  /** Small star on the art when the card is on the watchlist. */
  watching?: boolean
  /**
   * Week seed-price move on set-detail singles: dollars and percent, in ink.
   * Omitted when history has fewer than two points.
   */
  marketMove?: GridMove
}

/** Art grid: 2 / 3 / 4 / 5 columns at phone / tablet / desktop / wide. Shared by set, character, and search lists. */
export function CardGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <ul className={`grid grid-cols-2 gap-3 tablet:grid-cols-3 tablet:gap-4 desktop:grid-cols-4 wide:grid-cols-5 ${className}`}>
      {children}
    </ul>
  )
}

export function CardCell({ card, inPortfolio = false, watching = false, marketMove }: Props) {
  return (
    <Link
      to={`/cards/${encodeURIComponent(card.cardNumber)}`}
      className="group block rounded-xl focus-visible:outline-offset-4"
    >
      <div className="relative">
        <CardArt card={card} />
        {watching && (
          <span
            className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-paper/95 text-ink shadow-sm"
            aria-label="Watching"
          >
            <StarIcon filled className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 space-y-0.5 px-0.5">
        <p className="truncate text-[15px] font-medium leading-5 text-ink">
          {card.name}
          {card.variant && <span className="font-normal text-muted"> · {card.variant}</span>}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="tabular truncate text-meta text-muted">{card.cardNumber}</span>
          <RarityChip rarity={card.rarity} />
        </div>
        {card.marketUsd !== null && (
          <p className="tabular text-[15px] font-medium leading-5 text-ink">{formatUsd(card.marketUsd)}</p>
        )}
        {inPortfolio && <p className="text-meta font-medium text-ink">In your portfolio</p>}
        {marketMove && (
          <p className="tabular text-meta text-ink">
            {formatSignedUsd(marketMove.delta)}
            {marketMove.percent != null && ` (${formatSignedPercent(marketMove.percent)})`}
          </p>
        )}
      </div>
    </Link>
  )
}
