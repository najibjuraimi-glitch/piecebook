import { compareCardNumbers, type Card } from '../data/seed'

/* ---------- Search ---------- */

/** Lowercase alphanumerics only, so "op09-004", "OP09 004" and "op09004" compare equal. */
function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Name or number match. Names match as a case-insensitive substring; numbers
 * match on their compacted form so "004", "op09-004" and "OP09-004" all find
 * OP09-004 (and its parallels, whose numbers extend the same prefix).
 */
export function matchesSearch(card: Card, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  if (card.name.toLowerCase().includes(q)) return true
  const qc = compact(q)
  return qc !== '' && compact(card.cardNumber).includes(qc)
}

/* ---------- Sort ---------- */

export type SortKey = 'name-asc' | 'name-desc' | 'price-desc' | 'price-asc'

export const DEFAULT_SORT: SortKey = 'price-desc'

export const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'name-asc', label: 'Name · A to Z' },
  { key: 'name-desc', label: 'Name · Z to A' },
  { key: 'price-desc', label: 'Price · high to low' },
  { key: 'price-asc', label: 'Price · low to high' },
]

export function parseSort(value: string | null | undefined): SortKey {
  return SORT_OPTIONS.some((o) => o.key === value) ? (value as SortKey) : DEFAULT_SORT
}

const byName = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

function compareName(a: Card, b: Card): number {
  return byName.compare(a.name, b.name) || compareCardNumbers(a.cardNumber, b.cardNumber)
}

/** Price order with unpriced cards always last, ties broken by name then number. */
function comparePrice(a: Card, b: Card, direction: 1 | -1): number {
  const ap = a.marketUsd
  const bp = b.marketUsd
  if (ap === null && bp === null) return compareName(a, b)
  if (ap === null) return 1
  if (bp === null) return -1
  if (ap !== bp) return direction * (ap - bp)
  return compareName(a, b)
}

export function sortCards(cards: Card[], sort: SortKey): Card[] {
  const list = [...cards]
  switch (sort) {
    case 'name-asc':
      return list.sort(compareName)
    case 'name-desc':
      return list.sort((a, b) => compareName(b, a))
    case 'price-desc':
      return list.sort((a, b) => comparePrice(a, b, -1))
    case 'price-asc':
      return list.sort((a, b) => comparePrice(a, b, 1))
  }
}
