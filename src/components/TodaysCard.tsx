import { Link } from 'react-router-dom'
import { CardArt } from './CardArt'
import { EAST_BLUE_LAST_CHAPTER, todaysCard, TODAYS_CARD_MIN_POOL } from '../lib/fandom'

/**
 * One East Blue–debut base print for the day (7.10). Art, name and number
 * only — no wiki sentence, no attribution — so the Sets tab does not tell
 * a story the reader did not ask for. Hidden while the safe pool is under 100.
 */
export function TodaysCard({
  iso,
  requirePool = true,
  className = '',
}: {
  iso: string
  requirePool?: boolean
  className?: string
}) {
  const pick = todaysCard(iso, { maxDebut: EAST_BLUE_LAST_CHAPTER })
  if (!pick) return null
  if (requirePool && pick.poolSize < TODAYS_CARD_MIN_POOL) return null
  const { card } = pick
  return (
    <Link
      to={`/cards/${encodeURIComponent(card.cardNumber)}`}
      className={`-mx-1 flex min-h-11 items-center gap-3 rounded-lg px-1 py-2 transition-colors duration-150 ease-out hover:bg-white active:bg-white ${className}`}
    >
      <div className="w-[72px] shrink-0">
        <CardArt card={card} eager />
      </div>
      <p className="min-w-0 text-[15px] font-medium leading-5 text-ink">
        {card.name}
        <span className="tabular font-normal text-muted"> · {card.cardNumber}</span>
      </p>
    </Link>
  )
}
