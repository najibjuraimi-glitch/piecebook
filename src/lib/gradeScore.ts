/**
 * TAG-style scores for the pre-grade page: a centering subscore from the
 * measured ratios, corners / edges / surface subscores from the model's
 * severity per part, and an overall range. Shared by the app and the Worker
 * (`/check` returns the same block), so one function, one set of tests.
 *
 * Everything here is an AI estimate, never a grade. Photos can rule a PSA 10
 * out; nothing here confirms one, so the top of a range reads "10 not ruled out".
 */
import { BACK_TEN_MAX, FRONT_TEN_MAX, measureFromBorders, type PhotoSide } from './centering'
import type { MeasuredCentering, PhotoCentering } from './centeringSummary'

export const SEVERITIES = ['none', 'light', 'moderate', 'heavy', 'unclear'] as const
export type Severity = (typeof SEVERITIES)[number]
export const CONFIDENCES = ['high', 'medium', 'low'] as const
export type Confidence = (typeof CONFIDENCES)[number]

export type PartName = 'centering' | 'corners' | 'edges' | 'surface'

/** The photo-quality flags that drop confidence to low wherever they appear. */
export const LOW_CONFIDENCE_FLAGS = ['glare', 'blur', 'unclear_photo'] as const

/**
 * PSA's published centering standards, the larger share of the border pair that
 * each grade still allows. Source: PSA Grading Standards, "Centering" line per
 * grade, https://www.psacard.com/gradingstandards (read 16 Oct 2026):
 *   GEM-MT 10  front 55/45 to 60/40 or better, back 75/25 or better
 *   MINT 9     front 60/40 to 65/35, back 90/10          NM-MT 8  front 65/35 to 70/30, back 90/10
 *   NM 7       front 70/30 to 75/25, back 90/10          EX-MT 6  front 80/20, back 90/10
 *   EX 5       front 85/15, back 90/10                   VG-EX 4  front 85/15, back 90/10
 *   VG 3       front 90/10, back 90/10                   GOOD 2   front 90/10, back 90/10
 *   PR 1       worse than 90/10
 * The house rule from Phase 11.2 keeps the strict end of PSA's 10 band: a front
 * over 55/45 (FRONT_TEN_MAX) cannot be a 10 here, so 56/44 to 65/35 scores 9.
 */
export const PSA_CENTERING = {
  source: 'PSA Grading Standards (Centering)',
  url: 'https://www.psacard.com/gradingstandards',
  front: [
    { grade: 10, max: FRONT_TEN_MAX },
    { grade: 9, max: 65 },
    { grade: 8, max: 70 },
    { grade: 7, max: 75 },
    { grade: 6, max: 80 },
    { grade: 5, max: 85 },
    { grade: 3, max: 90 },
  ],
  back: [
    { grade: 10, max: BACK_TEN_MAX },
    { grade: 9, max: 90 },
  ],
} as const

/** Grade a larger-share percentage against one side's table. Below every band is a 1. */
export function centeringGradeFor(largerPct: number, side: PhotoSide): number {
  const table = side === 'front' ? PSA_CENTERING.front : PSA_CENTERING.back
  for (const band of table) if (largerPct <= band.max + 1e-6) return band.grade
  return 1
}

/**
 * Severity → subscore and the band it stands for. PSA has no 9.5; the half
 * steps are the estimate's own uncertainty, the way TAG and Digital Grading
 * show a range rather than a point.
 */
export const SEVERITY_BANDS: Record<Exclude<Severity, 'unclear'>, { score: number; low: number; high: number }> = {
  none: { score: 10, low: 9.5, high: 10 },
  light: { score: 9, low: 8, high: 9.5 },
  moderate: { score: 7, low: 6, high: 8 },
  heavy: { score: 5, low: 3, high: 6 },
}

export interface PartScore {
  part: PartName
  /** Out of 10; null when the part could not be scored. */
  score: number | null
  low: number | null
  high: number | null
  confidence: Confidence
  /** Plain words: what the score rests on. */
  basis: string
  /** Why confidence is not high, in plain words. */
  caveats: string[]
}

