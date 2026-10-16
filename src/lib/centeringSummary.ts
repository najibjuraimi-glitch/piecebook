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

export type UnmeasuredReason = RejectCode | 'unreadable' | 'not_sent'

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
  /** `55/45`: larger share first. */
  leftRight: string
  topBottom: string
  resolved: true
  cannotBeTen: boolean
}

export interface UnmeasuredCentering {
  side: PhotoSide
  measured: false
  reason: UnmeasuredReason
  note: string
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

const REJECT_CODES: readonly string[] = ['short-side', 'cut-off', 'angled', 'no-card', 'no-print-edge']
const REASONS: readonly string[] = [...REJECT_CODES, 'unreadable', 'not_sent']
const MAX_BORDER_PX = 20_000
const MAX_NOTE = 160

export const CENTERING_LIMITS = { front: `${FRONT_TEN_MAX}/${100 - FRONT_TEN_MAX}`, back: `${BACK_TEN_MAX}/${100 - BACK_TEN_MAX}` }

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
            : `${sideWord(side)}: could not measure (${reason}).`)
  return { side, measured: false, reason, note: text.slice(0, MAX_NOTE) }
}

/** From a live measurement on the phone. */
export function photoCentering(result: PhotoResult | null, side: PhotoSide): PhotoCentering | null {
  if (!result) return null
  if (!result.ok) return unmeasured(side, result.code, result.message)
  const m = result.measure
  if (!m.resolved) return unmeasured(side, 'no-print-edge', noPrintEdgeNote(side, m.unresolvedSides))
  return centeringFromBorders(side, m.left, m.right, m.top, m.bottom)
}

/** From a stored prediction photo (the log keeps border pixels, never the image). */
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
  return centeringFromBorders(side, left, right, top, bottom)
}

/** `Front 55/45 left to right · 52/48 top to bottom`, or the reason it was not measured. */
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
  const parts: string[] = []
  if (over.length) parts.push(`Cannot be a 10 by centering: ${over.map(overLine).join('; ')}.`)
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
