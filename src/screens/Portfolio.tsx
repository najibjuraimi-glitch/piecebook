import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getCard, type Card } from '../data/seed'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { usePriceHistories } from '../data/history'
import { summarisePortfolio } from '../lib/portfolio'
import { Screen, ScreenTitle } from '../components/Screen'
import { StatBlock } from '../components/StatBlock'
import { EmptyState } from '../components/EmptyState'
import { CardArt } from '../components/CardArt'
import { Movers, type MoverCard } from '../components/Movers'
import { formatSgd, formatSignedUsd, formatUsd } from '../lib/format'

const DASH = '—'

/**
 * Three quiet figures over the owned cards, all from Cards' seed prices.
 * Market is always USD. Costs are shown per currency and never converted.
 * P/L only exists where a USD cost can be set against the USD seed market.
 * No charts, no tickers, no marketplace links.
 */
export function PortfolioScreen() {
  const { owned } = useCollection()
  const watch = useWatchlist()
  const summary = useMemo(() => summarisePortfolio(owned, getCard), [owned])
  const { holdings, marketUsd, costSgd, costUsd, plUsd, plSkippedUnpriced } = summary

  // Movers run over everything the collector owns or watches, each card once.
  const watched = useMemo(() => watch.cards.map((n) => getCard(n)).filter((c): c is Card => c !== undefined), [watch.cards])
  const moverCards = useMemo<MoverCard[]>(() => {
    const list: MoverCard[] = holdings.map((h) => ({ card: h.card, qty: h.qty }))
    const seen = new Set(list.map((m) => m.card.cardNumber))
    for (const card of watched) if (!seen.has(card.cardNumber)) list.push({ card, qty: 0 })
    return list
  }, [holdings, watched])
  const histories = usePriceHistories(useMemo(() => moverCards.map((m) => m.card), [moverCards]))

  const hasCosts = costSgd !== null || costUsd !== null
  const costValue: string | string[] =
    costSgd !== null && costUsd !== null
      ? [formatSgd(costSgd), formatUsd(costUsd)]
      : costSgd !== null
        ? formatSgd(costSgd)
        : costUsd !== null
          ? formatUsd(costUsd)
          : DASH

  const plTone = plUsd === null ? 'ink' : plUsd > 0 ? 'good' : plUsd < 0 ? 'bad' : 'ink'
  const plSubline =
    plUsd === null && costSgd !== null
      ? 'P/L needs USD costs (market prices are in USD).'
      : plUsd !== null && (costSgd !== null || plSkippedUnpriced)
        ? 'USD costs against market prices only.'
        : undefined

  const top = holdings.filter((h) => (h.marketUsd ?? 0) > 0).slice(0, 5)

  return (
    <Screen>
      <ScreenTitle title="Portfolio" />
      {holdings.length === 0 ? (
        <>
          <EmptyState message="No owned cards yet." ctaLabel="Browse sets" ctaTo="/" />
          {moverCards.length > 0 && <Movers cards={moverCards} byCard={histories.byCard} loading={histories.loading} className="mt-8" />}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3 tablet:gap-4">
            <StatBlock label="Market value" value={marketUsd === null ? DASH : formatUsd(marketUsd)} />
            <StatBlock
              label="Cost basis"
              value={costValue}
              subline={hasCosts ? undefined : 'Add what you paid on a card to see cost basis and P/L.'}
            />
            <StatBlock
              label="Unrealized P/L"
              value={plUsd === null ? DASH : formatSignedUsd(plUsd)}
              tone={plTone}
              subline={plSubline}
            />
          </div>
          <p className="mt-4 px-1 text-meta text-muted">
            Values use Cards’ seed prices, not live market.{' '}
            <Link to="/about-prices" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
              How prices work
            </Link>
          </p>

          <Movers cards={moverCards} byCard={histories.byCard} loading={histories.loading} className="mt-8" />

          {top.length > 0 && (
            <section className="mt-8">
              <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">Top owned</h2>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {top.map(({ card, qty, marketUsd: value }) => (
                  <li key={card.cardNumber}>
                    <Link
                      to={`/cards/${encodeURIComponent(card.cardNumber)}`}
                      className="flex min-h-[64px] items-center gap-3 px-3 py-2.5 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
                    >
                      <div className="w-10 shrink-0">
                        <CardArt card={card} className="rounded-md" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium leading-5 text-ink">{card.name}</p>
                        <p className="tabular truncate text-meta text-muted">
                          {card.cardNumber}
                          {qty > 1 ? ` · ×${qty}` : ''}
                        </p>
                      </div>
                      <p className="tabular shrink-0 text-[15px] font-semibold text-ink">{formatUsd(value ?? 0)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Screen>
  )
}
