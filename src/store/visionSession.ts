import type { VisionCheck } from '../lib/vision'
import { asVisionCheck } from '../lib/vision'
import {
  measureFromBorders,
  type CenteringMeasure,
  type EdgeName,
  type PhotoResult,
  type PhotoSide,
  type Point,
  type RejectCode,
} from '../lib/centering'

const KEY = 'piecebook.vision.session.v1'

/**
 * The centering read on /pregrade, carried as-is to the worksheet. The worksheet
 * receives shrunken copies of the photos and must never re-measure them: a
 * second read at another size gives other numbers for the same card.
 */
export interface CarriedCentering {
  front: PhotoResult | null
  back: PhotoResult | null
}

export interface VisionSession {
  /** Null when the model refused the card and the user typed the number: photos still go to the worksheet. */
  check: VisionCheck | null
  frontDataUrl: string
  backDataUrl?: string
  centering?: CarriedCentering
  confirmedCardNumber?: string
}

/** Same-tab copy so confirm → worksheet still works if sessionStorage quota rejects the data URLs. */
let memory: VisionSession | null = null

const REJECT_CODES: readonly string[] = ['short-side', 'cut-off', 'angled', 'no-card', 'no-print-edge']
const EDGE_NAMES: readonly string[] = ['left', 'right', 'top', 'bottom']

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function quad(raw: unknown): [Point, Point, Point, Point] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const pts: Point[] = []
  for (const p of raw as unknown[]) {
    if (!p || typeof p !== 'object') return null
    const { x, y } = p as Record<string, unknown>
    if (!finite(x) || !finite(y)) return null
    pts.push({ x, y })
  }
  return pts as [Point, Point, Point, Point]
}

/**
 * Rebuild one side's result from storage. Ratios and the rule-out come back
 * from the border pixels, so a stale or edited copy cannot carry its own verdict.
 */
export function parsePhotoResult(raw: unknown, side: PhotoSide): PhotoResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.side !== side) return null
  if (r.ok === false) {
    if (typeof r.code !== 'string' || !REJECT_CODES.includes(r.code) || typeof r.message !== 'string') return null
    return { ok: false, side, code: r.code as RejectCode, message: r.message }
  }
  if (r.ok !== true || !r.measure || typeof r.measure !== 'object') return null
  const m = r.measure as Record<string, unknown>
  if (![m.left, m.right, m.top, m.bottom].every(finite)) return null
  const corners = quad(m.corners)
  const inner = quad(m.inner)
  if (!corners || !inner) return null
  const base = measureFromBorders(m.left as number, m.right as number, m.top as number, m.bottom as number, side)
  const resolved = m.resolved === false ? false : base.resolved
  const unresolvedSides = Array.isArray(m.unresolvedSides)
    ? (m.unresolvedSides.filter((n): n is EdgeName => typeof n === 'string' && EDGE_NAMES.includes(n)) as EdgeName[])
    : undefined
  const measure: CenteringMeasure = {
    ...base,
    resolved,
    cannotBeTen: resolved && base.cannotBeTen,
    unresolvedSides,
    corners,
    inner,
    maxAngleErrorDeg: finite(m.maxAngleErrorDeg) ? m.maxAngleErrorDeg : 0,
    imageWidth: finite(m.imageWidth) && m.imageWidth > 0 ? m.imageWidth : undefined,
    imageHeight: finite(m.imageHeight) && m.imageHeight > 0 ? m.imageHeight : undefined,
  }
  return { ok: true, side, measure }
}

function parseCarried(raw: unknown): CarriedCentering | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  return {
    front: parsePhotoResult(r.front, 'front'),
    back: parsePhotoResult(r.back, 'back'),
  }
}

function fromParsed(parsed: Partial<VisionSession>): VisionSession | null {
  if (typeof parsed.frontDataUrl !== 'string') return null
  const check = parsed.check == null ? null : asVisionCheck(parsed.check)
  if (parsed.check != null && !check) return null
  return {
    check,
    frontDataUrl: parsed.frontDataUrl,
    backDataUrl: typeof parsed.backDataUrl === 'string' ? parsed.backDataUrl : undefined,
    centering: parseCarried(parsed.centering),
    confirmedCardNumber: typeof parsed.confirmedCardNumber === 'string' ? parsed.confirmedCardNumber : undefined,
  }
}

function readStored(): VisionSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return fromParsed(JSON.parse(raw) as Partial<VisionSession>)
  } catch {
    return null
  }
}

export function peekVisionSession(): VisionSession | null {
  return memory ?? readStored()
}

export function writeVisionSession(session: VisionSession): void {
  memory = session
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Quota: memory still carries the photos to the worksheet in this tab.
  }
}

export function confirmVisionCard(cardNumber: string): VisionSession | null {
  const current = peekVisionSession()
  if (!current) return null
  const next = { ...current, confirmedCardNumber: cardNumber }
  writeVisionSession(next)
  return next
}

export function clearVisionSession(): void {
  memory = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
