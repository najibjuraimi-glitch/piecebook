import { WIKI_ENTRIES, type WikiBirth, type WikiEntry } from '../data/wiki'

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
