/**
 * A card list marks a print when a held or listed copy's code is that print.
 * The sheet text is not resolved: `OP13-028 SP` does not mark `OP13-028`.
 * Sold rows are out. This does not read `piecebook.v1`.
 */

export function codesInBook(copies: { code: string; status: string }[]): Set<string> {
  const codes = new Set<string>()
  for (const copy of copies) {
    if (copy.status.trim().toLowerCase() === 'sold') continue
    const code = copy.code.trim().toUpperCase()
    if (code) codes.add(code)
  }
  return codes
}

export function codeInBook(codes: Set<string>, cardNumber: string): boolean {
  return codes.has(cardNumber.trim().toUpperCase())
}
