import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'
import { CardCell, CardGrid } from '../components/CardCell'
import { useAllAttributes } from '../data/attributes'
import { portfolioCountLine } from '../lib/portfolioMarks'
import { useHoldingsBook } from '../store/holdingsBook'
import { useWatchlist } from '../store/watchlist'
import { pluralPrints, printsByArtist } from '../lib/search'
import { NotFoundScreen } from './NotFound'

/**
 * Every print Limitless credits to one illustrator (7.3), grouped by home set
 * newest first, with the portfolio marker and watched marks on each. Reached
 * from `Illustrated by …` on a card and from the Artists group in search; there
 * is no index page, search is the index. Case and spacing variants of a credit
 * ("Eiji kaneda" / "Eiji Kaneda") are one page.
 */
export function ArtistScreen() {
  // useParams already decodes the segment ("Fo%20Ihara%2FINO%20Ltd." → "Fo Ihara/INO Ltd.").
  const { name = '' } = useParams()
  const attrs = useAllAttributes()
  const artist = useMemo(() => (attrs ? printsByArtist(name, attrs) : undefined), [name, attrs])
  const { mark } = useHoldingsBook()
  const watch = useWatchlist()

  if (!name) return <NotFoundScreen message="No illustrator by that name in Limitless’s credits." />

  if (!attrs) {
    return (
      <Screen>
        <BackBar fallbackTo="/" crumbs={[{ label: 'Sets', to: '/' }, { label: name }]} />
        <header className="mb-6">
          <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Illustrator</p>
          <h1 className="mt-1 text-display text-ink">{name}</h1>
          <p className="mt-1 text-body text-muted">Loading…</p>
        </header>
      </Screen>
    )
  }

  if (!artist) return <NotFoundScreen message="No illustrator by that name in Limitless’s credits." />

  const { groups, aliases } = artist
  const prints = groups.reduce((n, g) => n + g.cards.length, 0)
  const portfolioLine = portfolioCountLine(groups.flatMap((g) => g.cards), mark)

  return (
    <Screen>
      <BackBar fallbackTo="/" crumbs={[{ label: 'Sets', to: '/' }, { label: artist.name }]} />

      <header className="mb-6">
        <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Illustrator</p>
        <h1 className="mt-1 text-display text-ink">{artist.name}</h1>
        <p className="tabular mt-1 text-body text-muted">
          {prints} credited {prints === 1 ? 'print' : 'prints'} across {groups.length} {groups.length === 1 ? 'set' : 'sets'}
          {portfolioLine && ` · ${portfolioLine}`}
        </p>
        {aliases.length > 0 && <p className="mt-1 text-meta text-muted">also credited as {aliases.join(', ')}</p>}
        <p className="mt-1 text-meta text-muted">Credits are Limitless’s, written as on the card; prints they have not credited are not listed.</p>
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
                    inPortfolio={mark(card.cardNumber) === 'exact'}
                    ownsVersion={mark(card.cardNumber) === 'version'}
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
