import op09Csv from '../../data/op09-en-seed.csv?raw'
import op16Csv from '../../data/op16-en-seed.csv?raw'
import { csvToObjects } from './csv'

export interface Card {
  setCode: string
  setName: string
  cardNumber: string
  /** Card number with any parallel suffix removed, e.g. OP09-001p1 → OP09-001 */
  baseNumber: string
  name: string
  rarity: string
  language: string
  imageUrl: string | null
  marketUsd: number | null
  asOf: string | null
  isParallel: boolean
}

export interface CardSet {
  setCode: string
  setName: string
  cards: Card[]
}

/**
 * Only same-set numbered rows are part of the V1 catalog
 * (see data/SEED-VERSION.txt: cleaned-same-set-only).
 */
const ALLOWED_PREFIXES = [/^OP09-/, /^OP16-/]

const PARALLEL_RE = /p\d+$/i

export function isParallelNumber(cardNumber: string): boolean {
  return PARALLEL_RE.test(cardNumber)
}

function toCard(row: Record<string, string>): Card | null {
  const cardNumber = row.card_number
  if (!cardNumber || !ALLOWED_PREFIXES.some((re) => re.test(cardNumber))) return null
  const market = row.market_usd === '' ? NaN : Number(row.market_usd)
  return {
    setCode: row.set_code,
    setName: row.set_name,
    cardNumber,
    baseNumber: cardNumber.replace(PARALLEL_RE, ''),
    name: row.name,
    rarity: row.rarity,
    language: row.language || 'EN',
    imageUrl: row.image_url || null,
    marketUsd: Number.isFinite(market) ? market : null,
    asOf: row.as_of || null,
    isParallel: isParallelNumber(cardNumber),
  }
}

function numberSortKey(cardNumber: string): [number, number] {
  const m = cardNumber.match(/-(\d+)(?:p(\d+))?$/i)
  return [m ? Number(m[1]) : 0, m && m[2] ? Number(m[2]) : 0]
}

export function compareCardNumbers(a: string, b: string): number {
  const [an, ap] = numberSortKey(a)
  const [bn, bp] = numberSortKey(b)
  if (an !== bn) return an - bn
  if (ap !== bp) return ap - bp
  return a.localeCompare(b)
}

function buildCatalog(): { sets: CardSet[]; byNumber: Map<string, Card> } {
  const rows = [...csvToObjects(op09Csv), ...csvToObjects(op16Csv)]
  const byNumber = new Map<string, Card>()
  for (const row of rows) {
    const card = toCard(row)
    if (card && !byNumber.has(card.cardNumber)) byNumber.set(card.cardNumber, card)
  }

  const setMap = new Map<string, CardSet>()
  for (const card of byNumber.values()) {
    const existing = setMap.get(card.setCode)
    if (existing) existing.cards.push(card)
    else setMap.set(card.setCode, { setCode: card.setCode, setName: card.setName, cards: [card] })
  }

  const sets = [...setMap.values()].sort((a, b) => a.setCode.localeCompare(b.setCode))
  for (const set of sets) set.cards.sort((a, b) => compareCardNumbers(a.cardNumber, b.cardNumber))
  return { sets, byNumber }
}

const catalog = buildCatalog()

export const SETS: CardSet[] = catalog.sets

export function getSet(setCode: string | undefined): CardSet | undefined {
  if (!setCode) return undefined
  return SETS.find((s) => s.setCode.toLowerCase() === setCode.toLowerCase())
}

export function getCard(cardNumber: string | undefined): Card | undefined {
  if (!cardNumber) return undefined
  const direct = catalog.byNumber.get(cardNumber)
  if (direct) return direct
  const upper = cardNumber.toUpperCase()
  for (const [key, card] of catalog.byNumber) {
    if (key.toUpperCase() === upper) return card
  }
  return undefined
}

/** Fixed rarity tab order from the Design pack. Parallels get their own bucket. */
export const RARITY_ORDER = ['L', 'SEC', 'SR', 'R', 'UC', 'C'] as const

export const PARALLELS_TAB = 'Parallels'

export const RARITY_LABELS: Record<string, string> = {
  L: 'Leader',
  SEC: 'SEC',
  SR: 'SR',
  R: 'R',
  UC: 'UC',
  C: 'C',
  SP: 'SP',
  TR: 'TR',
}

export function rarityLabel(rarity: string): string {
  return RARITY_LABELS[rarity] ?? rarity
}

export interface RarityBucket {
  key: string
  label: string
  cards: Card[]
}

/**
 * Buckets a set's cards by rarity in the fixed Design-pack order, then Parallels.
 * Only buckets that actually contain cards are returned. Any base-print rarity
 * outside the fixed list (e.g. SP / TR if they ever appear as base prints) is
 * appended after C so no seed row is hidden.
 */
export function bucketByRarity(cards: Card[]): RarityBucket[] {
  const base = cards.filter((c) => !c.isParallel)
  const parallels = cards.filter((c) => c.isParallel)

  const buckets: RarityBucket[] = []
  const seen = new Set<string>()
  for (const r of RARITY_ORDER) {
    const list = base.filter((c) => c.rarity === r)
    seen.add(r)
    if (list.length) buckets.push({ key: r, label: rarityLabel(r), cards: list })
  }
  const extra = [...new Set(base.map((c) => c.rarity))].filter((r) => !seen.has(r)).sort()
  for (const r of extra) {
    buckets.push({ key: r, label: rarityLabel(r), cards: base.filter((c) => c.rarity === r) })
  }
  if (parallels.length) buckets.push({ key: PARALLELS_TAB, label: PARALLELS_TAB, cards: parallels })
  return buckets
}