export interface GradeScores {
  estimate: true
  label: 'AI estimate, not a grade'
  centering: PartScore
  corners: PartScore
  edges: PartScore
  surface: PartScore
  overall: {
    low: number | null
    high: number | null
    /** `8 to 9.5`, `9.5 or better · 10 not ruled out`, or why there is none. */
    text: string
    confidence: Confidence
    tenRuledOut: boolean
    tenRuledOutBy: string[]
  }
  /** The photo-quality problems that pulled confidence down, deduplicated. */
  lowConfidenceReasons: string[]
  standards: { centering: typeof PSA_CENTERING.source; url: typeof PSA_CENTERING.url }
}

export interface SectionLike {
  flags: string[]
  severity?: Severity | null
  confidence?: Confidence | null
}

export interface ConditionLike {
  corners: SectionLike
  edges: SectionLike
  surface: SectionLike
  psa10_ruled_out: boolean
}

export interface ScoreInput {
  front: PhotoCentering | null
  back: PhotoCentering | null
  /** Null when the model gave no condition (identify only, refused, or not run). */
  condition: ConditionLike | null
  /**
   * Whether a back photo went to the model. Separate from `back` because a back
   * that was sent but could not be measured still showed the model its corners
   * and edges. When omitted it is inferred from `back`.
   */
  backSent?: boolean
}

const RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 }
export function lowestConfidence(...cs: Confidence[]): Confidence {
  return cs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'high')
}

export function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)
}
export function isConfidence(v: unknown): v is Confidence {
  return typeof v === 'string' && (CONFIDENCES as readonly string[]).includes(v)
}

function sideWord(side: PhotoSide): string {
  return side === 'front' ? 'Front' : 'Back'
}

/** Photo-quality problems from the centering block: under 800px, angled, unreadable. */
function photoCaveats(c: PhotoCentering | null, side: PhotoSide): string[] {
  if (!c || c.measured) return []
  const who = sideWord(side).toLowerCase()
  if (c.reason === 'short-side') return [`${who} photo under 800px`]
  if (c.reason === 'angled') return [`${who} photo angled`]
  if (c.reason === 'not_sent') return []
  if (c.reason === 'no-print-edge') return [`${who} print edge not found`]
  if (c.reason === 'no-card') return [`${who} card outline not found`]
  if (c.reason === 'cut-off') return [`${who} card cut off at the frame`]
  return [`${who} photo could not be measured`]
}

function worsePct(c: MeasuredCentering): { pct: number } {
  const m = measureFromBorders(c.left, c.right, c.top, c.bottom, c.side)
  return { pct: m.worse.largerPct }
}

