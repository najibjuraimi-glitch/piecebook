import { Link } from 'react-router-dom'
import type { CardSet } from '../data/seed'
import { pluralCards } from '../lib/format'

export function SetTile({ set }: { set: CardSet }) {
  const language = set.cards[0]?.language ?? 'EN'
  return (
    <Link
      to={`/sets/${encodeURIComponent(set.setCode)}`}
      className="block rounded-2xl border border-line bg-surface shadow-paper transition-transform duration-150 ease-out active:scale-[0.99]"
    >
      <div className="flex aspect-[16/10] flex-col justify-between p-5">
        <div className="flex items-start justify-between">
          <span className="text-meta font-medium uppercase tracking-[0.08em] text-muted">{language} set</span>
          <ChevronRight />
        </div>
        <div>
          <p className="tabular text-[56px] font-bold leading-none tracking-[-0.03em] text-ink">{set.setCode}</p>
          <p className="mt-3 text-title text-ink">{set.setName}</p>
          <p className="tabular mt-1 text-meta text-muted">{pluralCards(set.cards.length)} in seed</p>
        </div>
      </div>
    </Link>
  )
}

export function ChevronRight({ className = 'h-5 w-5 text-muted' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M7.5 4.5L13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
