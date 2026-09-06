import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BackBar, Screen, ScreenTitle } from '../components/Screen'
import { CardCell, CardGrid } from '../components/CardCell'
import { StarButton } from '../components/StarButton'
import { WhoIs } from '../components/WhoIs'
import { OnThisDay } from '../components/OnThisDay'
import { TodaysCard } from '../components/TodaysCard'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { pluralPrints, printsNamed } from '../lib/search'
import { countdownPhrase, parsePinDate, todaysCardPool, TODAYS_CARD_MIN_POOL } from '../lib/fandom'
import { formatDate, todayIso } from '../lib/format'
import { displayCode, displayName, getRosterSet, type RosterSet } from '../data/roster'
import { getSetIntro } from '../data/intros'
import { NotFoundScreen } from './NotFound'

const PREVIEW_CHARACTERS = ['Dracule Mihawk', 'Monkey.D.Luffy', 'Shanks', 'Imu', 'Jewelry Bonney'] as const

function previewCharacterHref(name: string): string {
  return `/fandom-preview/character/${encodeURIComponent(name)}`
}

function pinnedDay(search: URLSearchParams): string {
  return parsePinDate(search.get('date')) ?? todayIso()
}

/**
 * Draft-only index and the two surfaces the fandom track adds: a character
 * page with WhoIs, and a timeline Today rule with On This Day, Today's card
 * and a countdown on upcoming rows. Wired only here so 7b's files stay untouched.
 */
export function FandomPreviewScreen() {
  const [params] = useSearchParams()
  const date = pinnedDay(params)
  const pool = todaysCardPool().length
  return (
    <Screen>
      <BackBar fallbackTo="/" crumbs={[{ label: 'Sets', to: '/' }, { label: 'Fandom draft' }]} />
      <ScreenTitle title="Fandom, distilled" subline="Draft surfaces. Not wired into the live screens yet." />

      <p className="max-w-[60ch] text-body text-ink">
        Four things from the wiki, automated: a gated sentence, a birthday, a card for the day, a countdown.
        Pin a day with <span className="tabular">?date=</span> so a review can hold still.
      </p>
      <p className="tabular mt-2 text-meta text-muted">
        Showing {date}. Base-print pool with a passing line: {pool}
        {pool < TODAYS_CARD_MIN_POOL
          ? ` (under ${TODAYS_CARD_MIN_POOL}; Today's card is shown here anyway so the draft can be judged)`
          : `.`}
      </p>

      <nav className="mt-6 flex flex-wrap gap-x-3 gap-y-2 text-body">
        <Link className="text-ink underline decoration-line underline-offset-2" to={`/fandom-preview/timeline?date=${date}`}>
          Timeline Today ›
        </Link>
        <Link className="text-ink underline decoration-line underline-offset-2" to="/fandom-preview/timeline?date=2026-03-09">
          9 Mar (birthdays)
        </Link>
        <Link className="text-ink underline decoration-line underline-offset-2" to="/fandom-preview/timeline?date=2026-10-29">
          Tomorrow (EB-05)
        </Link>
        <Link className="text-ink underline decoration-line underline-offset-2" to="/fandom-preview/timeline?date=2026-10-30">
          Today (EB-05)
        </Link>
      </nav>

      <h2 className="mt-8 text-meta font-medium uppercase tracking-[0.08em] text-muted">Character pages</h2>
      <ul className="mt-2 divide-y divide-line">
        {PREVIEW_CHARACTERS.map((name) => (
          <li key={name}>
            <Link
              to={previewCharacterHref(name)}
              className="-mx-1 block min-h-[44px] rounded-lg px-1 py-3 text-[15px] font-medium text-ink hover:bg-white"
            >
              {name} ›
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  )
}

/** Character page as it would look with WhoIs under the name. Same prints grid; WhoIs is the only new block. */
export function FandomCharacterPreview() {
  const { name = '' } = useParams()
  const groups = printsNamed(name)
  const { isOwned, ownedQty } = useCollection()
  const watch = useWatchlist()

  if (!name || groups.length === 0) return <NotFoundScreen message="No card carries that name." />

  const prints = groups.reduce((n, g) => n + g.cards.length, 0)
  const owned = groups.reduce((n, g) => n + g.cards.filter((c) => isOwned(c.cardNumber)).length, 0)

  return (
    <Screen>
      <BackBar
        fallbackTo="/fandom-preview"
        crumbs={[{ label: 'Sets', to: '/' }, { label: name }]}
        action={
          <StarButton
            subject="character"
            name={name}
            active={watch.isWatchingCharacter(name)}
            onToggle={() => watch.toggleCharacter(name)}
          />
        }
      />

      <header className="mb-6">
        <h1 className="text-display text-ink">{name}</h1>
        <WhoIs name={name} className="mt-2" />
        <p className="tabular mt-2 text-body text-muted">
          {prints} {prints === 1 ? 'print' : 'prints'} across {groups.length} {groups.length === 1 ? 'set' : 'sets'}
          {owned > 0 && ` · you own ${owned}`}
        </p>
      </header>

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.setCode} aria-label={group.setCode}>
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="min-w-0 truncate text-meta font-medium uppercase tracking-[0.08em] text-muted">
                <span className="tabular normal-case tracking-normal text-ink">{group.setCode}</span> · {group.setName}
              </h2>
              <span className="tabular shrink-0 text-meta text-muted">{pluralPrints(group.cards.length)}</span>
            </div>
            <CardGrid className="mt-3">
              {group.cards.map((card) => (
                <li key={card.cardNumber}>
                  <CardCell
                    card={card}
                    owned={isOwned(card.cardNumber)}
                    qty={ownedQty(card.cardNumber)}
                    watching={watch.isWatchingCard(card.cardNumber)}
                  />
                </li>
              ))}
            </CardGrid>
          </section>
        ))}
      </div>
    </Screen>
  )
}

