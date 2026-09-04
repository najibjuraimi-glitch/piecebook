import { Link } from 'react-router-dom'
import type { Card } from '../data/seed'
import { CardArt } from './CardArt'
import { RarityChip } from './RarityChip'

interface Props {
  card: Card
  owned?: boolean
  qty?: number
}

export function CardCell({ card, owned = false, qty = 0 }: Props) {
  return (
    <Link
      to={`/cards/${encodeURIComponent(card.cardNumber)}`}
      className="group block rounded-xl focus-visible:outline-offset-4"
    >
      <div className="relative">
        <CardArt card={card} />
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
        <p className="truncate text-[15px] font-medium leading-5 text-ink">{card.name}</p>
        <div className="flex items-center gap-1.5">
          <span className="tabular truncate text-meta text-muted">{card.cardNumber}</span>
          <RarityChip rarity={card.rarity} />
        </div>
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
