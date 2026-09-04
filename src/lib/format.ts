const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatUsd(value: number): string {
  return usd.format(value)
}

export function formatSignedUsd(value: number): string {
  if (value > 0) return `+${usd.format(value)}`
  if (value < 0) return `−${usd.format(Math.abs(value))}`
  return usd.format(0)
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Formats an ISO date (YYYY-MM-DD) for display without timezone drift. */
export function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return dateFmt.format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
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
