import { ALL_CARDS, compareCardNumbers, getCard, type Card } from '../data/seed'
import type { CardAttributes } from '../data/attributes'
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

/* ---------- Facets (2.3) ---------- */

export const COLOURS = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'] as const
export const CATEGORIES = ['Leader', 'Character', 'Event', 'Stage'] as const
/** The eight effect keywords; Limitless has no keyword field, so these are read from the effect text as `[Blocker]`. */
export const KEYWORDS = ['Blocker', 'Rush', 'Trigger', 'Banish', 'Double Attack', 'On Play', 'On K.O.', 'Counter'] as const
export const COSTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

export type Facet =
  | { kind: 'colour'; value: string }
  | { kind: 'category'; value: string }
  | { kind: 'keyword'; value: string }
  | { kind: 'cost'; value: number }
  | { kind: 'trait'; value: string }
  | { kind: 'owned' }

/** A facet read out of the typed query, with the span of text it came from. */
export interface FacetHit {
  facet: Facet
  start: number
  end: number
}

export interface ParsedQuery {
  /** The query as typed; `?q=` carries this whole. */
  query: string
  /** What is left for names and numbers once the facet words are taken out. */
  text: string
  hits: FacetHit[]
  colours: string[]
  categories: string[]
  keywords: string[]
  cost: number | null
  traits: string[]
  owned: boolean
  /** Any facet on at all. */
  any: boolean
  /** True when a facet other than Owned is on: filtering needs every set's attributes. */
  needsAttributes: boolean
}

export function sameFacet(a: Facet, b: Facet): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'owned' || b.kind === 'owned') return true
  return String(a.value).toLowerCase() === String(b.value).toLowerCase()
}

/** The word a chip adds to the query for a facet. */
export function facetWord(f: Facet): string {
  switch (f.kind) {
    case 'cost':
      return `cost ${f.value}`
    case 'owned':
      return 'owned'
    default:
      return f.value
  }
}

/** The chip's label for a facet. */
export function facetLabel(f: Facet): string {
  switch (f.kind) {
    case 'cost':
      return `Cost ${f.value}`
    case 'owned':
      return 'Owned'
    default:
      return f.value
  }
}

interface Term {
  norms: string[]
  facet: Facet
}

const words = (s: string) => s.split(/\s+/).map(compact).filter(Boolean)

/** Fixed vocabulary: colours, categories (and their plurals), keywords, owned. Traits join at parse time. */
const FIXED_TERMS: Term[] = [
  ...COLOURS.map((c) => ({ norms: [c.toLowerCase()], facet: { kind: 'colour', value: c } as Facet })),
  ...CATEGORIES.flatMap((c) => [
    { norms: [c.toLowerCase()], facet: { kind: 'category', value: c } as Facet },
    { norms: [`${c.toLowerCase()}s`], facet: { kind: 'category', value: c } as Facet },
  ]),
  ...KEYWORDS.map((k) => ({ norms: words(k), facet: { kind: 'keyword', value: k } as Facet })),
  { norms: ['blockers'], facet: { kind: 'keyword', value: 'Blocker' } },
  { norms: ['owned'], facet: { kind: 'owned' } },
  { norms: ['i', 'own'], facet: { kind: 'owned' } },
]

interface Token {
  raw: string
  norm: string
  start: number
  end: number
}

function tokenise(query: string): Token[] {
  const out: Token[] = []
  for (const m of query.matchAll(/\S+/g)) {
    out.push({ raw: m[0], norm: compact(m[0]), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length })
  }
  return out
}

/**
 * Read the query for words we know before anything is matched against names:
 * colours, types, `cost 4` / `4 cost`, the eight keywords, a trait name (exact,
 * any case, punctuation forgiven: "fish-man" is "Fish-Man"), `owned` / `I own`.
 * Longer phrases win over shorter ones; each word is taken once. Traits are only
 * recognised once the attributes are loaded, so `traits` may be empty meanwhile.
 */
