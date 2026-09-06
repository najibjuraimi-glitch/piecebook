import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { ChevronRight } from '../components/SetTile'
import { SearchField } from '../components/SearchField'
import { cheapestReleasedBox, ROSTER, type RosterSet } from '../data/roster'
import { getCard, type Card } from '../data/seed'
import { markStarted } from '../store/started'

/**
 * Start here (lenses v3): visitor language first. The wordmark names One Piece
 * cards; the doors are jobs a new tab can read (find, learn, story) — Collect,
 * Play and World stay muted house names, not the headline. Each door carries
 * art we already serve (TCGplayer box, Limitless card). On the phone the art
 * is a 96px chip so all three jobs sit on the first fold; from tablet it is a
 * 3:2 band like a set tile. No accent.
 */
const FIND_BOX: RosterSet | undefined = cheapestReleasedBox() ?? ROSTER.find((s) => s.setCode === 'OP-01')
const LEARN_BOX: RosterSet | undefined =
  ROSTER.find((s) => s.setCode === 'ST-21') ?? ROSTER.find((s) => s.setCode === 'ST-08')
const STORY_CARD: Card | undefined = getCard('OP01-003')

const DOORS = [
  {
    house: 'Collect',
    title: 'Find a card or a box',
    question: 'Every English set, with dated prices. Then what you have and what it is worth today.',
    to: '/',
    art: { kind: 'box' as const, set: FIND_BOX },
  },
  {
    house: 'Play',
    title: 'Learn to play',
    question: 'The rules in five sentences, then Bandai’s own. Build a deck from your cards.',
    to: '/learn',
    art: { kind: 'box' as const, set: LEARN_BOX },
  },
  {
    house: 'World',
    title: 'Story, people, fruits',
    question: 'The story, the people, the fruits, and the game — as far as you have read.',
    to: '/belong',
    art: { kind: 'card' as const, card: STORY_CARD },
  },
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
      <header className="mb-6 pt-2">
        <h1 className="text-display tracking-[-0.01em] text-ink" aria-label="Piecebook">
          Piecebook
        </h1>
        <p className="mt-2 max-w-[40ch] text-body text-ink">One Piece cards. Prices, the game, and the story.</p>
      </header>

      <form role="search" onSubmit={find} className="mb-6">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Find a card or a box"
          className="tablet:max-w-[560px]"
        />
      </form>

      <ul className="grid grid-cols-1 gap-3 tablet:grid-cols-3">
        {DOORS.map((d) => (
          <li key={d.house}>
            <Link
              to={d.to}
              onClick={markStarted}
              className="flex h-full items-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-paper transition-transform duration-150 ease-out active:scale-[0.99] tablet:flex-col tablet:items-stretch tablet:gap-0 tablet:p-0"
            >
              <DoorArt art={d.art} />
              <span className="flex min-w-0 flex-1 items-start justify-between gap-3 tablet:p-5">
                <span className="min-w-0">
                  <span className="block text-meta font-medium uppercase tracking-[0.08em] text-muted">{d.house}</span>
                  <span className="mt-1 block text-[17px] font-semibold leading-6 text-ink tablet:mt-1.5 tablet:text-title">
                    {d.title}
                  </span>
                  <span className="mt-0.5 block text-meta text-ink tablet:mt-1 tablet:text-body">{d.question}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 self-center text-muted" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 max-w-[60ch] text-body text-ink">
        New to the game?{' '}
        <Link to="/learn" onClick={markStarted} className={LINK}>
          Learn to play in five sentences.
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

type DoorArtProps =
  | { kind: 'box'; set: RosterSet | undefined }
  | { kind: 'card'; card: Card | undefined }

/**
 * Art on a Start door. Phone: 96px chip so all three jobs stay on the first
 * fold. Tablet: 3:2 band, letterboxed on white like a set tile. The story door
 * uses a printed card we already show (not wiki or fruit art).
 */
function DoorArt({ art }: { art: DoorArtProps }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const src = art.kind === 'box' ? art.set?.boxArtUrl : art.card?.imageUrl
  const showArt = Boolean(src) && !failed
  const artShown = showArt && loaded
  const alt =
    art.kind === 'box'
      ? art.set
        ? `${art.set.setName} ${art.set.product === 'starter_deck' ? 'starter deck' : 'booster box'}`
        : ''
      : art.card
        ? `${art.card.name} ${art.card.cardNumber}`
        : ''

  return (
    <div
      className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-xl tablet:aspect-[3/2] tablet:h-auto tablet:w-full tablet:rounded-none ${
        artShown ? 'bg-white' : 'bg-[#EFEBE3]'
      }`}
    >
      {showArt && src && (
        <img
          src={src}
          alt={alt}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full transition-opacity duration-200 ease-out ${
            art.kind === 'card' ? 'object-cover object-top' : 'object-contain p-1.5 tablet:p-3'
          } ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {!artShown && (
        <div className="absolute inset-0 flex items-end p-2 tablet:p-5" aria-hidden="true">
          <p className="text-[13px] font-semibold leading-4 text-ink tablet:text-display">
            {art.kind === 'box' ? (art.set?.setCode ?? 'Box') : (art.card?.cardNumber ?? 'Card')}
          </p>
        </div>
      )}
    </div>
  )
}