export function scoreCentering(front: PhotoCentering | null, back: PhotoCentering | null): PartScore {
  const caveats = [...photoCaveats(front, 'front'), ...photoCaveats(back, 'back')]
  const sides: { side: PhotoSide; c: PhotoCentering | null }[] = [
    { side: 'front', c: front },
    { side: 'back', c: back },
  ]
  const graded: { side: PhotoSide; grade: number }[] = []
  for (const { side, c } of sides) {
    if (!c || !c.measured) continue
    graded.push({ side, grade: centeringGradeFor(worsePct(c).pct, side) })
  }
  if (!graded.length) {
    return { part: 'centering', score: null, low: null, high: null, confidence: 'low', basis: 'Centering was not measured.', caveats }
  }
  const worst = graded.reduce((a, b) => (b.grade < a.grade ? b : a))
  const measuredSides = graded.map((g) => {
    const c = (g.side === 'front' ? front : back) as MeasuredCentering
    return `${g.side} ${c.leftRight} left to right, ${c.topBottom} top to bottom`
  })
  const score = worst.grade
  let confidence: Confidence = graded.length === 2 ? 'high' : 'medium'
  if (graded.length === 1) caveats.push(graded[0].side === 'front' ? 'back not measured' : 'front not measured')
  if (caveats.some((c) => /under 800px|angled/.test(c))) confidence = 'low'
  return {
    part: 'centering',
    score,
    low: score,
    high: score,
    confidence,
    basis: `${measuredSides.join('; ')}. ${
      score === 10 ? "Within PSA's 10 centering line" : `Outside PSA's 10 centering line, within the ${score} line`
    } (${worst.side} is the tighter side).`,
    caveats,
  }
}

export function scorePart(part: Exclude<PartName, 'centering'>, section: SectionLike | null, quality: { caveats: string[]; backMissing: boolean }): PartScore {
  const caveats = [...quality.caveats]
  if (!section) {
    return { part, score: null, low: null, high: null, confidence: 'low', basis: 'The model gave no condition read.', caveats }
  }
  const lowFlags = section.flags.filter((f) => (LOW_CONFIDENCE_FLAGS as readonly string[]).includes(f))
  for (const f of lowFlags) caveats.push(f === 'unclear_photo' ? 'photo unclear' : f)
  const severity = section.severity ?? null
  if (!severity) {
    return { part, score: null, low: null, high: null, confidence: 'low', basis: 'The model gave no severity for this part.', caveats }
  }
  if (severity === 'unclear') {
    return { part, score: null, low: null, high: null, confidence: 'low', basis: 'The model could not judge this part from these photos.', caveats }
  }
  const band = SEVERITY_BANDS[severity]
  const named = section.flags.filter((f) => !(LOW_CONFIDENCE_FLAGS as readonly string[]).includes(f))
  let confidence: Confidence = section.confidence ?? 'medium'
  if (quality.backMissing && part !== 'surface') {
    caveats.push('back not sent')
    confidence = lowestConfidence(confidence, 'medium')
  }
  if (lowFlags.length || caveats.some((c) => /under 800px|angled/.test(c))) confidence = 'low'
  return {
    part,
    score: band.score,
    low: band.low,
    high: band.high,
    confidence,
    basis: `${severity[0].toUpperCase()}${severity.slice(1)}${named.length ? `: ${named.join(', ')}` : severity === 'none' ? ': no defect named' : ''}.`,
    caveats,
  }
}

export function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function buildScores(input: ScoreInput): GradeScores {
  // A print edge the scan could not read says nothing about the photo the model saw of the
  // corners and edges; only photo-quality problems travel to the other parts.
  const photo = [...photoCaveats(input.front, 'front'), ...photoCaveats(input.back, 'back')].filter((c) => !/print edge/.test(c))
  const backMissing =
    input.backSent != null ? !input.backSent : !input.back || (!input.back.measured && input.back.reason === 'not_sent')
  const centering = scoreCentering(input.front, input.back)
  const cond = input.condition
  const quality = { caveats: photo, backMissing }
  const corners = scorePart('corners', cond ? cond.corners : null, quality)
  const edges = scorePart('edges', cond ? cond.edges : null, quality)
  const surface = scorePart('surface', cond ? cond.surface : null, quality)

  const tenRuledOutBy: string[] = []
  const frontOver = input.front && input.front.measured && input.front.cannotBeTen
  const backOver = input.back && input.back.measured && input.back.cannotBeTen
  if (frontOver || backOver) tenRuledOutBy.push('centering')
  if (cond && cond.psa10_ruled_out) tenRuledOutBy.push('the model saw a clear defect')
  const tenRuledOut = tenRuledOutBy.length > 0

  const scored = [centering, corners, edges, surface].filter((p) => p.score != null)
  let low: number | null = null
  let high: number | null = null
  let confidence: Confidence = 'low'
  let text: string
  if (!scored.length) {
    text = 'No score: nothing could be measured or read from these photos.'
  } else {
    low = Math.min(...scored.map((p) => p.low as number))
    high = Math.min(...scored.map((p) => p.high as number))
    confidence = lowestConfidence(...scored.map((p) => p.confidence))
    if (tenRuledOut) high = Math.min(high, 9.5)
    if (confidence === 'medium') low -= 0.5
    if (confidence === 'low') low -= 1
    low = Math.max(1, Math.round(low * 2) / 2)
    high = Math.max(low, Math.round(high * 2) / 2)
    const partial = scored.length < 4 ? ` From ${scored.length} of 4 parts.` : ''
    text = high >= 10 ? `${formatScore(low)} or better · 10 not ruled out.${partial}` : `${formatScore(low)} to ${formatScore(high)}.${partial}`
  }

  const lowConfidenceReasons = [...new Set([centering, corners, edges, surface].flatMap((p) => p.caveats).filter((c) => /under 800px|angled|glare|blur|unclear/.test(c)))]

  return {
    estimate: true,
    label: 'AI estimate, not a grade',
    centering,
    corners,
    edges,
    surface,
    overall: { low, high, text, confidence, tenRuledOut, tenRuledOutBy },
    lowConfidenceReasons,
    standards: { centering: PSA_CENTERING.source, url: PSA_CENTERING.url },
  }
}
