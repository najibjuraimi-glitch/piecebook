import { WIKI_LICENCE, WIKI_LICENCE_URL } from '../data/wiki'

/** Licence line under a block that printed wiki words. The wiki page is not a link. */
export function WikiLicence({ className = '' }: { className?: string }) {
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
