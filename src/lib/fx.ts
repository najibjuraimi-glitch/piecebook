import { FX_USD_SGD } from '../data/fx'
import { formatDate, formatSgd, formatUsd } from './format'

/** SGD for a USD seed figure, 2 decimal places, from the dated official rate. Never invented. */
export function usdToSgd(usd: number, rate = FX_USD_SGD.rate): number {
  return Math.round(usd * rate * 100) / 100
}

export function formatMarket(usd: number, display: 'usd' | 'sgd'): string {
  return display === 'sgd' ? formatSgd(usdToSgd(usd)) : formatUsd(usd)
}

export function formatSignedMarket(usd: number, display: 'usd' | 'sgd'): string {
  const n = display === 'sgd' ? usdToSgd(usd) : usd
  const abs = display === 'sgd' ? formatSgd(Math.abs(n)) : formatUsd(Math.abs(n))
  if (n > 0) return `+${abs}`
  if (n < 0) return `−${abs}`
  return display === 'sgd' ? formatSgd(0) : formatUsd(0)
}

/** `S$1.2669 to US $1 · ECB · 4 Sep 2026` */
export function rateLine(fx = FX_USD_SGD): string {
  return `S$${fx.rate.toFixed(4)} to US $1 · ${fx.source} · ${formatDate(fx.asOf)}`
}
