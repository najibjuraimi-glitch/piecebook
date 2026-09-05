import type { Card } from '../data/seed'

/** Copies of one card a deck may run. Leaders are one per deck, so the idea of a playset does not apply to them. */
export const PLAYSET = 4

export function isLeader(card: Card): boolean {
  return card.rarity === 'L'
}

/** "2 of 4 for a playset" / "Playset complete"; null for leaders. */
export function playsetLine(card: Card, qty: number): string | null {
  if (isLeader(card)) return null
  return qty >= PLAYSET ? 'Playset complete' : `${qty} of ${PLAYSET} for a playset`
}

export function isPlayset(card: Card, qty: number): boolean {
  return !isLeader(card) && qty >= PLAYSET
}
