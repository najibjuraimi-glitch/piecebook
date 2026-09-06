import React, { useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { cheapestReleasedBox, ROSTER, UPCOMING } from '../data/roster'
import { Screen, ScreenTitle } from '../components/Screen'
import { ChevronRight, SetTile } from '../components/SetTile'
import { StarterDeckRow } from '../components/StarterDeckRow'
import { EmptyState } from '../components/EmptyState'
import { SearchField } from '../components/SearchField'
import { SearchResults } from '../components/SearchResults'
import { FacetChips, useSearchAttributes } from '../components/FacetChips'
import { ViewTabs } from '../components/ViewTabs'
import { Timeline } from '../components/Timeline'
import { resolveCardNumber, searchAll } from '../lib/search'
import { useCollection } from '../store/collection'
import { claimFirstShowing, hasStarted } from '../store/started'

/** The two views of Sets home (7.2): tiles by set, or every booster in English release order. The view lives in the URL only. */
const VIEWS = [
  { id: 'tiles', label: 'Tiles' },
  { id: 'timeline', label: 'Timeline' },
]

/**
 * Every EN set on Cards' roster, oldest EN release first. The roster, not the
 * card CSVs, decides membership. One search field above the tiles searches
 * every set at once (`?q=`); the tiles step aside for as long as there is a
 * query, and results are grouped by set so the tree stays visible. Enter on a
 * full card number opens the card. `?view=timeline` shows the same sets as a
 * release timeline (7.2); search and its chips stay put above either view.
 */
export function SetsScreen() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const query = params.get('q') ?? ''
  const searching = query.trim() !== ''
  const view = params.get('view') === 'timeline' ? 'timeline' : 'tiles'
  const boosters = ROSTER.filter((s) => s.product !== 'starter_deck')
  // Number order, newest number first: release dates scramble the numbering (ST-22 shipped after ST-23).
  const decks = [...ROSTER.filter((s) => s.product === 'starter_deck')].sort((a, b) => b.setCode.localeCompare(a.setCode, 'en', { numeric: true }))
  const cheapestBox = cheapestReleasedBox()
  // Facets (2.3) read every set's attributes; they load on the first search and stay.
  const attrs = useSearchAttributes(searching)
  const { isOwned, owned } = useCollection()
  const results = useMemo(() => searchAll(query, { attrs, isOwned }), [query, attrs, isOwned])
  const loading = searching && !attrs
  useStartHere(Object.keys(owned).length === 0)

  const setQuery = (q: string) => {
    const next = new URLSearchParams(params)
    if (q.trim()) next.set('q', q)
    else next.delete('q')
    setParams(next, { replace: true })
  }

  const setView = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === 'timeline') next.set('view', 'timeline')
    else next.delete('view')
    setParams(next)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const card = resolveCardNumber(query)
    if (card) navigate(`/cards/${encodeURIComponent(card.cardNumber)}`)
  }

  return (
    <Screen>
      <ScreenTitle
        title="Sets"
        subline={view === 'tiles' ? 'EN sets' : undefined}
        aside={<ViewTabs tabs={VIEWS} active={view} onChange={setView} label="Sets view" className="-mr-2" />}
      />
      {!searching && view === 'tiles' && (
        <p className="-mt-3 mb-6 text-meta text-muted">
          {boosters.length - UPCOMING.length} booster sets
          {/* Upcoming sets sit last in the date-ordered grid (7.5); this jumps to the first of them. */}
          {UPCOMING.length > 0 && (
            <>
              , <JumpLink href="#coming-soon">{UPCOMING.length} coming soon</JumpLink>
            </>
          )}
          {decks.length > 0 && (
            <>
              , then <JumpLink href="#starter-decks">{decks.length} starter decks</JumpLink>
            </>
          )}
          {cheapestBox && (
            <>
              , <JumpLink href="#cheapest-box">cheapest box</JumpLink>
            </>
          )}
          .
        </p>
      )}
      {view === 'timeline' && (
        // Whose dates these are qualifies every row, so the caption reads in ink.
        <p className="-mt-3 mb-6 max-w-[60ch] text-meta text-ink">
          English release order. EN dates are Bandai’s; TCGplayer’s US date where Bandai gives only a month.
        </p>
      )}

      <form role="search" onSubmit={onSubmit} className="mb-6">
        <SearchField value={query} onChange={setQuery} placeholder="Search cards, sets, artists" className="tablet:max-w-[560px]" />
        <FacetChips query={query} onChange={setQuery} attrs={attrs} className="mt-2" />
        {loading && <p className="mt-2 px-1 text-meta text-muted">Loading…</p>}
      </form>

      {loading ? null : results ? (
        <SearchResults results={results} />
      ) : searching ? (
        <p className="px-1 pt-10 text-center text-body text-muted">Keep typing to search every set.</p>
      ) : ROSTER.length === 0 ? (
        <EmptyState message="No sets loaded yet." />
      ) : view === 'timeline' ? (
        <div role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline">
          <Timeline />
        </div>
      ) : (
        <div role="tabpanel" id="panel-tiles" aria-labelledby="tab-tiles">
          <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 wide:grid-cols-3">
            {boosters.map((set) => (
              <li
                key={set.setCode}
                id={
                  set.setCode === UPCOMING[0]?.setCode
                    ? 'coming-soon'
                    : cheapestBox && set.setCode === cheapestBox.setCode
                      ? 'cheapest-box'
                      : undefined
                }
                className="scroll-mt-4"
              >
                <SetTile set={set} />
              </li>
            ))}
          </ul>
          {decks.length > 0 && (
            <section id="starter-decks" aria-label="Starter decks" className="mt-10 scroll-mt-4">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Starter decks</h2>
                <span className="tabular text-meta text-muted">{decks.length}</span>
              </div>
              <p className="mt-1 px-1 text-meta text-muted">Ready-made decks Bandai sells, newest number first. Each one is a set of its own here; a row says how many different cards it holds.</p>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {decks.map((set) => (
                  <li key={set.setCode}>
                    <StarterDeckRow set={set} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {/* One quiet door back to Start here (8.1), for whoever skipped it or wants the other two pillars. */}
          <Link
            to="/start"
            className="mt-8 flex h-12 items-center justify-between rounded-2xl border border-line bg-surface px-4 text-[15px] font-medium text-ink transition-colors duration-150 ease-out hover:bg-white"
          >
            Start here
            <ChevronRight />
          </Link>
        </div>
      )}
    </Screen>
  )
}

/**
 * Start here (8.1) shows once: a first visit to `/` itself — not a deep link, not
 * a search, not the timeline — with nothing owned and the flag unset goes to
 * `/start`. The flag is set only by a door or "Just show me the sets"; a
 * session marker stops the redirect repeating within one visit.
 */
function useStartHere(nothingOwned: boolean) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (pathname !== '/' || search !== '' || !nothingOwned || hasStarted()) return
    if (claimFirstShowing()) navigate('/start', { replace: true })
    // Only the landing matters; later changes to the collection on this screen do not send anyone back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** A same-page jump inside a sentence: the words stay on the line, the target is 44px tall around them. */
function JumpLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="-mx-1 -my-3 inline-flex h-11 items-center whitespace-nowrap rounded-lg px-1 text-ink underline decoration-line underline-offset-2 transition-colors duration-150 ease-out hover:bg-white hover:decoration-ink"
    >
      {children}
    </a>
  )
}
