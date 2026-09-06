import { ALL_CARDS, compareCardNumbers, type Card } from '../data/seed'
import { getWiki, WIKI_ENTRIES, type WikiBirth, type WikiEntry } from '../data/wiki'
import { todayIso } from './format'

/** UTC day number for an ISO date; used for Today's card and countdowns so a pin is timezone-stable. */
export function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

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

export function dayOf(iso: string): { month: number; day: number } {
  const [, m, d] = iso.split('-').map(Number)
  return { month: m, day: d }
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

/** True when the wiki title adds a family or later name the printed card does not carry (`Imu` → `Nerona Imu`). */
export function isNameReveal(entry: WikiEntry): boolean {
  const words = (s: string) => s.replace(/[."']/g, ' ').split(/\s+/).filter(Boolean)
  return words(entry.title).length > words(entry.name).length
}

/** The gated line we will print, or null when the title is a later-name reveal. */
export function visibleLine(entry: WikiEntry | undefined): string | null {
  if (!entry?.line || isNameReveal(entry)) return null
  return entry.line
}

/**
 * Last chapter of Arlong Park. A line whose debut is after this is safe on a
 * character page the reader opened, and not safe as a Sets-tab card of the day.
 */
export const EAST_BLUE_LAST_CHAPTER = 95

/**
 * Base prints whose printed name has a visible line. `maxDebut` keeps the
 * timeline pool inside a reader's finished arc (Arlong Park = 95). The
 * feature ships only at ≥100; the sample East Blue pool is four names.
 */
export function todaysCardPool({ maxDebut }: { maxDebut?: number } = {}): Card[] {
  return ALL_CARDS.filter((c) => {
    if (c.isParallel) return false
    const wiki = getWiki(c.name)
    if (!visibleLine(wiki)) return false
    if (maxDebut != null && (wiki?.debutChapter == null || wiki.debutChapter > maxDebut)) return false
    return true
  }).sort((a, b) => compareCardNumbers(a.cardNumber, b.cardNumber))
}

export const TODAYS_CARD_MIN_POOL = 100

export interface TodaysCardPick {
  card: Card
  wiki: WikiEntry
  poolSize: number
}

/** One base print for `iso`, days-since-epoch modulo the sorted pool. */
export function todaysCard(iso: string, opts: { maxDebut?: number } = {}): TodaysCardPick | null {
  const pool = todaysCardPool(opts)
  if (pool.length === 0) return null
  const card = pool[Math.abs(utcDay(iso)) % pool.length]
  const wiki = getWiki(card.name)
  if (!visibleLine(wiki) || !wiki) return null
  return { card, wiki, poolSize: pool.length }
}

/**
 * Last clause on an upcoming row: `in 75 days`, and `tomorrow` / `today` only
 * when the day is Bandai's. A TCGplayer US date never says today or tomorrow
 * (a shop clock it is not); on that day the clause is omitted.
 */
export function countdownPhrase(
  iso: string | null | undefined,
  today = todayIso(),
  { namedDay = true }: { namedDay?: boolean } = {},
): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const days = utcDay(iso) - utcDay(today)
  if (days < 0) return null
  if (!namedDay) return days === 0 ? null : `in ${days} day${days === 1 ? '' : 's'}`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}
