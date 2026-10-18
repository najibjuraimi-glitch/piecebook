import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCard, type Card } from '../data/seed'
import { useHoldingsBook } from '../store/holdingsBook'
import { useWatchlist } from '../store/watchlist'
import { StarButton } from '../components/StarButton'
import { BackBar, Screen } from '../components/Screen'
import { CardArt } from '../components/CardArt'
import { RarityChip } from '../components/RarityChip'
import { ChevronRight } from '../components/SetTile'
import { PriceChart } from '../components/PriceChart'
import { PlayBlock } from '../components/PlayBlock'
import { changeSince, usePriceHistory } from '../data/history'
import { useCardAttributes } from '../data/attributes'
import { printsNamed } from '../lib/search'
import { formatDate, formatSignedUsd, formatUsd, pluralPoints } from '../lib/format'
import { NotFoundScreen } from './NotFound'

export function CardDetailScreen() {
  const { cardNumber } = useParams()
  const card = getCard(cardNumber ? decodeURIComponent(cardNumber) : undefined)
  if (!card) return <NotFoundScreen message="That card isn’t in the seed." />
  return <CardDetail key={card.cardNumber} card={card} />
}

/**
 * Identity, Market (seed), then what the card does (the Play block, from the
 * lazily loaded attributes). A print that matches a holding code says it is
 * in the portfolio. The old Mark owned control is retired.
 */
function CardDetail({ card }: { card: Card }) {
  const { mark } = useHoldingsBook()
  const portfolioKind = mark(card.cardNumber)
  const watch = useWatchlist()
  const history = usePriceHistory(card)
  const change = history.loading ? null : changeSince(history.points, 30)
  const attrs = useCardAttributes(card)
  // Every print of this name across sets (7.4); the door only opens when there is more than this one.
  const prints = useMemo(() => printsNamed(card.name).reduce((n, g) => n + g.cards.length, 0), [card.name])

  return (
    <Screen>
      <BackBar
        fallbackTo={`/sets/${encodeURIComponent(card.setCode)}`}
        crumbs={[
          { label: 'Sets', to: '/' },
          { label: card.setCode, to: `/sets/${encodeURIComponent(card.setCode)}` },
          { label: card.cardNumber },
        ]}
        action={
          <StarButton
            subject="card"
            name={`${card.name} ${card.cardNumber}`}
            active={watch.isWatchingCard(card.cardNumber)}
            onToggle={() => watch.toggleCard(card.cardNumber)}
          />
        }
      />

      {/* Stacked on phone/tablet; from desktop up, art on the left (~40%) and meta + actions on the right. */}
      <div className="desktop:grid desktop:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] desktop:items-start desktop:gap-12">
        <div className="mx-auto w-full max-w-[340px] desktop:sticky desktop:top-6 desktop:mx-0 desktop:max-w-[480px]">
          <CardArt card={card} large eager className="shadow-paper" />
        </div>

        <div className="min-w-0">
          <section className="mt-6 desktop:mt-0">
            <h1 className="text-display text-ink">{card.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
              <span className="tabular">{card.cardNumber}</span>
              <span aria-hidden="true">·</span>
              <RarityChip rarity={card.rarity} size="md" />
              <span aria-hidden="true">·</span>
              <span>{card.language}</span>
              {card.isParallel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{card.variant ?? 'Parallel'}</span>
                </>
              )}
            </div>
            {/* Artist credit where Limitless carries one; the name opens every print they drew (7.3). */}
            {attrs?.artist && (
              <p className="mt-1 text-meta text-muted">
                Illustrated by{' '}
                <Link to={`/artists/${encodeURIComponent(attrs.artist)}`} className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
                  {attrs.artist}
                </Link>
              </p>
            )}
            {/* Door to the character page (7.4): only a name printed more than once has anywhere to go. */}
            {prints > 1 && (
              <Link
                to={`/characters/${encodeURIComponent(card.name)}`}
                className="-ml-1 mt-1 inline-flex min-h-[44px] items-center gap-0.5 rounded-lg px-1 text-[15px] font-medium text-ink transition-colors duration-150 ease-out hover:bg-white active:bg-[#F0ECE4]"
              >
                <span className="tabular">
                  All prints of {card.name} · {prints}
                </span>
                <ChevronRight className="h-4 w-4 text-muted" />
              </Link>
            )}
          </section>

          <section className="mt-6 rounded-2xl border border-line bg-surface px-5 py-4">
            <p className="text-meta font-medium text-muted">Market</p>
            {card.marketUsd === null ? (
              <p className="mt-1 text-title text-muted">No market price</p>
            ) : (
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="tabular text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-ink">
                  {formatUsd(card.marketUsd)}
                </p>
                {card.asOf && <p className="tabular text-meta text-ink">as of {formatDate(card.asOf)}</p>}
              </div>
            )}

            {/* Movement in words with its timeframe; colour only on the figure. Card detail is the one place this belongs. */}
            {change && (
              <p className="tabular mt-1 text-meta text-ink">
                <span className={change.delta > 0 ? 'font-medium text-good' : change.delta < 0 ? 'font-medium text-bad' : 'text-ink'}>
                  {change.delta === 0 ? 'Unchanged' : formatSignedUsd(change.delta)}
                </span>{' '}
                since {formatDate(change.since.asOf)}
              </p>
            )}

            {/* History from dated seed points only. Two or more: a quiet line. One: say so, no chart. */}
            {!history.loading && history.points.length >= 2 && (
              <PriceChart points={history.points} className="mt-4 border-t border-line pt-4" />
            )}
            {!history.loading && history.points.length === 1 && (
              <p className="tabular mt-3 text-meta text-muted">
                Tracked since {formatDate(history.points[0].asOf)} · {pluralPoints(1)} so far
              </p>
            )}
          </section>

          {attrs && <PlayBlock attrs={attrs} className="mt-6" />}
          {/* 6.6: link-first. Limitless's card page lists the latest tournament decks with this card; we point there rather than copy anything. */}
          <Link
            to={`/pregrade/${encodeURIComponent(card.cardNumber)}`}
            className="mt-3 flex min-h-[48px] items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 text-ink transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-medium leading-5">Pre-grade this copy</span>
              <span className="block text-meta text-muted">Photos can rule out a 10. They never confirm one.</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </Link>
          <a
            href={`https://onepiece.limitlesstcg.com/cards/en/${encodeURIComponent(card.baseNumber)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Decks that play this card, on Limitless, opens in a new tab"
            className="mt-3 flex min-h-[48px] items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 text-ink transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-medium leading-5">Decks that play this card</span>
              <span className="block text-meta text-muted">Latest tournament lists on Limitless · opens a new tab</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-muted">↗</span>
          </a>

          {portfolioKind && (
            <p className={`mt-6 text-body ${portfolioKind === 'exact' ? 'text-ink' : 'text-muted'}`}>
              {portfolioKind === 'exact' ? 'In your portfolio.' : 'You own a version.'}{' '}
              <Link to="/portfolio" className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
                Open Portfolio
              </Link>
            </p>
          )}
        </div>
      </div>
    </Screen>
  )
}
