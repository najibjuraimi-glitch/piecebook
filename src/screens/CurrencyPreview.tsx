import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCard } from '../data/seed'
import { summarisePortfolio } from '../lib/portfolio'
import { formatMarket, rateLine } from '../lib/fx'
import { formatSgd, formatSignedUsd, formatUsd } from '../lib/format'
import type { OwnedEntry } from '../store/collection'
import { Screen, ScreenTitle } from '../components/Screen'
import { StatBlock } from '../components/StatBlock'
import { ViewTabs } from '../components/ViewTabs'
import { CardArt } from '../components/CardArt'

const TABS = [
  { id: 'usd', label: 'US $' },
  { id: 'sgd', label: 'S$' },
] as const

/**
 * Demo holdings for the 5.4 mockup only. Live Portfolio is not edited.
 * Mixed costs: SGD stays SGD, USD stays USD, never summed.
 */
const DEMO: Record<string, OwnedEntry> = {
  'OP01-120p1': { qty: 1, ownedAt: '2026-08-01T00:00:00.000Z', cost: { amount: 120, currency: 'SGD', paidOn: '2026-08-01' } },
  'OP09-118': { qty: 1, ownedAt: '2026-08-12T00:00:00.000Z', cost: { amount: 20, currency: 'USD', paidOn: '2026-08-12' } },
  'OP09-001p1': { qty: 1, ownedAt: '2026-08-20T00:00:00.000Z', cost: { amount: 55, currency: 'SGD', paidOn: '2026-08-20' } },
  'OP09-119': { qty: 2, ownedAt: '2026-07-12T00:00:00.000Z' },
  'OP09-004': { qty: 1, ownedAt: '2026-09-01T00:00:00.000Z' },
}

/**
 * 5.4 draft: Portfolio with a US $ / S$ display. S$ is the ECB cross from
 * the same daily table (EUR/SGD ÷ EUR/USD), dated. Costs are never converted.
 */
export function CurrencyPreviewScreen() {
  const [display, setDisplay] = useState<'usd' | 'sgd'>('sgd')
  const summary = useMemo(() => summarisePortfolio(DEMO, getCard), [])
  const { holdings, marketUsd, costSgd, costUsd, plUsd } = summary
  const top = holdings.filter((h) => (h.marketUsd ?? 0) > 0).slice(0, 5)

  const usdCost = (n: number) => (display === 'sgd' ? `US ${formatUsd(n)}` : formatUsd(n))
  const costValue: string | string[] =
    costSgd !== null && costUsd !== null
      ? [formatSgd(costSgd), usdCost(costUsd)]
      : costSgd !== null
        ? formatSgd(costSgd)
        : costUsd !== null
          ? usdCost(costUsd)
          : '—'

  const plTone = plUsd === null ? 'ink' : plUsd > 0 ? 'good' : plUsd < 0 ? 'bad' : 'ink'

  return (
    <Screen>
      <ScreenTitle
        title="Portfolio"
        aside={<ViewTabs tabs={[...TABS]} active={display} onChange={(id) => setDisplay(id as 'usd' | 'sgd')} label="Display currency" className="-mr-2" />}
      />

      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3 tablet:gap-4">
        <StatBlock
          label="Market value"
          value={marketUsd === null ? '—' : formatMarket(marketUsd, display)}
          subline={display === 'sgd' ? rateLine() : 'TCGplayer market, as Limitless publishes it.'}
        />
        <StatBlock label="Cost basis" value={costValue} subline="In the currency you paid. Never converted." />
        <StatBlock
          label="Unrealized P/L"
          value={plUsd === null ? '—' : formatSignedUsd(plUsd)}
          tone={plTone}
          subline="US costs against US market only. What you paid in S$ is not in this figure."
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
                    {value == null ? '—' : formatMarket(value, display)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  )
}
