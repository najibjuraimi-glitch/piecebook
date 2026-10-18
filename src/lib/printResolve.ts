/**
 * Print ids are `OP09-004` and `OP09-004p3`. A capital P is the same id.
 * A variant word such as `OP09-004 SP` is not an id. Holdings never price
 * from the sheet code. Watchlist rows store an id, or they are rejected.
 */

export interface PrintRow {
  cardNumber: string
  baseNumber: string
  variant: string
  rarity: string
  language: string
  /** Printed title from the seed. An event title is not the person. */
  name?: string
  setCode?: string
  /** Person on this print, when known. Liked flags read this, not the title. */
  character?: string
}

export interface WatchPrintFailure {
  ok: false
  error: 'ambiguous_print' | 'unknown_print'
  detail: string
  candidates: string[]
}

const PRINT = /[A-Za-z]{1,4}\d{0,3}-\d{3}(?:[pP]\d+)?/

export function canonicalPrintId(raw: string): string {
  return raw.toUpperCase().replace(/P(\d+)$/, 'p$1')
}

export function splitPrintCode(raw: string): { id: string; rest: string } | null {
  const text = raw.trim()
  const found = PRINT.exec(text)
  if (!found) return null
  const id = canonicalPrintId(found[0])
  const rest = `${text.slice(0, found.index)} ${text.slice(found.index + found[0].length)}`.replace(/[()]/g, ' ').trim()
  return { id, rest }
}

function norm(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function variantMatches(row: PrintRow, word: string): boolean {
  const variant = norm(row.variant)
  const rarity = row.rarity.trim().toUpperCase()
  const base = row.cardNumber.toUpperCase() === row.baseNumber.toUpperCase()
  const w = norm(word)
  if (['sp', 'special', 'special card'].includes(w)) return variant.includes('special') || rarity === 'SP'
  if (['manga', 'manga art'].includes(w)) return variant.includes('manga')
  if (['alt', 'aa', 'alternate', 'alternate art', 'alt art'].includes(w)) return variant.includes('alternate')
  if (w === 'parallel') return variant.includes('parallel')
  if (['box topper', 'boxtopper', 'topper'].includes(w)) return variant.includes('topper')
  if (['treasure', 'treasure rare', 'tr'].includes(w)) return variant.includes('treasure') || rarity === 'TR'
  if (['full art', 'fullart', 'fa'].includes(w)) return variant.includes('full art')
  if (['textured', 'textured foil'].includes(w)) return variant.includes('textured')
  if (['pirate', 'pirate foil'].includes(w)) return variant.includes('pirate')
  if (['base', 'regular', 'normal', 'non parallel'].includes(w)) return base
  return false
}

function family(rows: PrintRow[], id: string): PrintRow[] {
  const base = id.replace(/p\d+$/i, '').toUpperCase()
  return rows.filter((row) => row.baseNumber.toUpperCase() === base || row.cardNumber.toUpperCase() === base)
}

function findExact(rows: PrintRow[], id: string): PrintRow | undefined {
  const want = id.toUpperCase()
  return rows.find((row) => row.cardNumber.toUpperCase() === want)
}

/** An id with no leftover words, capital P accepted (`OP09-004P3` is `OP09-004p3`). */
export function exactPrintId(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const split = splitPrintCode(raw)
  if (!split || split.rest) return null
  return split.id
}

/** The one print a variant word names. Holdings do not use this for a stored price. */
export function resolveHoldingPrint(code: string, rows: PrintRow[]): PrintRow | null {
  const split = splitPrintCode(code)
  if (!split) return null
  if (!split.rest) return findExact(rows, split.id) ?? null
  const matched = family(rows, split.id).filter((row) => variantMatches(row, split.rest))
  return matched.length === 1 ? matched[0] : null
}

/**
 * Watchlist codes are print ids only. A variant word is rejected even when it
 * would match one print, and the error names the prints the caller can send.
 */
export function explainWatchCode(code: string, rows: PrintRow[]): { ok: true; print: PrintRow } | WatchPrintFailure {
  const split = splitPrintCode(code)
  if (!split) {
    return { ok: false, error: 'unknown_print', detail: `${code.trim() || 'That code'} is not a print id.`, candidates: [] }
  }
  const prints = family(rows, split.id)
  const numbers = prints.map((row) => row.cardNumber)
  if (split.rest) {
    const matched = prints.filter((row) => variantMatches(row, split.rest))
    const candidates = (matched.length ? matched : prints).map((row) => row.cardNumber)
    const listed = candidates.length ? candidates.join(', ') : 'none'
    return {
      ok: false,
      error: 'ambiguous_print',
      detail: `${code.trim()} is a variant word, not a print id. Send one of: ${listed}.`,
      candidates,
    }
  }
  const exact = findExact(rows, split.id)
  if (!exact) {
    const listed = numbers.length ? numbers.join(', ') : 'none'
    return {
      ok: false,
      error: 'unknown_print',
      detail: `${split.id} is not in the seed. Send one of: ${listed}.`,
      candidates: numbers,
    }
  }
  return { ok: true, print: exact }
}

export function parallelLabel(row: PrintRow): string | null {
  const variant = row.variant.trim()
  if (variant) return variant
  return null
}
