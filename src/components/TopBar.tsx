import { Link, NavLink } from 'react-router-dom'
import { CONTENT_COLUMN, Wordmark } from './Screen'

const LINKS = [
  { to: '/', label: 'Sets', match: (p: string) => p === '/' || p.startsWith('/sets') || p.startsWith('/cards') || p.startsWith('/characters') },
  { to: '/collection', label: 'Collection', match: (p: string) => p.startsWith('/collection') },
  { to: '/portfolio', label: 'Portfolio', match: (p: string) => p.startsWith('/portfolio') },
]

/**
 * Tablet/desktop chrome: wordmark left, three text links right. Nothing else —
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
                  <NavLink
                    to={to}
                    end={to === '/'}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex h-9 items-center rounded-full px-3 text-[15px] font-medium transition-colors duration-150 ease-out ${
                      active ? 'text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </header>
  )
}
