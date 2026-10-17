/**
 * One plain shape for a centering measurement, shared by the /pregrade
 * screens, the prediction log and the Worker's /check answer. The pixels are
 * read on the phone (src/lib/centering.ts); this file only turns a result into
 * words and validates the same shape when it arrives over the wire.
 * Centering can rule a PSA 10 out. It never confirms one.
 */
import {
  BACK_TEN_MAX,
  FRONT_TEN_MAX,
  MIN_PRINT_BORDER_PX,
  MIN_SHORT_SIDE_PX,
  listSides,
  measureFromBorders,
  type EdgeName,
  type PhotoResult,
  type PhotoSide,
  type RejectCode,
} from './centering'

export type UnmeasuredReason = RejectCode | 'unreadable' | 'not_sent' | 'full-art'

/**
 * A measured side always has a resolved print edge on all four borders. A
 * card that was found but whose print edge was not read is `UnmeasuredCentering`
 * with reason `no-print-edge`: a 50/50 from an unresolved edge is not a measurement.
 */
export interface MeasuredCentering {
  side: PhotoSide
  measured: true
  /** Border widths in pixels of the measured image. */
  left: number
  right: number
  top: number
  bottom: number
  /** `55/45`: left share, then right share. The two numbers sum to 100. */
  leftRight: string
  /** `48/52`: top share, then bottom share. The two numbers sum to 100. */
  topBottom: string
  resolved: true
  cannotBeTen: boolean
  /** Short side of the photo, in pixels, when the measurement knows it. */
  shortSide?: number
  /** Per-side width or why that side was not a border. Shown on the result, not sent as the grade. */
  detail?: string
}

export interface UnmeasuredCentering {
  side: PhotoSide
  measured: false
  reason: UnmeasuredReason
  note: string
  /** Short side of the photo, in pixels, when the measurement knows it. */
  shortSide?: number
  /** Per-side width or why that side was not a border. Shown on the result, not sent as the grade. */
  detail?: string
  /**
   * A real problem with the front photo (angle, size, a hand) on a borderless
   * print. Centering ignores it — that side has no border — and the other
   * parts still lower their confidence.
   */
  photoProblem?: string
}

export type PhotoCentering = MeasuredCentering | UnmeasuredCentering

export interface CenteringSummary {
  /** `device`: measured on the phone that took the photos. `none`: nothing was measured. */
  source: 'device' | 'none'
  front: PhotoCentering | null
  back: PhotoCentering | null
  cannotBeTen: boolean
  /** One sentence: ruled out, not ruled out, or not measured. */
  verdict: string
  /** The verdict, then anything that could not be measured. */
  note: string
  limits: { front: string; back: string }
}

const REJECT_CODES: readonly string[] = ['short-side', 'cut-off', 'angled', 'no-card', 'no-print-edge', 'holder', 'sleeve', 'hand']
const REASONS: readonly string[] = [...REJECT_CODES, 'unreadable', 'not_sent', 'full-art']
const MAX_BORDER_PX = 20_000
const MAX_NOTE = 160

export const CENTERING_LIMITS = { front: `${FRONT_TEN_MAX}/${100 - FRONT_TEN_MAX}`, back: `${BACK_TEN_MAX}/${100 - BACK_TEN_MAX}` }

/** The front of a borderless print has no print border to read. This is not an edge failure. */
export const FULL_ART_NOTE = 'Front centering not applicable (full art)'

export function fullArtFront(): UnmeasuredCentering {
  return { side: 'front', measured: false, reason: 'full-art', note: FULL_ART_NOTE }
}

/**
 * Drop a front measurement when seed metadata says this print has no front
 * border. A border the scan invented on full-bleed art is not a centering read.
 */
const FRONT_PHOTO_PROBLEM: Partial<Record<UnmeasuredReason, string>> = {
  'short-side': `front photo under ${MIN_SHORT_SIDE_PX}px`,
  angled: 'front photo angled',
  'no-card': 'front card outline not found',
  'cut-off': 'front card cut off at the frame',
  holder: 'front photo shows a holder or stand',
  sleeve: 'front photo shows a sleeve',
  hand: 'front photo shows a hand on the card',
  unreadable: 'front photo could not be measured',
}

export function withFullArtFront(front: PhotoCentering | null, borderless: boolean): PhotoCentering | null {
  if (!borderless) return front
  const next = fullArtFront()
  if (front?.shortSide) next.shortSide = front.shortSide
  if (front && !front.measured) {
    const problem = FRONT_PHOTO_PROBLEM[front.reason]
    if (problem) {
      next.photoProblem = problem
      next.note = `${FULL_ART_NOTE}. ${front.note}`
    }
  }
  return next
}

