import { ALL_CARDS, compareCardNumbers, type Card } from '../data/seed'
import { getWiki, WIKI_ENTRIES, type WikiBirth, type WikiEntry } from '../data/wiki'
import { todayIso } from './format'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** UTC day number for an ISO date; used for Today's card and countdowns so a pin is timezone-stable. */
export function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

export function parsePinDate(raw: string | null | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [y, m, d] = raw.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return raw
}

export function dayOf(iso: string): { month: number; day: number } {
  const [, m, d] = iso.split('-').map(Number)
  return { month: m, day: d }
}

/** `9 March` — the character-page birthday, day then the full month, no year. */
export function bornLabel(birth: WikiBirth): string {
  return `${birth.day} ${MONTHS_LONG[birth.month - 1]}`
}

/** `9 Mar` — the On This Day date, same short month as every other Piecebook date. */
export function shortDayLabel(birth: WikiBirth): string {
  return `${birth.day} ${MONTHS_SHORT[birth.month - 1]}`
}

/** Always `'s`, including names that already end in s (`Shanks's`). */
export function possessive(name: string): string {
  return `${name}'s`
}

export interface OnThisDayName {
  name: string
  label: string
}

export interface OnThisDay {
  dateLabel: string
  names: OnThisDayName[]
}

const ON_THIS_DAY_CAP = 3

/**
 * Birthdays on a calendar day, at most three names, A–Z by the printed name.
 * Empty when the cache has no birthday that day.
 */
export function onThisDay(iso: string): OnThisDay | null {
  const { month, day } = dayOf(iso)
  const names = WIKI_ENTRIES.filter((e) => e.birth && e.birth.month === month && e.birth.day === day)
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, ON_THIS_DAY_CAP)
    .map((name) => ({ name, label: `${possessive(name)} birthday` }))
  if (names.length === 0) return null
  const first = WIKI_ENTRIES.find((e) => e.birth && e.birth.month === month && e.birth.day === day)!
  return { dateLabel: shortDayLabel(first.birth!), names }
}

/**
 * Base prints whose printed name has a passing wiki line, sorted by card
 * number so the day's pick is the same for everyone. The feature ships only
 * when this pool is at least 100; the helper still returns the smaller pool
 * so a draft can say how short it is.
 */
export function todaysCardPool(): Card[] {
  return ALL_CARDS.filter((c) => !c.isParallel && Boolean(getWiki(c.name)?.line)).sort((a, b) =>
    compareCardNumbers(a.cardNumber, b.cardNumber),
  )
}

export const TODAYS_CARD_MIN_POOL = 100

export interface TodaysCardPick {
  card: Card
  wiki: WikiEntry
  poolSize: number
}

/** One base print for `iso`, `days-since-epoch modulo the sorted pool`. */
export function todaysCard(iso: string): TodaysCardPick | null {
  const pool = todaysCardPool()
  if (pool.length === 0) return null
  const card = pool[Math.abs(utcDay(iso)) % pool.length]
  const wiki = getWiki(card.name)
  if (!wiki?.line) return null
  return { card, wiki, poolSize: pool.length }
}

/**
 * Last clause on an upcoming row: `in 75 days` / `tomorrow` / `today`.
 * Null when there is no calendar day (Bandai gave only a month) or the day is past.
 */
export function countdownPhrase(iso: string | null | undefined, today = todayIso()): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const days = utcDay(iso) - utcDay(today)
  if (days < 0) return null
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}
