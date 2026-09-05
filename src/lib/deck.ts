import type { CardAttributes } from '../data/attributes'

/** One Piece Card Game deck rules, as printed in Bandai's comprehensive rules. */
export const DECK_SIZE = 50
export const MAX_COPIES = 4

export interface Deck {
  id: string
  name: string
  /** Base card number of the leader, or null while choosing. */
  leader: string | null
  /** Base card number → copies (1–4). Parallel prints of one number are the same card. */
  cards: Record<string, number>
  createdAt: string
  updatedAt: string
}

/** A card a sentence names: its base number and the name the seed gives it (the number again when unknown). */
export interface NamedCard {
  number: string
  name: string
}

/**
 * One sentence a player can act on. When it names cards, `lead` + the cards +
 * `tail` rebuild it, so the UI can make each name a jump to its row; `text` is
 * the same sentence flat, for Decks home and screen readers.
 */
export interface DeckIssue {
  text: string
  lead?: string
  cards?: NamedCard[]
  tail?: string
}

export interface DeckCheck {
  count: number
  complete: boolean
  /** Leader colours, e.g. ["Red"] or ["Red", "Green"]; empty without a leader or its attributes. */
  colours: string[]
  issues: DeckIssue[]
  /**
   * Short words each offending row carries beside its facts, by base number:
   * "outside Red", "5 copies", "a leader". Empty for a clean row.
   */
  flags: Map<string, string[]>
}

export function splitColours(colour: string): string[] {
  return colour.split('/').map((c) => c.trim()).filter(Boolean)
}

export function deckCount(deck: Deck): number {
  return Object.values(deck.cards).reduce((n, q) => n + q, 0)
}

/** "Uta (OP09-002)", or the bare number when the seed has no name for it. */
export function mention(c: NamedCard): string {
  return c.name && c.name !== c.number ? `${c.name} (${c.number})` : c.number
}

/** Prose list: "A", "A and B", "A, B and C". Every item; nothing is hidden behind "and n more". */
export function listAll(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * Everything wrong with a list, in words that name cards: size, copies over
 * four, cards outside the leader's colours, a leader in the fifty. Nothing is
 * guessed: a card whose
 * attributes are missing is skipped. `nameOf` gives the seed name for a number.
 */
export function checkDeck(deck: Deck, attrs: Map<string, CardAttributes> | null, nameOf: (cardNumber: string) => string | undefined = () => undefined): DeckCheck {
  const count = deckCount(deck)
  const issues: DeckIssue[] = []
  const flags = new Map<string, string[]>()
  const flag = (n: string, words: string) => flags.set(n, [...(flags.get(n) ?? []), words])
  const named = (n: string): NamedCard => ({ number: n, name: nameOf(n) ?? n })
  const sentence = (lead: string, cards: NamedCard[], tail: string): DeckIssue => ({ text: `${lead}${listAll(cards.map(mention))}${tail}`, lead, cards, tail })

  const leaderAttrs = deck.leader && attrs ? attrs.get(deck.leader) : undefined
  const colours = leaderAttrs ? splitColours(leaderAttrs.color) : []

  if (!deck.leader) issues.push({ text: 'No leader yet.' })
  if (count < DECK_SIZE) issues.push({ text: `${DECK_SIZE - count} more ${DECK_SIZE - count === 1 ? 'card' : 'cards'} to reach ${DECK_SIZE}.` })
  if (count > DECK_SIZE) issues.push({ text: `${count - DECK_SIZE} ${count - DECK_SIZE === 1 ? 'card' : 'cards'} over ${DECK_SIZE}.` })

  for (const [n, q] of Object.entries(deck.cards).filter(([, q]) => q > MAX_COPIES)) {
    issues.push(sentence(`${q} copies of `, [named(n)], `; a deck runs ${MAX_COPIES} at most.`))
    flag(n, `${q} copies`)
  }

  if (attrs) {
    const leadersInList = Object.keys(deck.cards).filter((n) => attrs.get(n)?.category === 'Leader')
    if (leadersInList.length) {
      issues.push(sentence('', leadersInList.map(named), ` ${leadersInList.length === 1 ? 'is a leader' : 'are leaders'} and cannot sit in the fifty.`))
      for (const n of leadersInList) flag(n, 'a leader')
    }

    if (colours.length) {
      const outside = Object.keys(deck.cards).filter((n) => {
        const a = attrs.get(n)
        return a && a.color && !splitColours(a.color).some((c) => colours.includes(c))
      })
      if (outside.length) {
        issues.push(sentence(`${outside.length} ${outside.length === 1 ? 'card is' : 'cards are'} outside ${colours.join(' / ')}: `, outside.map(named), '.'))
        for (const n of outside) flag(n, `outside ${colours.join(' / ')}`)
      }
    }
  }

  return { count, complete: count === DECK_SIZE && issues.length === 0, colours, issues, flags }
}

/** Plain text, one line per card, the `4xOP09-004` form deck tools exchange; the leader first. */
export function exportDeckText(deck: Deck): string {
  const lines: string[] = []
  if (deck.leader) lines.push(`1x${deck.leader}`)
  for (const [n, q] of Object.entries(deck.cards).sort(([a], [b]) => a.localeCompare(b))) lines.push(`${q}x${n}`)
  return lines.join('\n')
}

/** Reads `4xOP09-004`, `4 OP09-004`, `4x OP09-004` or bare numbers (one copy); unknown lines are returned so the player can see them. */
export function parseDeckText(text: string): { entries: { cardNumber: string; qty: number }[]; unreadable: string[] } {
  const entries: { cardNumber: string; qty: number }[] = []
  const unreadable: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(?:(\d+)\s*x?\s*)?([A-Za-z]+\d{0,2}-\d{3})(?:p\d+)?\b/i)
    if (!m) {
      unreadable.push(line)
      continue
    }
    entries.push({ cardNumber: m[2].toUpperCase(), qty: m[1] ? Number(m[1]) : 1 })
  }
  return { entries, unreadable }
}
