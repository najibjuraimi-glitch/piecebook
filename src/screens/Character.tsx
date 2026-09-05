import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'
import { CardCell, CardGrid } from '../components/CardCell'
import { StarButton } from '../components/StarButton'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { pluralPrints, printsNamed } from '../lib/search'
import { NotFoundScreen } from './NotFound'

/**
 * Every print that carries one card name, grouped by home set in release
 * order: a character's whole print history in one place, with the collector's
 * owned and watched marks on each. Reached from search and from the card's own
 * page. The star watches the name (7.4): Watching then shows the print that
 * moved most since the star, not a sum.
 */
export function CharacterScreen() {
  // useParams already decodes the segment ("Kid%20%26%20Killer" → "Kid & Killer").
  const { name = '' } = useParams()
  const groups = useMemo(() => printsNamed(name), [name])
  const { isOwned, ownedQty } = useCollection()
  const watch = useWatchlist()

  if (!name || groups.length === 0) return <NotFoundScreen message="No card carries that name." />

  const prints = groups.reduce((n, g) => n + g.cards.length, 0)
  const owned = groups.reduce((n, g) => n + g.cards.filter((c) => isOwned(c.cardNumber)).length, 0)

  return (
    <Screen>
      <BackBar
        fallbackTo="/"
        crumbs={[{ label: 'Sets', to: '/' }, { label: name }]}
        action={<StarButton subject="character" active={watch.isWatchingCharacter(name)} onToggle={() => watch.toggleCharacter(name)} />}
      />

      <header className="mb-6">
        <h1 className="text-display text-ink">{name}</h1>
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
