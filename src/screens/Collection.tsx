import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { compareCardNumbers, getCard, getSet, type Card } from '../data/seed'
import { comingLine, displayCode, getRosterSet, isUpcoming } from '../data/roster'
import { changeSinceDate, usePriceHistories, type PriceChange, type PricePoint } from '../data/history'
import { PLAYSET, isPlayset } from '../lib/playsets'
import { printsNamed } from '../lib/search'
import { useCollection, type CostBasis } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { Screen, ScreenTitle } from '../components/Screen'
import { CardCell, CardGrid } from '../components/CardCell'
import { ChevronRight } from '../components/SetTile'
import { EmptyState } from '../components/EmptyState'
import { formatMoney, formatShortDate, formatSignedUsMarketUsd, pluralCards } from '../lib/format'

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

/**
 * The print of a watched name that moved most since the star (7.4): a watched
 * name is a question about movement, not a sum. Null when no print has a
 * history point from before the star, or nothing has moved.
 */
function biggestMover(prints: Card[], since: string, byCard: Map<string, PricePoint[]>): { card: Card; change: PriceChange } | null {
  let best: { card: Card; change: PriceChange } | null = null
  for (const card of prints) {
    const change = changeSinceDate(byCard.get(card.cardNumber) ?? [], since)
    if (!change || change.delta === 0) continue
    if (!best || Math.abs(change.delta) > Math.abs(best.change.delta)) best = { card, change }
  }
  return best
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
                // A watched upcoming set (7.5) has no code to show yet; its date line stands in for the count.
                const code = displayCode(set)
                return (
                  <li key={set.setCode}>
                    <Link
                      to={`/sets/${encodeURIComponent(set.setCode)}`}
                      className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
                    >
                      {code && <span className="tabular w-16 shrink-0 text-body font-semibold text-ink">{code}</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium leading-5 text-ink">{set.setName}</span>
                        <span className="tabular block text-meta text-muted">
                          {catalog ? `${pluralCards(catalog.cards.length)} in seed` : isUpcoming(set) ? (comingLine(set) ?? 'Checklist soon') : 'Checklist soon'}
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
                const mover = at && !characterHistory.loading ? biggestMover(prints, at, characterHistory.byCard) : null
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
                        <span className="tabular block text-meta text-muted">
                          {characterHistory.loading ? (
                            '\u00a0'
                          ) : mover ? (
                            <>
                              {mover.card.cardNumber}{' '}
                              <span className={mover.change.delta > 0 ? 'font-medium text-good' : 'font-medium text-bad'}>
                                {formatSignedUsMarketUsd(mover.change.delta)}
                              </span>{' '}
                              since {formatShortDate(mover.change.since.asOf)}
                            </>
                          ) : (
                            'no price change yet'
                          )}
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
                const moved = at ? changeSinceDate(watchedHistory.byCard.get(card.cardNumber) ?? [], at) : null
                // A card that has not moved since its star gets no line; the cell stays as it was.
                const change = moved && moved.delta !== 0 ? moved : null
                return (
                  <li key={card.cardNumber}>
                    <CardCell
                      card={card}
                      owned={isOwned(card.cardNumber)}
                      qty={ownedQty(card.cardNumber)}
                      watching
                      change={change ? { delta: change.delta, since: change.since.asOf } : undefined}
                    />
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
