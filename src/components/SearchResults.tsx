import { Link } from 'react-router-dom'
import { seededCardCount, type SearchResults as Results } from '../lib/search'
import { comingLine, displayCode, isUpcoming, type RosterSet } from '../data/roster'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { CardCell, CardGrid } from './CardCell'
import { ChevronRight } from './SetTile'
import { pluralCards } from '../lib/format'

const PER_SET = 10

/** What a set row says on the right: its size once seeded, its date while it is still coming. */
function setMeta(set: RosterSet): string {
  const count = seededCardCount(set.setCode)
  if (count !== null) return pluralCards(count)
  if (isUpcoming(set)) return comingLine(set) ?? 'Coming soon'
  return 'Checklist soon'
}

/**
 * Global search results: the reading in words when facets are on, sets the
 * text names, an exact-number hit, illustrators whose name matches, then names
 * that recur across sets (the character view), then matches grouped by set in
 * release order so the box › cards tree is still visible in a flat result.
 */
export function SearchResults({ results }: { results: Results }) {
  const { isOwned, ownedQty } = useCollection()
  const watch = useWatchlist()

  if (results.total === 0 && !results.exact && results.artists.length === 0 && results.sets.length === 0) {
    return <p className="mx-auto max-w-[36ch] px-1 pt-10 text-center text-body text-muted">{results.emptyText}</p>
  }

  return (
    <div className="space-y-8">
      {results.summary && <p className="tabular -mb-3 px-1 text-body text-ink">{results.summary}</p>}

      {results.sets.length > 0 && (
        <section aria-label="Sets">
          <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">Sets</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {results.sets.map((set) => {
              const code = displayCode(set)
              return (
                <li key={set.setCode}>
                  <Link
                    to={`/sets/${encodeURIComponent(set.setCode)}`}
                    className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
                  >
                    {code && <span className="tabular shrink-0 text-[15px] font-semibold text-ink">{code}</span>}
                    <span className={`min-w-0 flex-1 truncate text-[15px] ${code ? 'text-muted' : 'font-medium text-ink'}`}>{set.setName}</span>
                    <span className="tabular shrink-0 text-meta text-muted">{setMeta(set)}</span>
                    <ChevronRight />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {results.exact && (
        <Link
          to={`/cards/${encodeURIComponent(results.exact.cardNumber)}`}
          className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
        >
          <span className="tabular shrink-0 text-body font-semibold text-ink">{results.exact.cardNumber}</span>
          <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
            {results.exact.name}
            {results.exact.variant && <span className="text-muted"> · {results.exact.variant}</span>}
          </span>
          <span className="shrink-0 text-meta text-muted">Open</span>
          <ChevronRight />
        </Link>
      )}

      {results.artists.length > 0 && (
        <section aria-label="Artists">
          <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">Artists</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {results.artists.slice(0, 6).map((a) => (
              <li key={a.name}>
                <Link
                  to={`/artists/${encodeURIComponent(a.name)}`}
                  className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{a.name}</span>
                  <span className="tabular shrink-0 text-meta text-muted">
                    {a.prints} {a.prints === 1 ? 'print' : 'prints'}
                  </span>
                  <ChevronRight />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.names.length > 0 && (
        <section aria-label="Characters">
          <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">Across sets</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {results.names.slice(0, 6).map((n) => (
              <li key={n.name}>
                <Link
                  to={`/characters/${encodeURIComponent(n.name)}`}
                  className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{n.name}</span>
                  <span className="tabular shrink-0 text-meta text-muted">
                    {n.prints} {n.prints === 1 ? 'print' : 'prints'} · {n.sets} {n.sets === 1 ? 'set' : 'sets'}
                  </span>
                  <ChevronRight />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.bySet.map((group) => (
        <section key={group.setCode} aria-label={group.setCode}>
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="min-w-0 truncate text-meta font-medium uppercase tracking-[0.08em] text-muted">
              <span className="tabular normal-case tracking-normal text-ink">{group.setCode}</span> · {group.setName}
            </h2>
            <span className="tabular shrink-0 text-meta text-muted">{pluralCards(group.cards.length)}</span>
          </div>
          <CardGrid className="mt-3">
            {group.cards.slice(0, PER_SET).map((card) => (
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
          {group.cards.length > PER_SET && (
            <Link
              to={`/sets/${encodeURIComponent(group.setCode)}?q=${encodeURIComponent(results.query)}`}
              className="mt-3 inline-flex min-h-[44px] items-center gap-1 px-1 text-meta font-medium text-ink hover:underline"
            >
              All {group.cards.length} in {group.setCode}
              <ChevronRight className="h-4 w-4 text-ink" />
            </Link>
          )}
        </section>
      ))}
    </div>
  )
}
