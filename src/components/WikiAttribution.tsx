import { WIKI_LICENCE, WIKI_LICENCE_URL, type WikiEntry } from '../data/wiki'
import { visibleLine } from '../lib/fandom'
import { useReaderCutoff } from '../store/readerCutoff'

/**
 * Licence line under a printed wiki sentence only — never under a birthday.
 * The wiki page is not a link (that door is the full article). The licence is.
 */
export function WikiAttribution({ entry, className = '' }: { entry: WikiEntry; className?: string }) {
  const reader = useReaderCutoff()
  if (!visibleLine(entry, { chapter: reader.chapter, finished: reader.finished })) return null
  return (
    <p className={`text-meta text-ink ${className}`}>
      From One Piece Wiki,{' '}
      <a
        href={WIKI_LICENCE_URL}
        className="underline decoration-line underline-offset-2 hover:decoration-ink"
        rel="noopener noreferrer"
      >
        {WIKI_LICENCE}
      </a>
      .
    </p>
  )
}
