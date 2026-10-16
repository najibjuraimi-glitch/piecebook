/**
 * Portfolio display currency (5.4). Remembered. Default US $ so a first
 * visit matches the catalogue. Costs never convert; only the Portfolio
 * reading switches.
 */
import { readRaw, subscribeUserData, writeRaw } from './userData'

const STORAGE_KEY = 'piecebook.displayCurrency.v1'

export type DisplayCurrency = 'usd' | 'sgd'

export function readDisplayCurrency(): DisplayCurrency {
  return readRaw(STORAGE_KEY) === 'sgd' ? 'sgd' : 'usd'
}

export function writeDisplayCurrency(value: DisplayCurrency): void {
  // Storage unavailable returns false: the tab still works for this visit.
  writeRaw(STORAGE_KEY, value)
}

/** Fires when the cloud, an import or another tab changes the preference. */
export function subscribeDisplayCurrency(fn: (value: DisplayCurrency) => void): () => void {
  return subscribeUserData(STORAGE_KEY, () => fn(readDisplayCurrency()))
}
