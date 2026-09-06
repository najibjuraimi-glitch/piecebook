import { Link } from 'react-router-dom'
import { CONTENT_COLUMN, Wordmark } from './Screen'

/** Sets is home for the whole box › cards tree, including the search cross-cuts into it (card, character and artist views). */
export const isSetsSection = (p: string) =>
  p === '/' || p.startsWith('/sets') || p.startsWith('/cards') || p.startsWith('/characters') || p.startsWith('/artists')

export const isBelongSection = (p: string) => p === '/belong' || p.startsWith('/belong/')

const LINKS = [
  { to: '/', label: 'Sets', match: isSetsSection },
  { to: '/collection', label: 'Collection', match: (p: string) => p.startsWith('/collection') },
  { to: '/decks', label: 'Decks', match: (p: string) => p.startsWith('/decks') },
  { to: '/portfolio', label: 'Portfolio', match: (p: string) => p.startsWith('/portfolio') },
  { to: '/belong', label: 'Belong', match: isBelongSection },
]

/**
 * Tablet/desktop chrome: wordmark left, five text links right. Nothing else —
 * no search, cart, charts or bell. Hidden on phone, where the TabBar takes over.
 */
export function TopBar({ pathname }: { pathname: string }) {
  return (
    <header className="hidden border-b border-line bg-paper tablet:block">
      <div className={`${CONTENT_COLUMN} flex h-14 items-center justify-between`}>
        <Link to="/" className="rounded-md" aria-label="Piecebook, Sets">
          <Wordmark />
        </Link>
        <nav aria-label="Primary">
          <ul className="flex items-center gap-1">
            {LINKS.map(({ to, label, match }) => {
              const active = match(pathname)
              return (
                <li key={to}>
                  <Link
                    to={to}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex h-9 items-center rounded-full px-3 text-[15px] font-medium transition-colors duration-150 ease-out ${
                      active ? 'text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </header>
  )
}
