/**
 * Card-list marks from holdings. Sold rows are out. This does not read piecebook.v1.
 *
 * `exactPrint` equal to a print id marks that print "In your portfolio".
 * A bare code such as OP13-028 is not that print: with no exactPrint, every
 * print of the card number inside the code is "You own a version".
 */
import { printCode } from './boughtBook'
import { exactPrintId } from './printResolve'

export type PortfolioMark = 'exact' | 'version'

export interface MarkCopy {
  code: string
  status: string
  exactPrint?: string | null
}

export interface PortfolioIndex {
  exact: Set<string>
  /** Base card numbers, parallel suffix removed. */
  versions: Set<string>
}

const PRINT_ID = /^[A-Z]{1,4}\d{0,3}-\d{3}(?:p\d+)?$/

function baseOf(raw: string): string | null {
  const id = printCode(raw)
  if (!PRINT_ID.test(id)) return null
  return id.replace(/p\d+$/, '')
}

export function portfolioIndex(copies: MarkCopy[]): PortfolioIndex {
  const exact = new Set<string>()
  const versions = new Set<string>()
  for (const copy of copies) {
    if (copy.status.trim().toLowerCase() === 'sold') continue
    const id = exactPrintId(copy.exactPrint)
    if (id) {
      exact.add(id)
      continue
    }
    const base = baseOf(copy.code)
    if (base) versions.add(base)
  }
  return { exact, versions }
}

export function portfolioMark(index: PortfolioIndex, cardNumber: string): PortfolioMark | null {
  const id = printCode(cardNumber)
  if (!PRINT_ID.test(id)) return null
  if (index.exact.has(id)) return 'exact'
  const base = id.replace(/p\d+$/, '')
  if (index.versions.has(base)) return 'version'
  return null
}

/** Set-page and tile line. Exact prints are counted apart from version marks. */
export function portfolioCountLine(cards: { cardNumber: string }[], mark: (cardNumber: string) => PortfolioMark | null): string | null {
  let exact = 0
  let versions = 0
  for (const card of cards) {
    const kind = mark(card.cardNumber)
    if (kind === 'exact') exact += 1
    else if (kind === 'version') versions += 1
  }
  const parts: string[] = []
  if (exact > 0) parts.push(`${exact} in your portfolio`)
  if (versions > 0) parts.push(`${versions} you own a version`)
  return parts.length ? parts.join(' · ') : null
}
