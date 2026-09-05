import { useEffect, useState } from 'react'
import type { Card } from './seed'
import { csvToObjects } from './csv'

/**
 * Dated seed prices per card from `data/price-history/{code}.csv`
 * (`card_number,as_of,market_usd`, one row per card per day, appended by
 * `npm run seed:refresh`). Loaded lazily per set: only card detail needs it,
 * so the history never lands in the main bundle.
 */
export type PriceSource = 'limitless' | 'tcgplayer'

export interface PricePoint {
  asOf: string
  usd: number
  /** Where the reading came from: daily Limitless seed, or TCGPlayer's weekly chart data (backfill). */
  source: PriceSource
}

const FILES = import.meta.glob('../../data/price-history/*.csv', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

const cache = new Map<string, Promise<Map<string, PricePoint[]>>>()

function fileFor(setCode: string): (() => Promise<string>) | undefined {
  const key = `/${setCode.replace(/-/g, '').toLowerCase()}.csv`
  const path = Object.keys(FILES).find((p) => p.toLowerCase().endsWith(key))
  return path ? FILES[path] : undefined
}

function loadSet(setCode: string): Promise<Map<string, PricePoint[]>> {
  const hit = cache.get(setCode)
  if (hit) return hit
  const loader = fileFor(setCode)
  const promise = (loader ? loader() : Promise.resolve('')).then((text) => {
    const byCard = new Map<string, PricePoint[]>()
    for (const row of csvToObjects(text)) {
      const usd = Number(row.market_usd)
      if (!row.card_number || !row.as_of || !Number.isFinite(usd)) continue
      const list = byCard.get(row.card_number) ?? []
      list.push({ asOf: row.as_of, usd, source: row.source === 'tcgplayer' ? 'tcgplayer' : 'limitless' })
      byCard.set(row.card_number, list)
    }
    for (const list of byCard.values()) list.sort((a, b) => a.asOf.localeCompare(b.asOf))
    return byCard
  })
  cache.set(setCode, promise)
  return promise
}

/**
 * Dated points for a card, oldest first, with the card's own seed price merged
 * in (it is the latest known point when the history file lags the CSV).
 */
export async function priceHistoryFor(card: Card): Promise<PricePoint[]> {
  const byCard = await loadSet(card.setCode)
  const points = [...(byCard.get(card.cardNumber) ?? [])]
  if (card.marketUsd !== null && card.asOf && !points.some((p) => p.asOf === card.asOf)) {
    points.push({ asOf: card.asOf, usd: card.marketUsd, source: 'limitless' })
    points.sort((a, b) => a.asOf.localeCompare(b.asOf))
  }
  return points
}

export interface PriceChange {
  /** Latest minus reference, in USD. */
  delta: number
  /** The reference point: the latest point at or before `days` before the newest one, else the oldest. */
  since: PricePoint
  latest: PricePoint
}

/**
 * Movement over roughly the last `days` days, in words a collector can check:
 * the reference is the newest point that is at least `days` old, or the oldest
 * point when the history is shorter than that. Null with fewer than two points.
 */
export function changeSince(points: PricePoint[], days = 30): PriceChange | null {
  if (points.length < 2) return null
  const latest = points[points.length - 1]
  const cutoff = Date.parse(latest.asOf) - days * 86_400_000
  let since = points[0]
  for (const p of points) {
    if (Date.parse(p.asOf) <= cutoff) since = p
    else break
  }
  if (since.asOf === latest.asOf) return null
  return { delta: Math.round((latest.usd - since.usd) * 100) / 100, since, latest }
}

/** Histories for many cards at once (owned and watched cards on Portfolio and Collection); each set's file loads once. */
export function usePriceHistories(cards: Card[]): { byCard: Map<string, PricePoint[]>; loading: boolean } {
  const key = cards.map((c) => c.cardNumber).sort().join('|')
  const [state, setState] = useState<{ key: string; byCard: Map<string, PricePoint[]> } | null>(null)
  useEffect(() => {
    let live = true
    Promise.all(cards.map((c) => priceHistoryFor(c).then((points) => [c.cardNumber, points] as const))).then((entries) => {
      if (live) setState({ key, byCard: new Map(entries) })
    })
    return () => {
      live = false
    }
    // `key` captures the card list; the array identity itself may change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const ready = state !== null && state.key === key
  return { byCard: ready ? state.byCard : new Map(), loading: !ready }
}

export function usePriceHistory(card: Card): { points: PricePoint[]; loading: boolean } {
  const [state, setState] = useState<{ key: string; points: PricePoint[] } | null>(null)
  useEffect(() => {
    let live = true
    priceHistoryFor(card).then((points) => {
      if (live) setState({ key: card.cardNumber, points })
    })
    return () => {
      live = false
    }
  }, [card])
  const ready = state !== null && state.key === card.cardNumber
  return { points: ready ? state.points : [], loading: !ready }
}
