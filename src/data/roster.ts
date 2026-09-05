import rosterSeed from '../../data/sets-roster-en.json'
import type { SealedProduct } from './sealed'

/**
 * One row of Cards' `data/sets-roster-en.json` (`{ asOf, note, sets: [...] }`):
 * every EN booster set Piecebook knows about, whether or not its card checklist
 * has been seeded yet. The roster decides membership on Sets home; the card
 * CSVs only decide depth.
 */
export type CardSeedStatus = 'ready' | 'pending'

export interface RosterSet {
  setCode: string
  setName: string
  language: string
  /** Sealed product the prices describe; `booster_box` throughout V1. */
  product: string
  /** ISO date YYYY-MM-DD; null when Cards has not supplied one. */
  enReleased: string | null
  cardSeedStatus: CardSeedStatus
  sgAskSgd: number | null
  /** Where Cards read `sgAskSgd` (e.g. a Carousell ask). Provenance only; never rendered. */
  sgSource: string | null
  usMarketUsd: number | null
  /** Where Cards read `usMarketUsd` (TCGPlayer product URL). Provenance only; never rendered as a link. */
  usSource: string | null
  /** Cards' free-text caveat on a price row, when they wrote one. */
  priceNote: string | null
  /**
   * Resolved local path under `public/box-art/`, or null. Cards may write the
   * literal `vendored` to mean "use the file already in the repo", which
   * resolves to `/box-art/{code}-{lang}-white.jpg`; anything that is not a
   * local path is treated as no art so nothing is ever hotlinked.
   */
  boxArtUrl: string | null
  /** Row date when Cards gives one, else the file-level `asOf`. */
  asOf: string | null
}

// Rows are read field-by-field through `text()` / `money()`, so optional
// columns Cards adds on some rows only (e.g. `priceNote`) need no schema change.
type Row = Partial<Record<keyof (typeof rosterSeed)['sets'][number] | 'priceNote' | 'sgSource', unknown>> & {
  setCode: string
}

const FILE_AS_OF: string | null = text(rosterSeed.asOf)
const ROWS: Row[] = Array.isArray(rosterSeed.sets) ? (rosterSeed.sets as Row[]) : []

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function money(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Local public/ paths are served under the app's base URL ("/" locally, "/piecebook/" on GitHub Pages). */
const PUBLIC_BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

function resolveBoxArt(setCode: string, language: string, raw: unknown): string | null {
  const value = text(raw)
  if (!value) return null
  if (value.startsWith('/')) return `${PUBLIC_BASE}${value}`
  if (value.toLowerCase() === 'vendored') {
    return `${PUBLIC_BASE}/box-art/${setCode.replace(/-/g, '').toLowerCase()}-${language.toLowerCase()}-white.jpg`
  }
  return null
}

function toRosterSet(row: Row): RosterSet {
  const language = text(row.language) ?? 'EN'
  return {
    setCode: row.setCode,
    setName: text(row.setName) ?? row.setCode,
    language,
    product: text(row.product) ?? 'booster_box',
    enReleased: text(row.enReleased),
    cardSeedStatus: row.cardSeedStatus === 'ready' ? 'ready' : 'pending',
    sgAskSgd: money(row.sgAskSgd),
    sgSource: text(row.sgSource),
    usMarketUsd: money(row.usMarketUsd),
    usSource: text(row.usSource),
    priceNote: text(row.priceNote),
    boxArtUrl: resolveBoxArt(row.setCode, language, row.boxArtUrl),
    asOf: text(row.asOf) ?? FILE_AS_OF,
  }
}

/** Roster in EN release order, oldest first. Rows without a date sort last, by code. */
export const ROSTER: RosterSet[] = ROWS.filter((r) => typeof r.setCode === 'string' && r.setCode.trim() !== '')
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
 * The EN booster box price row for a roster set, straight from the roster (the
 * single source of sealed prices since `sealed-seed.json` was folded into it on
 * 5 Sep 2026). Undefined when neither price is set, so the tile omits the block.
 */
export function rosterSealedProduct(set: RosterSet): SealedProduct | undefined {
  if (set.sgAskSgd === null && set.usMarketUsd === null) return undefined
  return {
    setCode: set.setCode,
    setName: set.setName,
    language: set.language,
    product: set.product,
    boxArtUrl: set.boxArtUrl,
    sgAskSgd: set.sgAskSgd,
    sgSource: set.sgSource,
    usMarketUsd: set.usMarketUsd,
    usSource: set.usSource,
    asOf: set.asOf,
  }
}
