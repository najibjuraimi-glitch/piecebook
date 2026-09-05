import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Card } from '../data/seed'
import { changeSince, type PriceChange, type PricePoint } from '../data/history'
import { formatDate, formatSignedUsd } from '../lib/format'
import { CardArt } from './CardArt'

export interface MoverCard {
  card: Card
  /** Owned quantity; 0 when the card is only watched. */
  qty: number
}

interface Mover extends MoverCard {
  change: PriceChange
}

/**
 * Windows, not exact spans: the reference is the newest point at least this old,
 * so with weekly points "Week" reaches back up to 13 days. Each row says since when.
 */
const WINDOWS: { days: number; label: string; noun: string }[] = [
  { days: 7, label: 'Week', noun: 'this week' },
  { days: 30, label: 'Month', noun: 'this month' },
]

const PER_LIST = 5

/** Smallest move worth listing; a cent on a 6-cent common is noise, not a mover. */
export const MIN_MOVE_USD = 0.1

/**
 * Biggest moves among the cards a collector owns or watches, in words: the
 * signed seed-price change over the chosen window with the date it is measured
 * from, up to five up and five down. No percentages, sparklines or tickers.
 */
export function Movers({ cards, byCard, loading, className = '' }: { cards: MoverCard[]; byCard: Map<string, PricePoint[]>; loading: boolean; className?: string }) {
  const [days, setDays] = useState(7)
  const window = WINDOWS.find((w) => w.days === days) ?? WINDOWS[0]

  const movers: Mover[] = []
  for (const item of cards) {
    const change = changeSince(byCard.get(item.card.cardNumber) ?? [], days)
    if (change && Math.abs(change.delta) >= MIN_MOVE_USD) movers.push({ ...item, change })
  }
  const up = movers.filter((m) => m.change.delta > 0).sort((a, b) => b.change.delta - a.change.delta).slice(0, PER_LIST)
  const down = movers.filter((m) => m.change.delta < 0).sort((a, b) => a.change.delta - b.change.delta).slice(0, PER_LIST)

  return (
    <section className={className} aria-label="Movers">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Movers</h2>
        <div role="group" aria-label="Window" className="flex gap-1">
          {WINDOWS.map((w) => {
            const selected = w.days === days
            return (
              <button
                key={w.days}
                type="button"
                aria-pressed={selected}
                onClick={() => setDays(w.days)}
                className={`tabular h-8 rounded-full px-3 text-[13px] font-medium transition-colors duration-150 ease-out ${
                  selected ? 'bg-ink text-white' : 'text-muted hover:bg-white hover:text-ink'
                }`}
              >
                {w.label}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? null : up.length === 0 && down.length === 0 ? (
        <p className="mt-3 px-1 text-body text-muted">Nothing has moved much {window.noun}.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <MoverList title="Up" movers={up} />
          <MoverList title="Down" movers={down} />
        </div>
      )}
    </section>
  )
}

function MoverList({ title, movers }: { title: string; movers: Mover[] }) {
  if (movers.length === 0) return null
  return (
    <div>
      <h3 className="px-1 text-meta text-muted">{title}</h3>
      <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
        {movers.map(({ card, qty, change }) => (
          <li key={card.cardNumber}>
            <Link
              to={`/cards/${encodeURIComponent(card.cardNumber)}`}
              className="flex min-h-[64px] items-center gap-3 px-3 py-2.5 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
            >
              <div className="w-10 shrink-0">
                <CardArt card={card} className="rounded-md" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium leading-5 text-ink">
                  {card.name}
                  {card.variant && <span className="font-normal text-muted"> · {card.variant}</span>}
                </p>
                <p className="tabular truncate text-meta text-muted">
                  {card.cardNumber}
                  {qty > 1 ? ` · ×${qty}` : qty === 0 ? ' · watching' : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`tabular text-[15px] font-semibold ${change.delta > 0 ? 'text-good' : 'text-bad'}`}>{formatSignedUsd(change.delta)}</p>
                <p className="tabular text-meta text-muted">since {formatDate(change.since.asOf)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
