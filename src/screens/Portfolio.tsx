import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getCard, type Card } from '../data/seed'
import { useCollection } from '../store/collection'
import { Screen, ScreenTitle } from '../components/Screen'
import { StatBlock } from '../components/StatBlock'
import { EmptyState } from '../components/EmptyState'
import { CardArt } from '../components/CardArt'
import { formatSignedUsd, formatUsd } from '../lib/format'

interface Holding {
  card: Card
  qty: number
  marketValue: number
}

export function PortfolioScreen() {
  const { owned, lots } = useCollection()

  const { holdings, market, cost } = useMemo(() => {
    const holdings: Holding[] = []
    let market = 0
    for (const [cardNumber, entry] of Object.entries(owned)) {
      const card = getCard(cardNumber)
      if (!card) continue
      const marketValue = (card.marketUsd ?? 0) * entry.qty
      market += marketValue
      holdings.push({ card, qty: entry.qty, marketValue })
    }
    const cost = lots.reduce((sum, lot) => sum + lot.paidUsd, 0)
    holdings.sort((a, b) => b.marketValue - a.marketValue)
    return { holdings, market, cost }
  }, [owned, lots])

  const pl = market - cost
  const plTone = pl > 0 ? 'good' : pl < 0 ? 'bad' : 'ink'
  const top = holdings.filter((h) => h.marketValue > 0).slice(0, 5)

  return (
    <Screen>
      <ScreenTitle title="Portfolio" />
      {holdings.length === 0 ? (
        <EmptyState message="Log owned cards with cost to see portfolio." ctaLabel="Browse sets" ctaTo="/" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3 tablet:gap-4">
            <StatBlock label="Market value" value={formatUsd(market)} />
            <StatBlock label="Cost basis" value={formatUsd(cost)} />
            <StatBlock label="Unrealized P/L" value={formatSignedUsd(pl)} tone={plTone} />
          </div>
          <p className="mt-4 px-1 text-meta text-muted">Values use Cards’ seed prices, not live market.</p>

          {top.length > 0 && (
            <section className="mt-8">
              <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">Top owned</h2>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {top.map(({ card, qty, marketValue }) => (
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
                      <p className="tabular shrink-0 text-[15px] font-semibold text-ink">{formatUsd(marketValue)}</p>
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
