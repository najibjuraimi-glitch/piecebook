const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatUsd(value: number): string {
  return usd.format(value)
}

/** US market price with an explicit country prefix, e.g. "US $669.52", for use beside an SGD figure. */
export function formatUsMarketUsd(value: number): string {
  return `US ${usd.format(value)}`
}

const sgdWhole = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 })
const sgdCents = new Intl.NumberFormat('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Singapore dollars as "S$750" for whole amounts, "S$749.50" otherwise. */
export function formatSgd(value: number): string {
  const fmt = Number.isInteger(value) ? sgdWhole : sgdCents
  return `S$${fmt.format(value)}`
}

export function formatSignedUsd(value: number): string {
  if (value > 0) return `+${usd.format(value)}`
  if (value < 0) return `−${usd.format(Math.abs(value))}`
  return usd.format(0)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Formats an ISO date (YYYY-MM-DD) as "4 Sep 2026" without timezone drift. */
export function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const month = MONTHS[Number(m[2]) - 1]
  if (!month) return iso
  return `${Number(m[3])} ${month} ${m[1]}`
}

export function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function pluralCards(n: number): string {
  return `${n} ${n === 1 ? 'card' : 'cards'}`
}
