import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { compareCardNumbers, getCard, getSet, type Card } from '../data/seed'
import { getRosterSet } from '../data/roster'
import { changeSinceDate, usePriceHistories } from '../data/history'
import { PLAYSET, isPlayset } from '../lib/playsets'
import { useCollection, type CostBasis } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { useDecks } from '../store/decks'
import { DECK_SIZE, deckCount } from '../lib/deck'
import { Screen, ScreenTitle } from '../components/Screen'
import { CardCell, CardGrid } from '../components/CardCell'
import { ChevronRight } from '../components/SetTile'
import { EmptyState } from '../components/EmptyState'
import { formatMoney, pluralCards } from '../lib/format'

interface OwnedCard {
  card: Card
  qty: number
  ownedAt: string
  cost?: CostBasis
}

export function CollectionScreen() {
  const { owned, isOwned, ownedQty } = useCollection()
  const watch = useWatchlist()
  const { decks } = useDecks()
  const decksUnderCollection = typeof window !== 'undefined' && window.localStorage.getItem('piecebook.draft.decksUnderCollection') === '1' // DRAFT ONLY

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
  const watching = watchedSets.length > 0 || watchedCards.length > 0
  // Movement since each star, from the same dated seed points as the card page.
  const watchedHistory = usePriceHistories(watchedCards)

  // Playsets view: owned cards held four or more times (leaders are one per deck and stay out of it).
  const [view, setView] = useState<'all' | 'playsets'>('all')
  const playsets = useMemo(() => items.filter((i) => isPlayset(i.card, i.qty)), [items])
  const shown = view === 'playsets' ? playsets : items

  return (
    <Screen>
      <ScreenTitle title="Collection" subline={pluralCards(items.length)} />

      {decksUnderCollection && (
        <section aria-label="Decks" className="mb-8">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Decks</h2>
            <Link to="/decks" className="text-meta font-medium text-ink hover:underline">New deck</Link>
          </div>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {decks.map((d) => {
              const leader = d.leader ? getCard(d.leader) : undefined
              return (
                <li key={d.id}>
                  <Link to={`/decks/${d.id}`} className="flex min-h-[56px] items-center gap-3 px-3 py-2 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper">
                    <span className="tabular w-16 shrink-0 text-body font-semibold text-ink">{leader ? leader.baseNumber.split('-')[0] : '—'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium leading-5 text-ink">{d.name}</span>
                      <span className="tabular block text-meta text-muted">{leader ? leader.name : 'No leader'} · {deckCount(d)} of {DECK_SIZE}</span>
                    </span>
                    <ChevronRight />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {watching && (
        <section aria-label="Watching" className="mb-8">
          <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">Watching</h2>

          {watchedSets.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
              {watchedSets.map((set) => {
                const catalog = getSet(set.setCode)
                return (
                  <li key={set.setCode}>
                    <Link
                      to={`/sets/${encodeURIComponent(set.setCode)}`}
                      className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
                    >
                      <span className="tabular w-16 shrink-0 text-body font-semibold text-ink">{set.setCode}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium leading-5 text-ink">{set.setName}</span>
                        <span className="tabular block text-meta text-muted">
                          {catalog ? `${pluralCards(catalog.cards.length)} in seed` : 'Checklist soon'}
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
            <CardGrid className={watchedSets.length > 0 ? 'mt-4' : 'mt-3'}>
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
