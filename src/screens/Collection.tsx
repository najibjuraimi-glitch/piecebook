import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { compareCardNumbers, getCard, getSet, rarityLabel, type Card } from '../data/seed'
import { comingLine, displayCode, displayName, getRosterSet, isUpcoming } from '../data/roster'
import { boxPriceHistory } from '../data/boxPrices'
import { usePriceHistories, type PricePoint } from '../data/history'
import { PLAYSET, isPlayset } from '../lib/playsets'
import { printsNamed } from '../lib/search'
import { useCollection, type CostBasis } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { Screen, ScreenTitle } from '../components/Screen'
import { CardCell, CardGrid } from '../components/CardCell'
import { ChevronRight } from '../components/SetTile'
import { EmptyState } from '../components/EmptyState'
import { formatMoney, formatShortDate, formatSignedUsMarketUsd, formatUsMarketUsd, localDayIso, pluralCards } from '../lib/format'

interface OwnedCard {
  card: Card
  qty: number
  ownedAt: string
  cost?: CostBasis
}

interface WatchedCharacter {
  name: string
  /** Every print of the name across sets. */
  prints: Card[]
}

interface Movement {
  /** Latest minus the reading on or just before the star day, in USD. */
  delta: number
  latest: { asOf: string; usd: number }
}

/**
 * Movement of one dated series since the day of a star. Null when the series
 * has no reading at all; delta 0 when nothing has moved (or no reading has
 * landed) since. The reference is the newest reading on or before the star
 * day, else the first reading after it.
 */
function movementSince(points: readonly { asOf: string; usd: number }[], day: string): Movement | null {
  if (points.length === 0) return null
  const latest = points[points.length - 1]
  let since = points[0]
  for (const p of points) {
    if (p.asOf <= day) since = p
    else break
  }
  return { delta: Math.round((latest.usd - since.usd) * 100) / 100, latest }
}

/** Under a dollar either way is noise, and is said so rather than shown as a figure. */
const QUIET_USD = 1

/**
 * A ` · ` separated line whose clauses wrap whole: the dot stays glued to the
 * clause before it and the line may break only after it, never inside a figure
 * or a date.
 */
function Clauses({ text }: { text: string }) {
  const parts = text.split(' · ')
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && '\u00a0· '}
          <span className="whitespace-nowrap">{part}</span>
        </span>
      ))}
    </>
  )
}

/**
 * The print of a watched name that moved most since the star (7.4): a watched
 * name is a question about movement, not a sum. Null only when no print has any
 * price history; a name whose prints all sit still comes back with delta 0.
 */
function biggestMover(prints: Card[], day: string, byCard: Map<string, PricePoint[]>): { card: Card; move: Movement } | null {
  let best: { card: Card; move: Movement } | null = null
  for (const card of prints) {
    const move = movementSince(byCard.get(card.cardNumber) ?? [], day)
    if (!move) continue
    if (!best || Math.abs(move.delta) > Math.abs(best.move.delta)) best = { card, move }
  }
  return best
}

/** The print named the way the character page shows it: its variant label, or the spelled rarity of a base print. */
function printLabel(card: Card): string {
  return card.variant ?? (card.isParallel ? 'Parallel' : rarityLabel(card.rarity))
}

/**
 * Line two of a watched pending set: the box's pre-order market and how it has
 * moved since the star. `Box · pre-order US $399.72 · −US $8.10 since you starred 5 Sep`,
 * or `… · no change yet`; the date line while TCGCSV has no price.
 */
function pendingSetLine(setCode: string, starredAt: string | undefined, fallback: string): string {
  const points = boxPriceHistory(setCode).map((p) => ({ asOf: p.asOf, usd: p.marketUsd }))
  const move = starredAt ? movementSince(points, localDayIso(starredAt)) : null
  if (!move) return fallback
  const price = `Box · pre-order ${formatUsMarketUsd(move.latest.usd)}`
  if (move.delta === 0 || !starredAt) return `${price} · no change yet`
  return `${price} · ${formatSignedUsMarketUsd(move.delta)} since you starred ${formatShortDate(localDayIso(starredAt))}`
}

