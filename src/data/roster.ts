import rosterSeed from '../../data/sets-roster-en.json'
import { latestBoxPrice } from './boxPrices'
import type { SealedProduct } from './sealed'
import { formatDate, todayIso } from '../lib/format'

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
  /**
   * True while the set code is the refresh's guess by sequence (7.5): TCGCSV
   * names carry no code, so an upcoming set is OP‑nn / EB‑nn "next" until
   * Limitless lists it. A provisional code is never displayed.
   */
  codeProvisional: boolean
  sgAskSgd: number | null
  /** Where Cards read `sgAskSgd` (e.g. a Carousell ask). Provenance only; never rendered. */
  sgSource: string | null
  usMarketUsd: number | null
  /** Where Cards read `usMarketUsd` (TCGPlayer product URL). Provenance only; never rendered as a link. */
  usSource: string | null
  /** Cards' free-text caveat on a price row, when they wrote one. */
  priceNote: string | null
  /**
   * Box image for the tile: TCGplayer's official product render when the row
   * has a `tcgplayerProductId` (every EN box, 3.3), else a local path Cards
   * wrote (`/…` or the literal `vendored`), else null for type-first.
   */
  boxArtUrl: string | null
  /** TCGplayer product id of the EN booster box (the key for the daily TCGCSV feed); null when there is no EN box. */
  tcgplayerProductId: number | null
  /** Row date when Cards gives one, else the file-level `asOf`. */
  asOf: string | null
}

/**
 * TCGplayer's official product render for a box (Bandai's display-box image),
 * served from TCGplayer's CDN like card art is served from Limitless's.
 * `400w` for tiles, `in_1000x1000` for the box card.
 */
export function boxImageUrl(productId: number, size: '400w' | 'in_1000x1000' = '400w'): string {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_${size}.jpg`
}

// Rows are read field-by-field through `text()` / `money()`, so optional
// columns Cards adds on some rows only (e.g. `priceNote`) need no schema change.
type Row = Partial<
  Record<keyof (typeof rosterSeed)['sets'][number] | 'priceNote' | 'sgSource' | 'tcgplayerProductId' | 'codeProvisional', unknown>
> & {
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
  const productId = typeof row.tcgplayerProductId === 'number' && row.tcgplayerProductId > 0 ? row.tcgplayerProductId : null
  return {
    setCode: row.setCode,
    setName: text(row.setName) ?? row.setCode,
    language,
    product: text(row.product) ?? 'booster_box',
    enReleased: text(row.enReleased),
    cardSeedStatus: row.cardSeedStatus === 'ready' ? 'ready' : 'pending',
    codeProvisional: row.codeProvisional === true,
    sgAskSgd: money(row.sgAskSgd),
    sgSource: text(row.sgSource),
    usMarketUsd: money(row.usMarketUsd),
    usSource: text(row.usSource),
    priceNote: text(row.priceNote),
    // The official TCGplayer render for every box (3.3); a local path only for a row with no product id.
    boxArtUrl: productId ? boxImageUrl(productId, '400w') : resolveBoxArt(row.setCode, language, row.boxArtUrl),
    tcgplayerProductId: productId,
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
 * An upcoming booster (7.5): on the roster from TCGCSV's presale listing, no
 * checklist yet because Limitless has not listed the set. Tiles and the set
 * page show its name, date and pre-order market instead of cards.
 */
export function isUpcoming(set: RosterSet): boolean {
  return set.cardSeedStatus === 'pending' && set.product === 'booster_box'
}

/** Every upcoming booster in release order (the roster is already date-sorted). */
export const UPCOMING: RosterSet[] = ROSTER.filter(isUpcoming)

/**
 * The one date line an upcoming set carries: `Coming 20 Nov 2026` until the
 * day, `Released 20 Nov 2026 · checklist soon` once it has passed and Limitless
 * still has not listed it. Null when the roster has no date.
 */
export function comingLine(set: RosterSet): string | null {
  if (!set.enReleased) return null
  return set.enReleased >= todayIso() ? `Coming ${formatDate(set.enReleased)}` : `Released ${formatDate(set.enReleased)} · checklist soon`
}

/**
 * How a roster set is named in the UI: its code where the code is real, its
 * name alone while the code is the refresh's guess. Never a provisional code.
 */
export function displayCode(set: RosterSet): string | null {
  return set.codeProvisional ? null : set.setCode
}

/**
 * The EN booster box price row for a roster set. The US market figure and its
 * date come from the daily TCGCSV feed (`data/box-price-history.csv`, newest
 * row) and fall back to the roster's own read when the feed has no row for the
 * set; the SG ask is the roster's. Undefined when there is no price at all, so
 * the tile omits the block.
 */
export function rosterSealedProduct(set: RosterSet): SealedProduct | undefined {
  const feed = latestBoxPrice(set.setCode)
  const usMarketUsd = feed?.marketUsd ?? set.usMarketUsd
  if (set.sgAskSgd === null && usMarketUsd === null) return undefined
  return {
    setCode: set.setCode,
    setName: set.setName,
    language: set.language,
    product: set.product,
    boxArtUrl: set.boxArtUrl,
    // The SG ask has no automated source and is not shown (3.2); the roster keeps the field as provenance.
    sgAskSgd: null,
    sgSource: set.sgSource,
    usMarketUsd,
    usSource: set.usSource,
    asOf: feed?.asOf ?? set.asOf,
  }
}
