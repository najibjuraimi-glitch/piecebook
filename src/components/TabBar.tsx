import { Link } from 'react-router-dom'
import { isBelongSection, isSetsSection } from './TopBar'

const TABS = [
  { to: '/sets', label: 'Sets', icon: SetsIcon, match: isSetsSection },
  { to: '/collection', label: 'Collection', icon: CollectionIcon, match: (p: string) => p.startsWith('/collection') },
  { to: '/decks', label: 'Decks', icon: DecksIcon, match: (p: string) => p.startsWith('/decks') },
  { to: '/portfolio', label: 'Portfolio', icon: PortfolioIcon, match: (p: string) => p.startsWith('/portfolio') },
  { to: '/belong', label: 'World', icon: BelongIcon, match: isBelongSection },
]

export function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85 tablet:hidden"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-phone items-stretch">
        {TABS.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <li key={to} className="flex-1">
              {/* A plain Link: NavLink would drop aria-current on /sets, /cards and /characters, which all belong to Sets. */}
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`flex h-full min-h-[44px] flex-col items-center justify-center gap-1 transition-colors duration-150 ease-out ${
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon active={active} />
                <span className="text-tab font-medium whitespace-nowrap">{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function SetsIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <rect x="4" y="5" width="11" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" fill={active ? 'currentColor' : 'none'} />
      <path d="M17 6.5l2.5.7a1.5 1.5 0 011 1.9L17.4 19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function CollectionIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" fill={active ? 'currentColor' : 'none'} />
      <path d="M8 12.5l2.5 2.5 5.5-5.5" stroke={active ? '#F7F5F0' : 'currentColor'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PortfolioIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" fill={active ? 'currentColor' : 'none'} />
      <path d="M12 7.5v9M9.75 10.25c0-.9.9-1.5 2.25-1.5s2.25.6 2.25 1.5c0 2.25-4.5 1.25-4.5 3.5 0 .9.9 1.5 2.25 1.5s2.25-.6 2.25-1.5" stroke={active ? '#F7F5F0' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BelongIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <path
        d="M12 6.5c-1.6-1.2-4-1.6-6.2-.7A1.6 1.6 0 004.5 7.3v10c0 .7.7 1.2 1.4.9 2-.8 4.1-.4 5.6.7.3.2.5.2.5.2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
      />
      <path
        d="M12 6.5c1.6-1.2 4-1.6 6.2-.7.8.3 1.3.9 1.3 1.7v10c0 .7-.7 1.2-1.4.9-2-.8-4.1-.4-5.6.7-.3.2-.5.2-.5.2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
      />
      {active && <path d="M12 6.5v12.4" stroke="#F7F5F0" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  )
}

function DecksIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <rect x="7" y="4" width="11" height="15" rx="2" transform="rotate(8 12.5 11.5)" stroke="currentColor" strokeWidth="1.75" fill={active ? 'currentColor' : 'none'} />
      <rect x="4.5" y="6" width="11" height="15" rx="2" transform="rotate(-6 10 13.5)" stroke="currentColor" strokeWidth="1.75" fill={active ? '#F7F5F0' : 'none'} />
    </svg>
  )
}
