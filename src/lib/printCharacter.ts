/**
 * The person a print depicts. Character and leader cards use the printed name.
 * An event title is not a person: OP14-118 "You'll Frighten Me..." is Boa.
 */
const TITLE_CHARACTER: Record<string, string> = {
  'OP14-118': 'Boa Hancock',
}

export function characterForPrint(cardNumber: string, name: string): string {
  const base = cardNumber.replace(/p\d+$/i, '').toUpperCase()
  return TITLE_CHARACTER[base] || name || ''
}
