import rosterSeed from '../../data/sets-roster-en.json'
import { getSealedProduct, type SealedProduct } from './sealed'

/**
 * One row of Cards' `data/sets-roster-en.json`: every EN booster set Piecebook
 * knows about, whether or not its card checklist has been seeded yet. The
 * roster decides membership on Sets home; the card CSVs only decide depth.
 */
export type CardSeedStatus = 'ready' | 'pending'

export interface RosterSet {
  setCode: string
  setName: string
  language: string
  /** ISO date YYYY-MM-DD; null when Cards has not supplied one. */
  enReleased: string | null
  cardSeedStatus: CardSeedStatus
  sgAskSgd: number | null
  usMarketUsd: number | null
  /**
   * Resolved local path under `public/box-art/`, or null. Cards may write the
   * literal `vendored` to mean "use the file already in the repo"; anything
   * that is not a local path is treated as no art so nothing is ever hotlinked.
   */
  boxArtUrl: string | null
  asOf: string | null
}

type Row = Partial<(typeof rosterSeed)[number]> & { setCode: string }

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function money(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function resolveBoxArt(setCode: string, language: string, raw: unknown): string | null {
  const value = text(raw)
  if (!value) return null
  if (value.startsWith('/')) return value
  if (value.toLowerCase() === 'vendored') return getSealedProduct(setCode, language)?.boxArtUrl ?? null
  return null
}

function toRosterSet(row: Row): RosterSet {
  const language = text(row.language) ?? 'EN'
  return {
    setCode: row.setCode,
    setName: text(row.setName) ?? row.setCode,
    language,
    enReleased: text(row.enReleased),
    cardSeedStatus: row.cardSeedStatus === 'ready' ? 'ready' : 'pending',
    sgAskSgd: money(row.sgAskSgd),
    usMarketUsd: money(row.usMarketUsd),
    boxArtUrl: resolveBoxArt(row.setCode, language, row.boxArtUrl),
    asOf: text(row.asOf),
  }
}

/** Roster in EN release order, oldest first. Rows without a date sort last, by code. */
export const ROSTER: RosterSet[] = (rosterSeed as Row[])
  .filter((r) => typeof r.setCode === 'string' && r.setCode.trim() !== '')
  .map(toRosterSet)
  .sort((a, b) => {
    if (a.enReleased && b.enReleased && a.enReleased !== b.enReleased) return a.enReleased.localeCompare(b.enReleased)
    if (a.enReleased && !b.enReleased) return -1
    if (!a.enReleased && b.enReleased) return 1
    return a.setCode.localeCompare(b.setCode)
  })

export function getRosterSet(setCode: string | undefined): RosterSet | undefined {
  if (!setCode) return undefined
  const lower = setCode.toLowerCase()
  return ROSTER.find((s) => s.setCode.toLowerCase() === lower)
}

/**
 * The EN booster box price row for a roster set. Cards' `sealed-seed.json` row
 * wins when present (it carries sources); otherwise the roster's own prices are
 * used. Undefined when neither has a price, so the tile omits the block.
 */
export function rosterSealedProduct(set: RosterSet): SealedProduct | undefined {
  const seeded = getSealedProduct(set.setCode, set.language)
  if (seeded && (seeded.sgAskSgd !== null || seeded.usMarketUsd !== null)) return seeded
  if (set.sgAskSgd === null && set.usMarketUsd === null) return undefined
  return {
    setCode: set.setCode,
    setName: set.setName,
    language: set.language,
    product: 'booster_box',
    boxArtUrl: set.boxArtUrl,
    sgAskSgd: set.sgAskSgd,
    sgSource: null,
    usMarketUsd: set.usMarketUsd,
    usSource: null,
    asOf: set.asOf,
  }
}
