import { WIKI_LICENCE, WIKI_LICENCE_URL, type WikiEntry } from '../data/wiki'

/**
 * The one attribution line that must sit under every wiki sentence or birthday:
 * title (revid permalink) and the CC BY-SA 3.0 licence. Never omitted.
 */
export function WikiAttribution({ entry, className = '' }: { entry: WikiEntry; className?: string }) {
  if (!entry.url) return null
  return (
    <p className={`text-meta text-muted ${className}`}>
      Text adapted from{' '}
      <a
        href={entry.url}
        className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
        rel="noopener noreferrer"
      >
        '{entry.title}'
      </a>
      , One Piece Wiki,{' '}
      <a
        href={WIKI_LICENCE_URL}
        className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
        rel="noopener noreferrer"
      >
        {WIKI_LICENCE}
      </a>
      .
    </p>
  )
}
