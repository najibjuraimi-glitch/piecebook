/**
 * Prints whose official Limitless scan has no flat light front border.
 * The list is the scan, not the variant name: a "Full Art" or "SP" label
 * is not enough, and an SP that still has a light frame is not listed.
 */
import borderFile from '../../data/front-border.json'

export interface BorderlessPrint {
  cardNumber: string
  baseNumber: string
}

interface BorderFile {
  asOf: string
  source: string
  prints: BorderlessPrint[]
}

const data = borderFile as BorderFile

export const BORDERLESS_AS_OF = data.asOf
export const BORDERLESS_SOURCE = data.source

const byNumber = new Set(data.prints.map((p) => p.cardNumber.toUpperCase()))
const byBase = new Map<string, string[]>()
for (const print of data.prints) {
  const base = print.baseNumber.toUpperCase()
  const list = byBase.get(base) ?? []
  list.push(print.cardNumber)
  byBase.set(base, list)
}

export function isBorderlessCardNumber(cardNumber: string | null | undefined): boolean {
  if (!cardNumber) return false
  return byNumber.has(cardNumber.toUpperCase())
}

/**
 * True when the read names a print on the scan list.
 * An exact parallel number matches directly. A base number matches only with
 * an SP / special guess, and only when that base has exactly one borderless
 * print, so a framed copy of the same character is not treated as full art.
 */
export function identifyIsBorderless(identify: { set_code?: string | null; parallel_guess?: string | null } | null | undefined): boolean {
  const code = (identify?.set_code || '').toUpperCase().replace(/\s+/g, '')
  if (!code) return false
  if (byNumber.has(code)) return true
  const guess = (identify?.parallel_guess || '').toLowerCase()
  const sp = guess === 'sp' || guess.includes('special')
  if (!sp) return false
  return (byBase.get(code) ?? []).length === 1
}