const TIMELINE_CODES = ['OP-16', 'OP-17', 'EB-05', 'OP-18'] as const

/** A slim 7.2-shaped list so the Today rule can be judged without editing Timeline.tsx. */
export function FandomTimelinePreview() {
  const [params] = useSearchParams()
  const date = pinnedDay(params)
  const rows = TIMELINE_CODES.map((code) => getRosterSet(code)).filter((s): s is RosterSet => Boolean(s))

  return (
    <Screen>
      <BackBar fallbackTo="/fandom-preview" crumbs={[{ label: 'Sets', to: '/' }, { label: 'Timeline draft' }]} />
      <div className="mb-6 flex items-end justify-between gap-4">
        <h1 className="text-display text-ink">Sets</h1>
        <p className="text-[15px] font-medium text-ink">
          <span className="text-muted">Tiles</span>
          <span className="mx-3 text-muted" aria-hidden="true">
            Timeline
          </span>
        </p>
      </div>
      <p className="mb-4 text-body text-ink">
        English release order. EN dates are Bandai's; TCGplayer's US date where Bandai gives only a month.
      </p>

      <div className="tablet:max-w-[640px]">
        <h2 className="tabular flex items-center gap-3 pb-1 pt-2 text-meta font-semibold text-ink">
          2026
          <span aria-hidden="true" className="h-px flex-1 bg-line" />
        </h2>

        <ol className="divide-y divide-line">
          {rows
            .filter((s) => s.cardSeedStatus === 'ready')
            .map((set) => (
              <li key={set.setCode}>
                <PreviewRow set={set} today={date} />
              </li>
            ))}
        </ol>

        <div id="today" className="py-3">
          <div role="separator" aria-label="Today" className="flex items-center gap-3 text-meta font-semibold text-ink">
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
            Today
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </div>
          <OnThisDay iso={date} hrefFor={previewCharacterHref} className="mt-3" />
          <TodaysCard iso={date} requirePool={false} className="mt-2" />
        </div>

        <ol className="divide-y divide-line">
          {rows
            .filter((s) => s.cardSeedStatus === 'pending')
            .map((set) => (
              <li key={set.setCode} id={set.setCode === 'EB-05' ? 'coming-soon' : undefined}>
                <PreviewRow set={set} today={date} />
              </li>
            ))}
        </ol>
      </div>
    </Screen>
  )
}

function PreviewRow({ set, today }: { set: RosterSet; today: string }) {
  const intro = getSetIntro(set.setCode, set.language)
  const code = displayCode(set)
  const name = displayName(set)
  const en = intro?.enReleased ?? set.enReleased
  const jp = intro?.jpReleased ?? null
  const usDate = !intro?.enReleased && set.codeSource !== 'limitless'
  const count = countdownPhrase(en, today)
  const clauses: string[] = []
  if (jp) clauses.push(`JP ${formatDate(jp)}`)
  if (en) clauses.push(usDate ? `EN ${formatDate(en)} · US date` : `EN ${formatDate(en)}`)
  if (count && set.cardSeedStatus === 'pending') clauses.push(count)

  return (
    <Link
      to={`/sets/${encodeURIComponent(set.setCode)}`}
      className="-mx-1 block min-h-[44px] rounded-lg px-1 py-3 transition-colors duration-150 ease-out hover:bg-white active:bg-white"
    >
      <p className="text-[15px] font-medium leading-5 text-ink">
        {code && <span className="tabular">{code} · </span>}
        {name}
      </p>
      {clauses.length > 0 && (
        <p className="tabular mt-0.5 text-meta text-ink">{clauses.join(' · ')}</p>
      )}
      {intro?.jpName && (
        <p lang="ja" className="mt-0.5 text-meta text-muted">
          {intro.jpName}
        </p>
      )}
    </Link>
  )
}
