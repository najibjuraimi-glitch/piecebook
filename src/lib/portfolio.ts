import type { Card } from '../data/seed'
import type { CostBasis, OwnedEntry } from '../store/collection'

export interface Holding {
  card: Card
  qty: number
  /** Seed market_usd × qty, or null when the card has no seed price. */
  marketUsd: number | null
  cost?: CostBasis
}

export interface PortfolioSummary {
  holdings: Holding[]
  /** Sum of seed market value over priced holdings; null when nothing is priced. Always USD. */
  marketUsd: number | null
  /** Costs are summed per currency and never converted. */
  costSgd: number | null
  costUsd: number | null
  /**
   * Unrealized P/L over cards with a USD cost and a seed price:
   * Σ(market_usd × qty) − Σ(USD cost). Null when no such card exists.
   */
  plUsd: number | null
  /** True when at least one USD-cost card had to be skipped for lack of a seed price. */
  plSkippedUnpriced: boolean
}

export function summarisePortfolio(
  owned: Record<string, OwnedEntry>,
  getCard: (cardNumber: string) => Card | undefined,
): PortfolioSummary {
  const holdings: Holding[] = []
  let marketUsd: number | null = null
  let costSgd: number | null = null
  let costUsd: number | null = null
  let plUsd: number | null = null
  let plSkippedUnpriced = false

  for (const [cardNumber, entry] of Object.entries(owned)) {
    const card = getCard(cardNumber)
    if (!card) continue
    const market = card.marketUsd === null ? null : card.marketUsd * entry.qty
    holdings.push({ card, qty: entry.qty, marketUsd: market, cost: entry.cost })

    if (market !== null) marketUsd = (marketUsd ?? 0) + market

    const cost = entry.cost
    if (!cost) continue
    if (cost.currency === 'SGD') costSgd = (costSgd ?? 0) + cost.amount
    else {
      costUsd = (costUsd ?? 0) + cost.amount
      if (market === null) plSkippedUnpriced = true
      else plUsd = (plUsd ?? 0) + market - cost.amount
    }
  }

  holdings.sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1))
  return { holdings, marketUsd, costSgd, costUsd, plUsd, plSkippedUnpriced }
}
