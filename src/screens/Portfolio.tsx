import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCard, type Card } from '../data/seed'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { readDisplayCurrency, writeDisplayCurrency, type DisplayCurrency } from '../store/displayCurrency'
import { usePriceHistories } from '../data/history'
import { summarisePortfolio } from '../lib/portfolio'
import { formatMarket, rateLine } from '../lib/fx'
import { Screen, ScreenTitle } from '../components/Screen'
import { StatBlock } from '../components/StatBlock'
import { EmptyState } from '../components/EmptyState'
import { CardArt } from '../components/CardArt'
import { Movers, type MoverCard } from '../components/Movers'
import { ViewTabs } from '../components/ViewTabs'
import { formatSgd, formatSignedUsd, formatUsd, formatUsMarketUsd } from '../lib/format'

const DASH = '—'

const TABS = [
  { id: 'usd', label: 'US $' },
  { id: 'sgd', label: 'S$' },
] as const

/**
 * Three quiet figures over the owned cards, all from Cards' seed prices.
 * Market and Top owned follow the US $ / S$ switch (5.4): S$ is the USD seed
 * at the dated ECB cross. Costs stay in the currency paid. P/L stays in US
 * dollars on both tabs. Movers, cells and the rest of the app stay US $.
 */
export function PortfolioScreen() {
  const { owned } = useCollection()
  const watch = useWatchlist()
  const [display, setDisplay] = useState<DisplayCurrency>(readDisplayCurrency)
  const summary = useMemo(() => summarisePortfolio(owned, getCard), [owned])
  const { holdings, marketUsd, costSgd, costUsd, plUsd, plSkippedUnpriced } = summary

  const onDisplay = (id: string) => {
    const next = id === 'sgd' ? 'sgd' : 'usd'
    setDisplay(next)
    writeDisplayCurrency(next)
  }

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
  const usdCost = (n: number) => (display === 'sgd' ? formatUsMarketUsd(n) : formatUsd(n))
  const costValue: string | string[] =
    costSgd !== null && costUsd !== null
      ? [formatSgd(costSgd), usdCost(costUsd)]
      : costSgd !== null
        ? formatSgd(costSgd)
        : costUsd !== null
          ? usdCost(costUsd)
          : DASH

  const plTone = plUsd === null ? 'ink' : plUsd > 0 ? 'good' : plUsd < 0 ? 'bad' : 'ink'
  const plSubline =
    plUsd === null && costSgd !== null
      ? 'P/L needs USD costs (market prices are in USD).'
      : plUsd !== null
        ? 'US costs against US market only. What you paid in S$ is not in this figure.'
        : !hasCosts
          ? undefined
          : plSkippedUnpriced
            ? 'USD costs against market prices only.'
            : undefined

  const top = holdings.filter((h) => (h.marketUsd ?? 0) > 0).slice(0, 5)

  return (
    <Screen>
      <ScreenTitle
        title="Portfolio"
        aside={<ViewTabs tabs={[...TABS]} active={display} onChange={onDisplay} label="Display currency" className="-mr-2" />}
      />
      {holdings.length === 0 ? (
        <>
          <EmptyState message="No owned cards yet." ctaLabel="Browse sets" ctaTo="/sets" />
          {moverCards.length > 0 && <Movers cards={moverCards} byCard={histories.byCard} loading={histories.loading} className="mt-8" />}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3 tablet:gap-4">
            <StatBlock
              label="Market value"
              value={marketUsd === null ? DASH : formatMarket(marketUsd, display)}
              subline={display === 'sgd' ? rateLine() : 'TCGplayer market, as Limitless publishes it.'}
            />
            <StatBlock
              label="Cost basis"
              value={costValue}
              subline={hasCosts ? 'In the currency you paid. Never converted.' : 'Add what you paid on a card to see cost basis and P/L.'}
            />
            <StatBlock
              label="Unrealized P/L"
              value={plUsd === null ? DASH : formatSignedUsd(plUsd)}
              tone={plTone}
              subline={plSubline}
            />
          </div>
          <p className={`mt-4 max-w-[60ch] px-1 text-meta ${display === 'sgd' ? 'text-ink' : 'text-muted'}`}>
            {display === 'sgd'
              ? 'A reading from the euro table, not a bank quote and not a local ask.'
              : 'Market prices are in US dollars because that is the currency of the source.'}{' '}
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
                      <p className="tabular shrink-0 text-[15px] font-semibold text-ink">
                        {value == null ? DASH : formatMarket(value, display)}
                      </p>
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
