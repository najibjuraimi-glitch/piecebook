import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { ChevronRight } from '../components/SetTile'
import { SearchField } from '../components/SearchField'
import { markStarted } from '../store/started'

/**
 * Start here (8.1 / 11.1): the wordmark, then three doors. Collect and Play keep
 * the pillar words. The third door is World — the house name on the glass, not
 * the pillar word Belong. No accent on any door, nothing lit in the tab bar,
 * nothing remembered but the fact that the visitor has been here.
 */
const DOORS = [
  { pillar: 'Collect', question: 'Find a card or a box, then see what you have and what it is worth today.', to: '/' },
  { pillar: 'Play', question: 'The rules in five sentences, then Bandai’s own. Build a deck from your cards.', to: '/learn' },
  { pillar: 'World', question: 'The story, the people, the fruits, and the game — as far as you have read.', to: '/belong' },
]

const LINK = 'text-ink underline decoration-line underline-offset-2 transition-colors duration-150 ease-out hover:decoration-ink'

export function StartScreen() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const find = (e: FormEvent) => {
    e.preventDefault()
    markStarted()
    const q = query.trim()
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/')
  }

  return (
    <Screen>
      <header className="mb-8 pt-2">
        <h1 className="text-display tracking-[-0.01em] text-ink" aria-label="Piecebook">
          Piecebook
        </h1>
      </header>

      <form role="search" onSubmit={find} className="mb-8">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Find a card or a box"
          className="tablet:max-w-[560px]"
        />
      </form>

      <ul className="grid grid-cols-1 gap-3 tablet:grid-cols-3">
        {DOORS.map((d) => (
          <li key={d.pillar}>
            <Link
              to={d.to}
              onClick={markStarted}
              className="flex h-full min-h-[96px] items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-5 shadow-paper transition-transform duration-150 ease-out active:scale-[0.99]"
            >
              <span className="min-w-0">
                <span className="block text-meta font-medium uppercase tracking-[0.08em] text-muted">{d.pillar}</span>
                <span className="mt-1.5 block text-body text-ink">{d.question}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 self-center text-muted" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 max-w-[60ch] text-body text-ink">
        New to the game?{' '}
        <Link to="/learn" onClick={markStarted} className={LINK}>
          Play has the rules in five sentences.
        </Link>
      </p>
      <p className="mt-3 max-w-[60ch] text-meta text-ink">
        Nothing here is invented: prices from TCGplayer, cards from Limitless, dates from Bandai.{' '}
        <Link to="/about-prices" onClick={markStarted} className={LINK}>
          Read how prices work.
        </Link>
      </p>
      <p className="mt-3 max-w-[60ch] text-meta text-ink">
        Piecebook is unofficial. Not affiliated with Eiichiro Oda, Shueisha, Toei Animation, or Bandai.
      </p>

      <Link to="/" onClick={markStarted} className={`mt-6 inline-flex h-11 items-center text-[15px] font-medium ${LINK}`}>
        Just show me the sets
      </Link>
    </Screen>
  )
}
