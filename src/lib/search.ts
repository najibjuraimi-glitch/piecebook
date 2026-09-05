import { ALL_CARDS, compareCardNumbers, getCard, type Card } from '../data/seed'
import { ROSTER } from '../data/roster'
import { matchesSearch } from './query'

/* Global search across every set. The Sets tree stays home; this is the flat cross-cut into it. */

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Resolve a typed number to a card, forgiving hyphens, spaces and case:
 * "op09-118", "OP09 118", "op09118", "op09-004p1", "p-014" all resolve.
 * Undefined when the text is not a full card number or no such card exists.
 */
export function resolveCardNumber(raw: string): Card | undefined {
  const q = compact(raw)
  const m = q.match(/^([a-z]+)(\d{2})?(\d{3})(p\d+)?$/)
  if (!m) return undefined
  const [, prefix, setDigits, num, parallel] = m
  const candidates: string[] = []
  if (setDigits) candidates.push(`${prefix}${setDigits}-${num}${parallel ?? ''}`)
  // Promo numbers have no set digits: P-014.
  if (!setDigits && prefix === 'p') candidates.push(`P-${num}${parallel ?? ''}`)
  for (const c of candidates) {
    const card = getCard(c.toUpperCase().replace(/P(\d+)$/, 'p$1'))
    if (card) return card
  }
  return undefined
}

export interface SetGroup {
  setCode: string
  setName: string
  cards: Card[]
}

export interface NameGroup {
  name: string
  prints: number
  sets: number
}

export interface SearchResults {
  query: string
  /** Exact card-number hit, if the text is a full number. */
  exact: Card | undefined
  /** Matches by home set, in roster (release) order. */
  bySet: SetGroup[]
  /** Card names matched that recur in more than one set, most printed first (single-set names already sit together in their set group). */
  names: NameGroup[]
  total: number
}

const rosterIndex = new Map(ROSTER.map((s, i) => [s.setCode, i]))
const setName = new Map(ROSTER.map((s) => [s.setCode, s.setName]))

export function searchAll(rawQuery: string): SearchResults | null {
  const query = rawQuery.trim()
  const exact = resolveCardNumber(query)
  if (query.length < 2 && !exact) return null

  const matched = ALL_CARDS.filter((c) => matchesSearch(c, query))
  const groups = new Map<string, Card[]>()
  for (const c of matched) {
    const list = groups.get(c.setCode) ?? []
    list.push(c)
    groups.set(c.setCode, list)
  }
  const bySet: SetGroup[] = [...groups.entries()]
    .sort((a, b) => (rosterIndex.get(a[0]) ?? 999) - (rosterIndex.get(b[0]) ?? 999) || a[0].localeCompare(b[0]))
    .map(([code, cards]) => ({
      setCode: code,
      setName: setName.get(code) ?? cards[0].setName,
      cards: cards.sort((a, b) => compareCardNumbers(a.cardNumber, b.cardNumber)),
    }))

  const byName = new Map<string, { prints: number; sets: Set<string> }>()
  const q = query.toLowerCase()
  for (const c of matched) {
    if (!c.name.toLowerCase().includes(q)) continue
    const entry = byName.get(c.name) ?? { prints: 0, sets: new Set<string>() }
    entry.prints++
    entry.sets.add(c.setCode)
    byName.set(c.name, entry)
  }
  const names: NameGroup[] = [...byName.entries()]
    .filter(([, v]) => v.sets.size > 1)
    .map(([name, v]) => ({ name, prints: v.prints, sets: v.sets.size }))
    .sort((a, b) => b.prints - a.prints || a.name.localeCompare(b.name))

  return { query, exact, bySet, names, total: matched.length }
}

/** Every print with exactly this name, grouped by home set in roster order. */
export function printsNamed(name: string): SetGroup[] {
  const groups = new Map<string, Card[]>()
  for (const c of ALL_CARDS) {
    if (c.name !== name) continue
    const list = groups.get(c.setCode) ?? []
    list.push(c)
    groups.set(c.setCode, list)
  }
  return [...groups.entries()]
    .sort((a, b) => (rosterIndex.get(a[0]) ?? 999) - (rosterIndex.get(b[0]) ?? 999) || a[0].localeCompare(b[0]))
    .map(([code, cards]) => ({
      setCode: code,
      setName: setName.get(code) ?? cards[0].setName,
      cards: cards.sort((a, b) => compareCardNumbers(a.cardNumber, b.cardNumber)),
    }))
}
