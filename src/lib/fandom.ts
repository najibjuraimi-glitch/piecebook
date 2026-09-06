import type { WikiBirth, WikiEntry } from '../data/wiki'

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