export function parseQuery(rawQuery: string, traits: readonly string[] = []): ParsedQuery {
  const query = rawQuery
  const tokens = tokenise(query)
  const taken = new Array<boolean>(tokens.length).fill(false)
  const hits: FacetHit[] = []
  const free = (i: number, len: number) => i + len <= tokens.length && !taken.slice(i, i + len).some(Boolean)
  const consume = (i: number, len: number, facet: Facet) => {
    for (let k = i; k < i + len; k++) taken[k] = true
    hits.push({ facet, start: tokens[i].start, end: tokens[i + len - 1].end })
  }

  // Cost first: "cost 4" or "4 cost", one number 0–10.
  for (let i = 0; i < tokens.length - 1; i++) {
    if (!free(i, 2)) continue
    const [a, b] = [tokens[i].norm, tokens[i + 1].norm]
    const n = a === 'cost' && /^\d{1,2}$/.test(b) ? Number(b) : b === 'cost' && /^\d{1,2}$/.test(a) ? Number(a) : NaN
    if (Number.isInteger(n) && n >= 0 && n <= 10) consume(i, 2, { kind: 'cost', value: n })
  }

  const terms: Term[] = [
    ...FIXED_TERMS,
    ...traits.map((t) => ({ norms: words(t), facet: { kind: 'trait', value: t } as Facet })).filter((t) => t.norms.length > 0),
  ].sort((a, b) => b.norms.length - a.norms.length)

  for (const term of terms) {
    const len = term.norms.length
    for (let i = 0; i + len <= tokens.length; i++) {
      if (!free(i, len)) continue
      let ok = true
      for (let k = 0; k < len && ok; k++) ok = tokens[i + k].norm === term.norms[k]
      if (ok) consume(i, len, term.facet)
    }
  }

  hits.sort((a, b) => a.start - b.start)
  const text = tokens
    .filter((_, i) => !taken[i])
    .map((t) => t.raw)
    .join(' ')
  const pick = <K extends Facet['kind']>(kind: K) =>
    hits.filter((h) => h.facet.kind === kind).map((h) => (h.facet as Extract<Facet, { kind: K }>))
  const dedupe = (list: string[]) => [...new Set(list)]
  const colours = dedupe(pick('colour').map((f) => f.value))
  const categories = dedupe(pick('category').map((f) => f.value))
  const keywords = dedupe(pick('keyword').map((f) => f.value))
  const traitsOn = dedupe(pick('trait').map((f) => f.value))
  const costs = pick('cost')
  const cost = costs.length ? costs[costs.length - 1].value : null
  const owned = hits.some((h) => h.facet.kind === 'owned')
  const needsAttributes = colours.length + categories.length + keywords.length + traitsOn.length > 0 || cost !== null
  return {
    query,
    text,
    hits,
    colours,
    categories,
    keywords,
    cost,
    traits: traitsOn,
    owned,
    any: needsAttributes || owned,
    needsAttributes,
  }
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The query with every span that read as this facet cut out. */
export function removeFacet(parsed: ParsedQuery, facet: Facet): string {
  const spans = parsed.hits.filter((h) => sameFacet(h.facet, facet)).sort((a, b) => b.start - a.start)
  let q = parsed.query
  for (const s of spans) q = q.slice(0, s.start) + ' ' + q.slice(s.end)
  return tidy(q)
}

/** The query with a facet's word appended (a cost replaces any cost already there). */
export function addFacet(parsed: ParsedQuery, facet: Facet): string {
  let q = parsed.query
  if (facet.kind === 'cost' && parsed.cost !== null) q = removeFacet(parsed, { kind: 'cost', value: parsed.cost })
  return tidy(`${tidy(q)} ${facetWord(facet)}`)
}

export function hasFacet(parsed: ParsedQuery, facet: Facet): boolean {
  return parsed.hits.some((h) => sameFacet(h.facet, facet))
}

export function toggleFacet(parsed: ParsedQuery, facet: Facet): string {
  return hasFacet(parsed, facet) ? removeFacet(parsed, facet) : addFacet(parsed, facet)
}

const attrsOf = (card: Card, attrs: Map<string, CardAttributes>) => attrs.get(card.cardNumber) ?? attrs.get(card.baseNumber)

/** "Red/Green" → ["Red", "Green"]. */
const splitColour = (c: string) => c.split('/').map((s) => s.trim()).filter(Boolean)

function hasKeyword(a: CardAttributes, keyword: string): boolean {
  const tag = `[${keyword}]`
  return a.effect.includes(tag) || a.trigger.includes(tag)
}

/**
 * Does a print satisfy every facet that is on? Parallels fall back to their base
 * print's attributes. Without attributes, only Owned can be judged: anything else
 * is false until they load.
 */
export function matchesFacets(
  card: Card,
  p: ParsedQuery,
  attrs: Map<string, CardAttributes> | null | undefined,
  isOwned: (cardNumber: string) => boolean = () => false,
): boolean {
  if (p.owned && !isOwned(card.cardNumber)) return false
  if (!p.needsAttributes) return true
  const a = attrs ? attrsOf(card, attrs) : undefined
  if (!a) return false
  if (p.colours.length && !splitColour(a.color).some((c) => p.colours.includes(c))) return false
  if (p.categories.length && !p.categories.includes(a.category)) return false
  if (p.cost !== null && a.cost !== p.cost) return false
  if (p.traits.length && !p.traits.every((t) => a.types.some((x) => x.toLowerCase() === t.toLowerCase()))) return false
  if (p.keywords.length && !p.keywords.every((k) => hasKeyword(a, k))) return false
  return true
}

/* ---------- Derived lists from the attributes, one per loaded Map ---------- */

const traitCache = new WeakMap<Map<string, CardAttributes>, string[]>()

/** Every trait Limitless records, from the `types` field, in alphabetical order. */
export function traitList(attrs: Map<string, CardAttributes> | null | undefined): string[] {
  if (!attrs) return []
  const hit = traitCache.get(attrs)
  if (hit) return hit
  const set = new Set<string>()
  for (const a of attrs.values()) for (const t of a.types) set.add(t)
  const list = [...set].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  traitCache.set(attrs, list)
  return list
}

export interface ArtistEntry {
  /** The name as Limitless writes it. */
  name: string
  cards: Card[]
}

const artistCache = new WeakMap<Map<string, CardAttributes>, ArtistEntry[]>()

/** Every credited illustrator with the seeded prints they drew, most prints first. */
export function artistList(attrs: Map<string, CardAttributes> | null | undefined): ArtistEntry[] {
  if (!attrs) return []
  const hit = artistCache.get(attrs)
  if (hit) return hit
  const byName = new Map<string, Card[]>()
  for (const c of ALL_CARDS) {
    const artist = attrsOf(c, attrs)?.artist.trim()
    if (!artist) continue
    byName.set(artist, [...(byName.get(artist) ?? []), c])
  }
  const list = [...byName.entries()]
    .map(([name, cards]) => ({ name, cards }))
    .sort((a, b) => b.cards.length - a.cards.length || a.name.localeCompare(b.name))
  artistCache.set(attrs, list)
  return list
}

/* ---------- Results ---------- */

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

export interface ArtistGroup {
  name: string
  prints: number
}

export interface SearchResults {
  /** The whole typed query. */
  query: string
  /** What the names and numbers were matched against once facet words were read out. */
  text: string
  parsed: ParsedQuery
  /** Exact card-number hit, if the text is a full number. */
  exact: Card | undefined
  /** Matches by home set, in roster (release) order. */
  bySet: SetGroup[]
  /** Card names matched that recur in more than one set, most printed first (single-set names already sit together in their set group). */
  names: NameGroup[]
  /** Illustrators whose name contains the text, most prints first. */
  artists: ArtistGroup[]
  total: number
  /** The reading in words, e.g. "38 red cards with Blocker you own"; null when no facet is on. */
  summary: string | null
  /** What to say when nothing matched. */
  emptyText: string
  /** A facet is on that needs the attributes, and they have not loaded yet. */
  pending: boolean
}

export interface SearchOptions {
  attrs?: Map<string, CardAttributes> | null
  isOwned?: (cardNumber: string) => boolean
}

const rosterIndex = new Map(ROSTER.map((s, i) => [s.setCode, i]))
const setName = new Map(ROSTER.map((s) => [s.setCode, s.setName]))

function groupBySet(cards: Card[]): SetGroup[] {
  const groups = new Map<string, Card[]>()
  for (const c of cards) {
    const list = groups.get(c.setCode) ?? []
    list.push(c)
    groups.set(c.setCode, list)
  }
  return [...groups.entries()]
    .sort((a, b) => (rosterIndex.get(a[0]) ?? 999) - (rosterIndex.get(b[0]) ?? 999) || a[0].localeCompare(b[0]))
    .map(([code, list]) => ({
      setCode: code,
      setName: setName.get(code) ?? list[0].setName,
      cards: list.sort((a, b) => compareCardNumbers(a.cardNumber, b.cardNumber)),
    }))
}

const joinWords = (list: string[], word: 'and' | 'or') =>
  list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} ${word} ${list[list.length - 1]}`

/**
 * The facets as a noun phrase: "red Straw Hat Crew Characters with Blocker and cost 4 matching “zoro”".
 * With `short`, one keyword and no type reads as the keyword itself: "red Blockers".
 */
function describe(p: ParsedQuery, count: number, short = false): string {
  const one = count === 1
  const parts: string[] = []
  if (p.colours.length) parts.push(joinWords(p.colours.map((c) => c.toLowerCase()), 'or'))
  if (p.traits.length) parts.push(joinWords(p.traits, 'and'))
  const asNoun = short && p.categories.length === 0 && p.keywords.length === 1 && p.keywords[0] === 'Blocker'
  if (p.categories.length) parts.push(joinWords(p.categories.map((c) => (one ? c : `${c}s`)), 'or'))
  else parts.push(asNoun ? (one ? 'Blocker' : 'Blockers') : one ? 'card' : 'cards')
  const features: string[] = []
  if (p.cost !== null) features.push(`cost ${p.cost}`)
  if (!asNoun) features.push(...p.keywords)
  if (features.length) parts.push(`with ${joinWords(features, 'and')}`)
  if (p.text) parts.push(`matching “${p.text}”`)
  return parts.join(' ')
}

function tryWithout(p: ParsedQuery): string {
  if (p.owned) return 'Try without Owned.'
  if (p.text) return `Try without “${p.text}”.`
  if (p.hits.length > 1) return `Try without ${facetLabel(p.hits[p.hits.length - 1].facet)}.`
  return ''
}

export function searchAll(rawQuery: string, { attrs = null, isOwned }: SearchOptions = {}): SearchResults | null {
  const parsed = parseQuery(rawQuery.trim(), traitList(attrs))
  const text = parsed.text
  const exact = text ? resolveCardNumber(text) : undefined
  if (!parsed.any && text.length < 2 && !exact) return null
  const pending = parsed.needsAttributes && !attrs

  const matched = pending ? [] : ALL_CARDS.filter((c) => matchesSearch(c, text) && matchesFacets(c, parsed, attrs, isOwned))
  const bySet = groupBySet(matched)

  const byName = new Map<string, { prints: number; sets: Set<string> }>()
  const q = text.toLowerCase()
  if (q) {
    for (const c of matched) {
      if (!c.name.toLowerCase().includes(q)) continue
      const entry = byName.get(c.name) ?? { prints: 0, sets: new Set<string>() }
      entry.prints++
      entry.sets.add(c.setCode)
      byName.set(c.name, entry)
    }
  }
  const names: NameGroup[] = [...byName.entries()]
    .filter(([, v]) => v.sets.size > 1)
    .map(([name, v]) => ({ name, prints: v.prints, sets: v.sets.size }))
    .sort((a, b) => b.prints - a.prints || a.name.localeCompare(b.name))

  const artists: ArtistGroup[] =
    q.length >= 2
      ? artistList(attrs)
          .filter((a) => a.name.toLowerCase().includes(q))
          .map((a) => ({ name: a.name, prints: a.cards.length }))
      : []

  const summary = parsed.any ? `${matched.length} ${describe(parsed, matched.length)}${parsed.owned ? ' you own' : ''}` : null
  const emptyText = parsed.any
    ? `No ${describe(parsed, 0, true)}${parsed.owned ? ' in the sets you own cards from' : ''}. ${tryWithout(parsed)}`.trim()
    : `No cards match “${parsed.query}”.`

  return { query: parsed.query, text, parsed, exact, bySet, names, artists, total: matched.length, summary, emptyText, pending }
}

/** Every print with exactly this name, grouped by home set in roster order. */
export function printsNamed(name: string): SetGroup[] {
  return groupBySet(ALL_CARDS.filter((c) => c.name === name))
}

/** Every print Limitless credits to this illustrator (any case), grouped by home set in roster order; the name as they write it. */
export function printsByArtist(name: string, attrs: Map<string, CardAttributes>): { name: string; groups: SetGroup[] } | undefined {
  const entry = artistList(attrs).find((a) => a.name.toLowerCase() === name.trim().toLowerCase())
  if (!entry) return undefined
  return { name: entry.name, groups: groupBySet(entry.cards) }
}
