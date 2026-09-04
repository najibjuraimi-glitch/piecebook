import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Sets', icon: SetsIcon, match: (p: string) => p === '/' || p.startsWith('/sets') || p.startsWith('/cards') },
  { to: '/collection', label: 'Collection', icon: CollectionIcon, match: (p: string) => p.startsWith('/collection') },
  { to: '/portfolio', label: 'Portfolio', icon: PortfolioIcon, match: (p: string) => p.startsWith('/portfolio') },
]

export function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-phone items-stretch">
        {TABS.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                aria-current={active ? 'page' : undefined}
                className={`flex h-full min-h-[44px] flex-col items-center justify-center gap-1 transition-colors duration-150 ease-out ${
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon active={active} />
                <span className="text-tab font-medium">{label}</span>
              </NavLink>
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
