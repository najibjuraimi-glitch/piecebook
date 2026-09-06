import { Link } from 'react-router-dom'
import { onThisDay } from '../lib/fandom'

/**
 * Birthdays under the timeline's Today rule (7.9): the date, then at most
 * three names as 44px rows, each a link to that character. Nothing on a day
 * without one.
 */
export function OnThisDay({
  iso,
  hrefFor = characterHref,
  className = '',
}: {
  iso: string
  hrefFor?: (name: string) => string
  className?: string
}) {
  const day = onThisDay(iso)
  if (!day) return null
  return (
    <div className={className}>
      <p className="tabular text-meta font-medium text-ink">{day.dateLabel}</p>
      <ul className="mt-1">
        {day.names.map((n) => (
          <li key={n.name}>
            <Link
              to={hrefFor(n.name)}
              className="-mx-1 flex min-h-11 items-center rounded-lg px-1 text-[15px] text-ink underline decoration-line underline-offset-2 hover:bg-white hover:decoration-ink"
            >
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function characterHref(name: string): string {
  return `/characters/${encodeURIComponent(name)}`
}
