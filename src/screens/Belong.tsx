import { Link } from 'react-router-dom'
import { Screen, ScreenTitle } from '../components/Screen'
import { ChevronRight } from '../components/SetTile'
import { ReaderCutoff } from '../components/ReaderCutoff'
import { OnThisDay } from '../components/OnThisDay'
import { WikiLicence } from '../components/WikiLicence'
import { useReaderCutoff } from '../store/readerCutoff'
import { STORY_ARCS, WIKI_FRUITS } from '../data/wiki'
import { arcTitle, featuredArc, mediaLine, summaryVisible } from '../lib/belong'
import { onThisDay } from '../lib/fandom'
import { todayIso } from '../lib/format'

const LINK = 'text-ink underline decoration-line underline-offset-2 transition-colors duration-150 ease-out hover:decoration-ink'

const ROOMS = [
  { to: '/belong/story', pillar: 'Story', question: 'Every main arc, its chapters and episodes, and the wiki’s paragraph once you have finished it.' },
  { to: '/belong/people', pillar: 'People', question: 'A second book: every printed Character and Leader, A–Z, into the prints you already have.' },
  { to: '/belong/fruits', pillar: 'Fruits', question: 'A stored log of Devil Fruits on the printed names we have asked: English, Japanese, type, who ate it.' },
  { to: '/?view=timeline', pillar: 'The game', question: 'Sets in English order, who drew each card, what is coming next.' },
]

/**
 * Fandom home (11.1): one Piecebook screen in the wiki’s rooms — story, people,
 * fruits, the game — quiet paper, a reader cutoff, doors into collect and play.
 */
export function BelongScreen() {
  const reader = useReaderCutoff()
  const featured = featuredArc(reader)
  const iso = todayIso()
  const showLicence = Boolean(featured && summaryVisible(featured, reader) && featured.summary)

  return (
    <Screen>
      <ScreenTitle title="World" subline="The story, the people, the fruits, and the game." />

      <ReaderCutoff className="mb-8" explain />

      <ul className="grid grid-cols-1 gap-3 tablet:grid-cols-2 wide:grid-cols-4">
        {ROOMS.map((d) => (
          <li key={d.pillar}>
            <Link
              to={d.to}
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

      {onThisDay(iso) && (
        <section className="mt-10" aria-labelledby="on-this-day">
          <h2 id="on-this-day" className="text-meta font-medium uppercase tracking-[0.08em] text-muted">
            On This Day
          </h2>
          <OnThisDay iso={iso} className="mt-2" />
        </section>
      )}

      <section className="mt-10 max-w-[60ch]" aria-labelledby="featured-story">
        <h2 id="featured-story" className="text-meta font-medium uppercase tracking-[0.08em] text-muted">
          Story
        </h2>
        {featured && summaryVisible(featured, reader) && featured.summary ? (
          <>
            <p className="mt-2 text-title text-ink">{arcTitle(featured.name)}</p>
            <p className="tabular mt-1 text-meta text-ink">{mediaLine(featured)}</p>
            <p className="mt-2 text-body text-ink">{featured.summary}</p>
            <Link to="/belong/story" className={`mt-3 inline-flex h-11 items-center text-[15px] font-medium ${LINK}`}>
              All {STORY_ARCS.length} arcs
            </Link>
          </>
        ) : (
          <p className="mt-2 text-body text-ink">
            {STORY_ARCS.length} main arcs, with chapter and episode numbers. Pick how far you have read to unlock the
            wiki’s paragraph. Chapter pages on the wiki are titles, not plots; official episode synopses are not
            licensed and are not here.
          </p>
        )}
      </section>

      <section className="mt-10 max-w-[60ch]" aria-labelledby="people-fruits">
        <h2 id="people-fruits" className="text-meta font-medium uppercase tracking-[0.08em] text-muted">
          People and fruits
        </h2>
        <p className="mt-2 text-body text-ink">
          The character pages you already have stay the print book. The second book is every printed name, A–Z.{' '}
          {WIKI_FRUITS.length} fruits sit on the names we have asked the wiki; the rest of the roster has not been
          fetched yet.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4">
          <Link to="/belong/people" className={`inline-flex h-11 items-center text-[15px] font-medium ${LINK}`}>
            People
          </Link>
          <Link to="/belong/fruits" className={`inline-flex h-11 items-center text-[15px] font-medium ${LINK}`}>
            Fruits
          </Link>
        </p>
      </section>

      <section id="the-game" className="mt-10 max-w-[60ch] scroll-mt-4" aria-labelledby="the-game-title">
        <h2 id="the-game-title" className="text-meta font-medium uppercase tracking-[0.08em] text-muted">
          The game
        </h2>
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
          {[
            { to: '/', label: 'What you own', note: 'Sets, the collection, what it is worth today' },
            { to: '/?view=timeline', label: 'Sets in order', note: 'English release, On This Day, what is coming' },
            { to: '/decks', label: 'Play', note: 'Build a deck from your cards' },
          ].map((row) => (
            <li key={row.to}>
              <Link to={row.to} className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2.5 text-ink hover:bg-white">
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium leading-5">{row.label}</span>
                  <span className="block text-meta text-muted">{row.note}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 max-w-[60ch] text-body text-ink">
        New to the game?{' '}
        <Link to="/learn" className={LINK}>
          Play has the rules in five sentences.
        </Link>
      </p>
      {showLicence && <WikiLicence className="mt-4" />}
    </Screen>
  )
}
