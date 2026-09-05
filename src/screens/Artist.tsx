import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'
import { CardCell, CardGrid } from '../components/CardCell'
import { useAllAttributes } from '../data/attributes'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { printsByArtist } from '../lib/search'
import { pluralCards } from '../lib/format'
import { NotFoundScreen } from './NotFound'

/**
 * Every print Limitless credits to one illustrator (7.3), grouped by home set
 * in release order, with the collector's owned and watched marks on each.
 * Reached from `Illustrated by …` on a card and from the Artists group in
 * search; there is no index page, search is the index.
 */
export function ArtistScreen() {
  // useParams already decodes the segment ("Fo%20Ihara%2FINO%20Ltd." → "Fo Ihara/INO Ltd.").
  const { name = '' } = useParams()
  const attrs = useAllAttributes()
  const artist = useMemo(() => (attrs ? printsByArtist(name, attrs) : undefined), [name, attrs])
  const { isOwned, ownedQty } = useCollection()
  const watch = useWatchlist()

  if (!name) return <NotFoundScreen message="No illustrator by that name in Limitless’s credits." />

  if (!attrs) {
    return (
      <Screen>
        <BackBar fallbackTo="/" crumbs={[{ label: 'Sets', to: '/' }, { label: name }]} />
        <header className="mb-6">
          <h1 className="text-display text-ink">{name}</h1>
          <p className="mt-1 text-body text-muted">Loading…</p>
        </header>
      </Screen>
    )
  }

  if (!artist) return <NotFoundScreen message="No illustrator by that name in Limitless’s credits." />

  const { groups } = artist
  const prints = groups.reduce((n, g) => n + g.cards.length, 0)
  const owned = groups.reduce((n, g) => n + g.cards.filter((c) => isOwned(c.cardNumber)).length, 0)

  return (
    <Screen>
      <BackBar fallbackTo="/" crumbs={[{ label: 'Sets', to: '/' }, { label: artist.name }]} />

      <header className="mb-6">
        <h1 className="text-display text-ink">{artist.name}</h1>
        <p className="tabular mt-1 text-body text-muted">
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
              <span className="tabular shrink-0 text-meta text-muted">{pluralCards(group.cards.length)}</span>
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

      <p className="mt-10 px-1 text-meta text-muted">Credits are Limitless’s; prints they have not credited are not listed.</p>
    </Screen>
  )
}
