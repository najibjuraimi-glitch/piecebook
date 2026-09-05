import React from 'react'
import { Link } from 'react-router-dom'
import type { Card } from '../data/seed'
import { formatUsd } from '../lib/format'
import { CardArt } from './CardArt'
import { RarityChip } from './RarityChip'
import { StarIcon } from './StarButton'

interface Props {
  card: Card
  owned?: boolean
  qty?: number
  /** Optional muted "Paid S$120" line under the market figure (Collection only). */
  paid?: string
  /** Small star on the art when the card is on the watchlist. */
  watching?: boolean
}

/** Art grid: 2 / 3 / 4 / 5 columns at phone / tablet / desktop / wide. Shared by Set detail and Collection. */
export function CardGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <ul className={`grid grid-cols-2 gap-3 tablet:grid-cols-3 tablet:gap-4 desktop:grid-cols-4 wide:grid-cols-5 ${className}`}>
      {children}
    </ul>
  )
}

export function CardCell({ card, owned = false, qty = 0, paid, watching = false }: Props) {
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
        {owned && (
          <span
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink/90 text-white shadow-sm"
            aria-label="Owned"
          >
            <CheckIcon />
          </span>
        )}
        {owned && qty > 1 && (
          <span className="tabular absolute bottom-2 right-2 rounded-md bg-ink/85 px-1.5 py-0.5 text-[11px] font-semibold leading-[14px] text-white">
            ×{qty}
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
        {/* Seed market_usd only; no as-of, change or trend on cells. */}
        {card.marketUsd !== null && (
          <p className="tabular text-meta text-muted">{formatUsd(card.marketUsd)}</p>
        )}
        {paid && <p className="tabular truncate text-meta text-muted">Paid {paid}</p>}
      </div>
    </Link>
  )
}

export function CheckIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