export const WORKER_NOT_MEASURED_NOTE =
  'Centering was not measured. The Worker does not read pixels; the app measures on the phone and sends it with the photos. ' +
  'Send `centering` with the request (border pixels per side) or run src/lib/centering.ts on the photos.'

function sideWord(side: PhotoSide): string {
  return side === 'front' ? 'Front' : 'Back'
}

/** `Front: card found, but no print border could be read on the right and bottom. Nothing ruled out.` */
export function noPrintEdgeNote(side: PhotoSide, sides?: readonly EdgeName[]): string {
  const where = sides && sides.length > 0 && sides.length < 4 ? ` on the ${listSides(sides)}` : ''
  return `${sideWord(side)}: card found, but no print border could be read${where}. Nothing ruled out.`
}

/**
 * Borders to a measurement, or "not measured" when a border is thinner than
 * the print-edge floor: the scan fired on edge noise and the ratio means nothing.
 */
export function centeringFromBorders(
  side: PhotoSide,
  left: number,
  right: number,
  top: number,
  bottom: number,
  unresolvedSides?: readonly EdgeName[],
): PhotoCentering {
  const m = measureFromBorders(left, right, top, bottom, side)
  if (!m.resolved) {
    const thin = unresolvedSides?.length
      ? unresolvedSides
      : (['left', 'right', 'top', 'bottom'] as const).filter((n) => !(m[n] >= MIN_PRINT_BORDER_PX))
    return unmeasured(side, 'no-print-edge', noPrintEdgeNote(side, thin))
  }
  return {
    side,
    measured: true,
    left,
    right,
    top,
    bottom,
    leftRight: m.lr.label,
    topBottom: m.tb.label,
    resolved: true,
    cannotBeTen: m.cannotBeTen,
  }
}

export function unmeasured(side: PhotoSide, reason: UnmeasuredReason, note?: string): UnmeasuredCentering {
  const text =
    note ??
    (reason === 'not_sent'
      ? `${sideWord(side)}: no photo.`
      : reason === 'unreadable'
        ? `${sideWord(side)}: the photo could not be read.`
        : reason === 'short-side'
          ? `${sideWord(side)}: short side under ${MIN_SHORT_SIDE_PX}px.`
          : reason === 'no-print-edge'
            ? noPrintEdgeNote(side)
            : reason === 'full-art'
              ? FULL_ART_NOTE
              : reason === 'holder'
                ? 'Centering not measurable from these photos. A magnetic holder or stand covers the card edge.'
                : reason === 'sleeve'
                  ? 'Centering not measurable from these photos. A sleeve covers the card edge.'
                  : reason === 'hand'
                    ? 'Centering not measurable from these photos. A hand covers the card edge.'
                    : `${sideWord(side)}: could not measure (${reason}).`)
  return { side, measured: false, reason, note: text.slice(0, MAX_NOTE) }
}

/** `left 36px on 14/21 · top: band not flat (8/21)`. Empty when the measure named no sides. */
export function edgeDetail(notes: Partial<Record<EdgeName, string>> | undefined): string | undefined {
  if (!notes) return undefined
  const text = (['left', 'right', 'top', 'bottom'] as const)
    .map((s) => (notes[s] ? `${s}: ${notes[s]}` : ''))
    .filter(Boolean)
    .join(' · ')
  return text || undefined
}

function shortSideOf(result: PhotoResult): number | undefined {
  if (!result.ok) {
    if (result.code !== 'short-side') return undefined
    const m = /(\d+)px/.exec(result.message)
    return m ? Number(m[1]) : undefined
  }
  const w = result.measure.imageWidth
  const h = result.measure.imageHeight
  if (!w || !h) return undefined
  return Math.min(w, h)
}

/** From a live measurement on the phone. */
export function photoCentering(result: PhotoResult | null, side: PhotoSide): PhotoCentering | null {
  if (!result) return null
  const shortSide = shortSideOf(result)
  if (!result.ok) {
    const u = unmeasured(side, result.code, result.message)
    return shortSide ? { ...u, shortSide } : u
  }
  const m = result.measure
  const detail = edgeDetail(m.edgeNotes)
  if (!m.resolved) {
    const u = unmeasured(side, 'no-print-edge', noPrintEdgeNote(side, m.unresolvedSides))
    return { ...u, ...(detail ? { detail } : {}), ...(shortSide ? { shortSide } : {}) }
  }
  const c = centeringFromBorders(side, m.left, m.right, m.top, m.bottom)
  if (!c.measured) return shortSide ? { ...c, shortSide } : c
  return { ...c, ...(detail ? { detail } : {}), ...(shortSide ? { shortSide } : {}) }
}

