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

export interface DeckIssue {
  /** One sentence a player can act on. */
  text: string
  cards?: string[]
}

export interface DeckCheck {
  count: number
  complete: boolean
  /** Leader colours, e.g. ["Red"] or ["Red", "Green"]; empty without a leader or its attributes. */
  colours: string[]
  issues: DeckIssue[]
  /** Standard / Extra legality of the whole list, null while attributes are loading. */
  standard: boolean | null
  extra: boolean | null
  notStandard: string[]
}

export function splitColours(colour: string): string[] {
  return colour.split('/').map((c) => c.trim()).filter(Boolean)
}

export function deckCount(deck: Deck): number {
  return Object.values(deck.cards).reduce((n, q) => n + q, 0)
}

/**
 * Everything wrong with a list, in words: size, copies over four, cards outside
 * the leader's colours, a leader in the fifty, and Bandai's legality as Limitless
 * publishes it. Nothing is guessed: a card whose attributes are missing is skipped.
 */
export function checkDeck(deck: Deck, attrs: Map<string, CardAttributes> | null): DeckCheck {
  const count = deckCount(deck)
  const issues: DeckIssue[] = []
  const leaderAttrs = deck.leader && attrs ? attrs.get(deck.leader) : undefined
  const colours = leaderAttrs ? splitColours(leaderAttrs.color) : []

  if (!deck.leader) issues.push({ text: 'No leader yet.' })
  if (count < DECK_SIZE) issues.push({ text: `${DECK_SIZE - count} more ${DECK_SIZE - count === 1 ? 'card' : 'cards'} to reach ${DECK_SIZE}.` })
  if (count > DECK_SIZE) issues.push({ text: `${count - DECK_SIZE} over ${DECK_SIZE}.` })

  const over = Object.entries(deck.cards).filter(([, q]) => q > MAX_COPIES)
  for (const [n, q] of over) issues.push({ text: `${q} copies of ${n}; a deck runs ${MAX_COPIES} at most.`, cards: [n] })

  if (attrs) {
    const leadersInList = Object.keys(deck.cards).filter((n) => attrs.get(n)?.category === 'Leader')
    if (leadersInList.length) issues.push({ text: `${leadersInList.join(', ')} ${leadersInList.length === 1 ? 'is a leader' : 'are leaders'} and cannot sit in the fifty.`, cards: leadersInList })

    if (colours.length) {
      const outside = Object.keys(deck.cards).filter((n) => {
        const a = attrs.get(n)
        return a && a.color && !splitColours(a.color).some((c) => colours.includes(c))
      })
      if (outside.length) issues.push({ text: `${outside.length} ${outside.length === 1 ? 'card is' : 'cards are'} outside ${colours.join(' / ')}: ${outside.join(', ')}.`, cards: outside })
    }
  }

  let standard: boolean | null = null
  let extra: boolean | null = null
  const notStandard: string[] = []
  if (attrs) {
    const all = [...(deck.leader ? [deck.leader] : []), ...Object.keys(deck.cards)]
    const known = all.map((n) => attrs.get(n)).filter((a): a is CardAttributes => a !== undefined)
    if (known.length === all.length && all.length > 0) {
      for (const a of known) if (a.standard === 'not legal') notStandard.push(a.cardNumber)
      standard = notStandard.length === 0 && known.every((a) => a.standard === 'legal')
      extra = known.every((a) => a.extra === 'legal')
    }
  }

  return { count, complete: count === DECK_SIZE && issues.length === 0, colours, issues, standard, extra, notStandard }
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
