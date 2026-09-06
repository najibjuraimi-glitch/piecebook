import { Link } from 'react-router-dom'
import { onThisDay } from '../lib/fandom'

/**
 * Birthdays under the timeline's Today rule (7.9): `9 Mar · Shanks's birthday`,
 * at most three names, each a link to that character. Nothing on a day without one.
 * `hrefFor` lets the draft preview land on its own character mock; the live
 * timeline will pass `/characters/:name`.
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
    <p className={`text-meta text-ink ${className}`}>
      <span className="tabular">{day.dateLabel}</span>
      <span aria-hidden="true"> · </span>
      {day.names.map((n, i) => (
        <span key={n.name}>
          {i > 0 && (i === day.names.length - 1 ? ' and ' : ', ')}
          <Link
            to={hrefFor(n.name)}
            className="underline decoration-line underline-offset-2 hover:decoration-ink"
          >
            {n.label}
          </Link>
        </span>
      ))}
    </p>
  )
}

export function characterHref(name: string): string {
  return `/characters/${encodeURIComponent(name)}`
}
