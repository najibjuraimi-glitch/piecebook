import { csvToObjects } from './csv'

/**
 * Every EN checklist CSV under data/ (one per set, `opXX-en-seed.csv`,
 * `ebXX-…`, `prbXX-…`). Adding a set is a CSV drop-in plus flipping its roster
 * row to `ready`; nothing here needs to change.
 */
const SEED_CSVS = import.meta.glob('../../data/*-en-seed.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

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
  /**
   * Human name for a parallel print as Limitless labels it ("Alternate Art",
   * "Manga Art", "Special Card", "Pirate Foil", …; "Parallel" when the style
   * has no published name). Null on base prints.
   */
  variant: string | null
}

export interface CardSet {
  setCode: string
  setName: string
  cards: Card[]
}

/**
 * Only same-set numbered rows are part of a regular set (see
 * data/SEED-VERSION.txt): a row belongs to its set when the card number carries
 * that set's code, e.g. `OP17-001` under `OP-17`. Cross-set chase pulls
 * Limitless files on a set page are dropped.
 *
 * Premium boosters (PRB-xx) are reprint products, so their CSVs list every
 * print in the box, cross-set numbers included. A card keeps one home set (the
 * first CSV that lists it, e.g. `OP01-024` → OP-01) and is additionally a
 * member of the reprint set's checklist.
 */
const REPRINT_SETS = /^(PRB|ST)-/i

function isSameSetRow(setCode: string, cardNumber: string): boolean {
  return cardNumber.toUpperCase().startsWith(`${setCode.replace(/-/g, '').toUpperCase()}-`)
}

function isAllowedRow(setCode: string, cardNumber: string): boolean {
  return REPRINT_SETS.test(setCode) || isSameSetRow(setCode, cardNumber)
}

const PARALLEL_RE = /p\d+$/i

export function isParallelNumber(cardNumber: string): boolean {
  return PARALLEL_RE.test(cardNumber)
}

function toCard(row: Record<string, string>): Card | null {
  const cardNumber = row.card_number
  if (!cardNumber || !row.set_code || !isAllowedRow(row.set_code, cardNumber)) return null
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
    variant: row.variant || null,
  }
}

function numberSortKey(cardNumber: string): [string, number, number] {
  const m = cardNumber.match(/^([^-]*)-(\d+)(?:p(\d+))?$/i)
  return [m ? m[1].toUpperCase() : cardNumber.toUpperCase(), m ? Number(m[2]) : 0, m && m[3] ? Number(m[3]) : 0]
}

/** Set prefix, then number, then parallel index; so mixed lists group by set. */
export function compareCardNumbers(a: string, b: string): number {
  const [as, an, ap] = numberSortKey(a)
  const [bs, bn, bp] = numberSortKey(b)
  if (as !== bs) return as.localeCompare(bs)
  if (an !== bn) return an - bn
  if (ap !== bp) return ap - bp
  return a.localeCompare(b)
}

function buildCatalog(): { sets: CardSet[]; byNumber: Map<string, Card> } {
  const rows = Object.keys(SEED_CSVS)
    .sort()
    .flatMap((path) => csvToObjects(SEED_CSVS[path]))
  const byNumber = new Map<string, Card>()
  const setMap = new Map<string, CardSet>()
  const membership = new Map<string, Set<string>>()

  for (const row of rows) {
    const parsed = toCard(row)
    if (!parsed) continue
    // First CSV to list a number owns the card; later rows (reprint sets) only add membership.
    const card = byNumber.get(parsed.cardNumber) ?? parsed
    if (!byNumber.has(card.cardNumber)) byNumber.set(card.cardNumber, card)

    let set = setMap.get(parsed.setCode)
    if (!set) {
      set = { setCode: parsed.setCode, setName: parsed.setName, cards: [] }
      setMap.set(parsed.setCode, set)
      membership.set(parsed.setCode, new Set())
    }
    const members = membership.get(parsed.setCode)!
    if (!members.has(card.cardNumber)) {
      members.add(card.cardNumber)
      set.cards.push(card)
    }
  }

  const sets = [...setMap.values()].sort((a, b) => a.setCode.localeCompare(b.setCode))
  for (const set of sets) {
    // A set's own numbers first (matters for reprint sets), then by prefix / number.
    set.cards.sort((a, b) => {
      const aOwn = isSameSetRow(set.setCode, a.cardNumber)
      const bOwn = isSameSetRow(set.setCode, b.cardNumber)
      if (aOwn !== bOwn) return aOwn ? -1 : 1
      return compareCardNumbers(a.cardNumber, b.cardNumber)
    })
  }
  return { sets, byNumber }
}

const catalog = buildCatalog()

export const SETS: CardSet[] = catalog.sets

/** Every distinct card once, by number (reprint-set memberships do not duplicate it). */
export const ALL_CARDS: Card[] = [...catalog.byNumber.values()]

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

/** First rarity tab and the default on open: every card in the set, parallels included. */
export const ALL_TAB = 'All'

/**
 * UI copy for seed rarity codes (Cards/Design). Used everywhere a rarity is shown:
 * filter chips, card cells and card detail. Seed CSV codes themselves are unchanged.
 */
export const RARITY_LABELS: Record<string, string> = {
  L: 'Leader',
  SEC: 'Secret Rare',
  SR: 'Super Rare',
  R: 'Rare',
  UC: 'Uncommon',
  C: 'Common',
  SP: 'Special',
  TR: 'Treasure Rare',
  P: 'Promo',
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
export function bucketByRarity(cards: Card[], { byRarityOnly = false }: { byRarityOnly?: boolean } = {}): RarityBucket[] {
  // A deck's prints are the deck: its leader is often a reprint parallel, so a deck files every print by rarity.
  const base = byRarityOnly ? cards : cards.filter((c) => !c.isParallel)
  const parallels = byRarityOnly ? [] : cards.filter((c) => c.isParallel)

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

/** Rarity tabs for Set detail: All first, then the fixed-order rarity buckets. */
export function rarityTabs(cards: Card[], options: { byRarityOnly?: boolean } = {}): RarityBucket[] {
  return [{ key: ALL_TAB, label: ALL_TAB, cards }, ...bucketByRarity(cards, options)]
}