/** Border pixels from an older pre-grade row. The card page no longer reopens those rows. */
export function photoCenteringFromStored(photo: {
  side: PhotoSide
  reject?: { code: RejectCode; message: string }
  centering?: { left: number; right: number; top: number; bottom: number; unresolvedSides?: EdgeName[] }
}): PhotoCentering | null {
  if (photo.reject) return unmeasured(photo.side, photo.reject.code, photo.reject.message)
  if (!photo.centering) return null
  const c = photo.centering
  return centeringFromBorders(photo.side, c.left, c.right, c.top, c.bottom, c.unresolvedSides)
}

function finiteBorder(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  if (!Number.isFinite(n) || n < 0 || n > MAX_BORDER_PX) return null
  return Math.round(n * 100) / 100
}

/**
 * Validate one side as it arrives over the wire. Ratios and the rule-out are
 * recomputed from the border pixels, so a caller cannot send `cannotBeTen`
 * on its own. Anything malformed is dropped (null), never guessed.
 */
export function parsePhotoCentering(raw: unknown, side: PhotoSide): PhotoCentering | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.side !== undefined && r.side !== side) return null
  if (r.measured === false) {
    const reason = typeof r.reason === 'string' && REASONS.includes(r.reason) ? (r.reason as UnmeasuredReason) : null
    if (!reason) return null
    return unmeasured(side, reason, typeof r.note === 'string' && r.note.trim() ? r.note.trim() : undefined)
  }
  const left = finiteBorder(r.left)
  const right = finiteBorder(r.right)
  const top = finiteBorder(r.top)
  const bottom = finiteBorder(r.bottom)
  if (left == null || right == null || top == null || bottom == null) return null
  const c = centeringFromBorders(side, left, right, top, bottom)
  const shortSide = finiteBorder(r.shortSide)
  return shortSide && shortSide > 0 ? { ...c, shortSide } : c
}

/** `Front 55/45 left to right · 48/52 top to bottom`, or the reason it was not measured. */
export function centeringLine(c: PhotoCentering | null, side: PhotoSide): string {
  if (!c) return `${sideWord(side)}: no photo.`
  if (!c.measured) return c.note
  const base = `${sideWord(side)} ${c.leftRight} left to right · ${c.topBottom} top to bottom`
  return c.cannotBeTen ? `${base} · over ${CENTERING_LIMITS[side]}, cannot be a 10` : base
}

function overLine(c: MeasuredCentering): string {
  const m = measureFromBorders(c.left, c.right, c.top, c.bottom, c.side)
  const axis = m.worseAxis === 'lr' ? 'left to right' : 'top to bottom'
  return `${sideWord(c.side).toLowerCase()} ${m.worse.label} ${axis} is over ${CENTERING_LIMITS[c.side]}`
}

export function summariseCentering(front: PhotoCentering | null, back: PhotoCentering | null, source: 'device' | 'none' = 'device'): CenteringSummary {
  const sides = [front, back].filter((c): c is PhotoCentering => c != null)
  const over = sides.filter((c): c is MeasuredCentering => c.measured && c.cannotBeTen)
  const measured = sides.some((c) => c.measured)
  const frontFullArt = Boolean(front && !front.measured && front.reason === 'full-art')
  const backMeasured = Boolean(back && back.measured)
  const parts: string[] = []
  if (over.length) parts.push(`Cannot be a 10 by centering: ${over.map(overLine).join('; ')}.`)
  else if (frontFullArt && backMeasured) parts.push('Centering does not rule a 10 out. From the back only.')
  else if (measured) parts.push('Centering does not rule a 10 out.')
  else if (source === 'none' || sides.length === 0) parts.push(WORKER_NOT_MEASURED_NOTE)
  else parts.push('Centering was not measured.')
  for (const c of sides) {
    if (!c.measured) parts.push(c.note)
  }
  return {
    source: sides.length ? source : 'none',
    front,
    back,
    cannotBeTen: over.length > 0,
    verdict: parts[0],
    note: parts.join(' '),
    limits: CENTERING_LIMITS,
  }
}

/** The whole block as it came back from the Worker, or null when the answer has none. */
export function parseCenteringSummary(raw: unknown): CenteringSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const front = parsePhotoCentering(r.front, 'front')
  const back = parsePhotoCentering(r.back, 'back')
  return summariseCentering(front, back, r.source === 'none' ? 'none' : 'device')
}
