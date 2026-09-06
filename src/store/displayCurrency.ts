/**
 * Portfolio display currency (5.4). Remembered. Default US $ so a first
 * visit matches the catalogue. Costs never convert; only the Portfolio
 * reading switches.
 */
const STORAGE_KEY = 'piecebook.displayCurrency.v1'

export type DisplayCurrency = 'usd' | 'sgd'

export function readDisplayCurrency(): DisplayCurrency {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'sgd' ? 'sgd' : 'usd'
  } catch {
    return 'usd'
  }
}

export function writeDisplayCurrency(value: DisplayCurrency): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Storage unavailable: the tab still works for this visit.
  }
}
