import { Link } from 'react-router-dom'
import { CardArt } from './CardArt'
import { WikiAttribution } from './WikiAttribution'
import { todaysCard, TODAYS_CARD_MIN_POOL } from '../lib/fandom'

/**
 * One base print for the day (7.10), under the timeline's Today rule: Bandai's
 * render, the gated line, the attribution, the whole row a link to the card.
 * Renders nothing when the pool is empty. The live timeline will also hide
 * this when the pool is under 100; the draft preview can force a showing.
 */
export function TodaysCard({
  iso,
  requirePool = true,
  className = '',
}: {
  iso: string
  /** When true (the ship rule), hide until the pool reaches 100. */
  requirePool?: boolean
  className?: string
}) {
  const pick = todaysCard(iso)
  if (!pick) return null
  if (requirePool && pick.poolSize < TODAYS_CARD_MIN_POOL) return null
  const { card, wiki } = pick
  return (
    <div className={className}>
      <Link
        to={`/cards/${encodeURIComponent(card.cardNumber)}`}
        className="-mx-1 flex gap-3 rounded-lg px-1 py-2 transition-colors duration-150 ease-out hover:bg-white active:bg-white"
      >
        <div className="w-[72px] shrink-0">
          <CardArt card={card} eager />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-5 text-ink">
            {card.name}
            <span className="tabular font-normal text-muted"> · {card.cardNumber}</span>
          </p>
          {wiki.line && <p className="mt-1 text-body text-ink">{wiki.line}.</p>}
        </div>
      </Link>
      <WikiAttribution entry={wiki} className="mt-0.5 px-1" />
    </div>
  )
}