export function CollectionScreen() {
  const { owned, isOwned, ownedQty } = useCollection()
  const watch = useWatchlist()

  const items = useMemo<OwnedCard[]>(() => {
    const list: OwnedCard[] = []
    for (const [cardNumber, entry] of Object.entries(owned)) {
      const card = getCard(cardNumber)
      if (card) list.push({ card, qty: entry.qty, ownedAt: entry.ownedAt, cost: entry.cost })
    }
    return list.sort((a, b) => {
      if (a.ownedAt !== b.ownedAt) return b.ownedAt.localeCompare(a.ownedAt)
      if (a.card.setCode !== b.card.setCode) return a.card.setCode.localeCompare(b.card.setCode)
      return compareCardNumbers(a.card.cardNumber, b.card.cardNumber)
    })
  }, [owned])

  const watchedSets = useMemo(() => watch.sets.map((code) => getRosterSet(code)).filter((s) => s !== undefined), [watch.sets])
  const watchedCards = useMemo(() => watch.cards.map((n) => getCard(n)).filter((c): c is Card => c !== undefined), [watch.cards])
  const watchedCharacters = useMemo<WatchedCharacter[]>(
    () => watch.characters.map((name) => ({ name, prints: printsNamed(name).flatMap((g) => g.cards) })).filter((c) => c.prints.length > 0),
    [watch.characters],
  )
  const watching = watchedSets.length > 0 || watchedCards.length > 0 || watchedCharacters.length > 0
  // Movement since each star, from the same dated seed points as the card page.
  const watchedHistory = usePriceHistories(watchedCards)
  const characterPrints = useMemo(() => watchedCharacters.flatMap((c) => c.prints), [watchedCharacters])
  const characterHistory = usePriceHistories(characterPrints)

  // Playsets view: owned cards held four or more times (leaders are one per deck and stay out of it).
  const [view, setView] = useState<'all' | 'playsets'>('all')
  const playsets = useMemo(() => items.filter((i) => isPlayset(i.card, i.qty)), [items])
  const shown = view === 'playsets' ? playsets : items

  return (
    <Screen>
      <ScreenTitle title="Collection" subline={pluralCards(items.length)} />

      {watching && (
        <section aria-label="Watching" className="mb-8">
          <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">Watching</h2>

          {watchedSets.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
              {watchedSets.map((set) => {
                const catalog = getSet(set.setCode)
                // The code is shown once it is confirmed; only a code still guessed by sequence stays hidden (7.5).
                const code = displayCode(set)
                const upcoming = isUpcoming(set)
                // A watched upcoming set answers the question its star asked: what the box costs now and how that moved.
                const line = catalog
                  ? pluralCards(catalog.cards.length)
                  : upcoming
                    ? pendingSetLine(set.setCode, watch.setWatchedAt(set.setCode), comingLine(set) ?? 'Checklist soon')
                    : 'Checklist soon'
                return (
                  <li key={set.setCode}>
                    <Link
                      to={`/sets/${encodeURIComponent(set.setCode)}`}
                      className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
                    >
                      {code && <span className="tabular w-16 shrink-0 text-body font-semibold text-ink">{code}</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium leading-5 text-ink">{displayName(set)}</span>
                        <span className={`tabular block text-meta ${upcoming ? 'text-ink' : 'text-muted'}`}>
                          <Clauses text={line} />
                        </span>
                      </span>
                      <ChevronRight />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          {watchedCharacters.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
              {watchedCharacters.map(({ name, prints }) => {
                const at = watch.characterWatchedAt(name)
                const day = at ? localDayIso(at) : null
                const mover = day && !characterHistory.loading ? biggestMover(prints, day, characterHistory.byCard) : null
                // Line two names the print that moved most, the way the character page names it, then its price and the move.
                // Ink throughout: the row is a reading, not a verdict.
                const line = characterHistory.loading
                  ? '\u00a0'
                  : !mover || !day
                    ? 'no price history yet'
                    : Math.abs(mover.move.delta) < QUIET_USD
                      ? `quiet since you starred ${formatShortDate(day)}`
                      : `${printLabel(mover.card)} · ${mover.card.setCode} · ${formatUsMarketUsd(mover.move.latest.usd)} · ${formatSignedUsMarketUsd(mover.move.delta)} since you starred ${formatShortDate(day)}`
                return (
                  <li key={name}>
                    <Link
                      to={`/characters/${encodeURIComponent(name)}`}
                      className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="tabular block truncate text-[15px] font-medium leading-5 text-ink">
                          {name} · {prints.length} {prints.length === 1 ? 'print' : 'prints'}
                        </span>
                        <span className="tabular block text-meta text-ink">
                          <Clauses text={line} />
                        </span>
                      </span>
                      <ChevronRight />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          {watchedCards.length > 0 && (
            <CardGrid className={watchedSets.length > 0 || watchedCharacters.length > 0 ? 'mt-4' : 'mt-3'}>
              {watchedCards.map((card) => {
                const at = watch.watchedAt(card.cardNumber)
                const day = at ? localDayIso(at) : null
                const moved = day && !watchedHistory.loading ? movementSince(watchedHistory.byCard.get(card.cardNumber) ?? [], day) : null
                // A card that has not moved since its star gets no line; the cell stays as it was.
                const change = moved && moved.delta !== 0 && day ? { delta: moved.delta, since: day } : undefined
                return (
                  <li key={card.cardNumber}>
                    <CardCell card={card} owned={isOwned(card.cardNumber)} qty={ownedQty(card.cardNumber)} watching change={change} />
                  </li>
                )
              })}
            </CardGrid>
          )}
        </section>
      )}

      {items.length === 0 ? (
        watching ? (
          <p className="px-1 pt-2 text-body text-muted">No owned cards yet.</p>
        ) : (
          <EmptyState message="No owned cards yet." ctaLabel="Browse sets" ctaTo="/" />
        )
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Owned</h2>
            <div role="group" aria-label="View" className="flex gap-1">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'playsets', label: 'Playsets' },
                ] as const
              ).map((v) => {
                const selected = view === v.key
                return (
                  <button
                    key={v.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setView(v.key)}
                    className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors duration-150 ease-out ${
                      selected ? 'bg-ink text-white' : 'text-muted hover:bg-white hover:text-ink'
                    }`}
                  >
                    {v.label}
                  </button>
                )
              })}
            </div>
          </div>
          {view === 'playsets' && (
            <p className="tabular mb-3 px-1 text-meta text-muted">
              {playsets.length === 0
                ? `No playsets yet. ${PLAYSET} copies of a card make one.`
                : `${playsets.length} ${playsets.length === 1 ? 'playset' : 'playsets'} · ${PLAYSET} or more copies`}
            </p>
          )}
          {shown.length > 0 && (
            <CardGrid>
              {shown.map(({ card, qty, cost }) => (
                <li key={card.cardNumber}>
                  {/* Paid line only when a cost exists; cells without one stay as they are. No nag. */}
                  <CardCell
                    card={card}
                    owned
                    qty={qty}
                    paid={cost ? formatMoney(cost.amount, cost.currency) : undefined}
                    watching={watch.isWatchingCard(card.cardNumber)}
                  />
                </li>
              ))}
            </CardGrid>
          )}
        </>
      )}
    </Screen>
  )
}
