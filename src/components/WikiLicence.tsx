import { WIKI_LICENCE, WIKI_LICENCE_URL } from '../data/wiki'

/**
 * Licence line under a block that printed wiki words. Names the work and
 * revid when we have them. The wiki article is not a link; the licence is.
 */
export function WikiLicence({
  className = '',
  work,
  revid,
}: {
  className?: string
  work?: string
  revid?: number | null
}) {
  const workBit = work ? ` · ${work}` : ''
  const revBit = revid != null ? ` · revid ${revid}` : ''
  return (
    <p className={`text-meta text-ink ${className}`}>
      From One Piece Wiki{workBit}
      {revBit},{' '}
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
