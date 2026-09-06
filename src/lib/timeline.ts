import { ROSTER, displayCode, displayName, type RosterSet } from '../data/roster'
import { getSetIntro } from '../data/intros'
import { formatDate, todayIso } from './format'

/**
 * One row of the release timeline (7.2): a booster, extra booster or premium
 * booster in English release order, with both dates and the JP title. Starter
 * decks are not on it, and neither are prices or stories.
 */
export interface TimelineRow {
  set: RosterSet
  /** The code where it is confirmed; null while the refresh's sequence guess stands (never displayed). */
  code: string | null
  name: string
  /** Bandai's EN date from the intro when it has one, else the roster's. */
  enReleased: string | null
  /** True when the EN date is TCGplayer's US date (a set the refresh found on TCGCSV, with no Bandai day yet). */
  usDate: boolean
  jpReleased: string | null
  jpName: string | null
  /** True when the EN date is still ahead of today. */
  upcoming: boolean
}

export interface TimelineYear {
  year: string
  rows: TimelineRow[]
}

/** Every booster on the roster, oldest EN release first (the roster is already in that order). */
export function timelineRows(today = todayIso()): TimelineRow[] {
  return ROSTER.filter((s) => s.product !== 'starter_deck').map((set) => {
    const intro = getSetIntro(set.setCode, set.language)
    const enReleased = intro?.enReleased ?? set.enReleased ?? null
    return {
      set,
      code: displayCode(set),
      name: displayName(set),
      enReleased,
      // Cards' own rows carry Bandai's dates; a row the refresh added from TCGCSV carries TCGplayer's until an intro gives Bandai's.
      usDate: !intro?.enReleased && set.codeSource !== 'limitless',
      jpReleased: intro?.jpReleased ?? null,
      jpName: intro?.jpName ?? null,
      upcoming: enReleased !== null && enReleased > today,
    }
  })
}

/** Rows grouped under their EN release year, in order; a row with no date files under "Undated". */
export function groupByYear(rows: TimelineRow[]): TimelineYear[] {
  const years: TimelineYear[] = []
  for (const row of rows) {
    const year = row.enReleased ? row.enReleased.slice(0, 4) : 'Undated'
    const last = years[years.length - 1]
    if (last && last.year === year) last.rows.push(row)
    else years.push({ year, rows: [row] })
  }
  return years
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Whole calendar months from `from` to `to` (negative when `to` is earlier); the day of month must be reached for a month to count. */
export function wholeMonthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  let months = (ty - fy) * 12 + (tm - fm)
  if (months > 0 && td < fd) months -= 1
  if (months < 0 && td > fd) months += 1
  return months
}

/**
 * The gap between the JP and EN releases, as a phrase that qualifies the EN
 * date: `4 months later`, `13 days later`, `15 days earlier`, `same day`. Days
 * are used under a whole month; the phrase is empty when either date is missing.
 */
export function gapPhrase(jpReleased: string | null, enReleased: string | null): string | null {
  if (!jpReleased || !enReleased) return null
  if (jpReleased === enReleased) return 'same day'
  const months = wholeMonthsBetween(jpReleased, enReleased)
  if (Math.abs(months) >= 1) {
    const n = Math.abs(months)
    return `${n} ${n === 1 ? 'month' : 'months'} ${months > 0 ? 'later' : 'earlier'}`
  }
  const days = utcDay(enReleased) - utcDay(jpReleased)
  const n = Math.abs(days)
  return `${n} ${n === 1 ? 'day' : 'days'} ${days > 0 ? 'later' : 'earlier'}`
}

/**
 * The row's second line, in ink: `JP 4 Nov 2022 · EN 10 Mar 2023 · 4 months
 * later`; for a set still ahead whose day is TCGplayer's, `US date 20 Nov 2026`
 * (not `EN … · US date`). The countdown is appended by the row, not here.
 * Each clause is a separate string so the row can keep them from breaking
 * mid-date.
 */
export function dateClauses(row: TimelineRow): string[] {
  const clauses: string[] = []
  if (row.jpReleased) clauses.push(`JP ${formatDate(row.jpReleased)}`)
  if (row.enReleased) clauses.push(row.usDate ? `US date ${formatDate(row.enReleased)}` : `EN ${formatDate(row.enReleased)}`)
  if (!row.usDate) {
    const gap = gapPhrase(row.jpReleased, row.enReleased)
    if (gap) clauses.push(gap)
  }
  return clauses
}
