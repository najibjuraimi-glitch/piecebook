/**
 * Card outline from a phone frame, by its edges rather than its colour.
 *
 * The earlier finder masked "not the ground colour" and took the blob. On a
 * real table that breaks: a khaki cloth in uneven light is many colours, the
 * card's own shadow joins it, and a purple back in shade is close to a dark
 * ground. Then one side of the quad lands inside the card and the flatten
 * crops the card. Here each side is a straight line found where the picture
 * actually steps (a Hough vote over gradient pixels, gated by their
 * direction), the four lines are intersected, and the quad must pass as a
 * card: 63 × 88 shape, every side sitting on a long consistent edge. Anything
 * less is "no card", and the caller keeps the raw frame rather than warp
 * with a bad quad.
 */
import { axisTiltDeg, lineIntersection, quadArea, quadKeystoneDeg, type PixelImage, type Point, type Quad } from './centering'

export interface CardOutline {
  /** The four card corners in image pixels, ordered top-left, top-right, bottom-right, bottom-left. */
  quad: Quad
  /** Out-of-plane tilt read from the outline's trapezoid, degrees. */
  keystoneDeg: number
  /** In-plane rotation of the outline against the frame axes, degrees. */
  tiltDeg: number
  /** Share of the frame the card covers, 0–1. */
  coverage: number
  /** Share of each side (top, right, bottom, left) that sits on a consistent edge, 0–1. */
  support: [number, number, number, number]
  /** Mean of `support`: how sure the outline is. */
  confidence: number
}

export type OutlineResult = { ok: true; outline: CardOutline } | { ok: false; reason: 'no-card' | 'cut-off' }

/** Short side the frame is read at. Live frames arrive at about this size; captures are box-shrunk to it. */
export const OUTLINE_WORK_SHORT_SIDE = 340
/** Standard card, width over height. */
const ASPECT = 63 / 88
/** How far the quad's width/height may stray from 63/88 (perspective foreshortens one way). */
const ASPECT_TOLERANCE = 0.2
/** A side must sit on an edge for at least this share of its length... */
export const MIN_SIDE_SUPPORT = 0.6
/** ...and for at least this share of each third of it, so a short mark inside the card cannot stand in for a side. */
export const MIN_THIRD_SUPPORT = 0.4
/** And the four together at least this. */
export const MIN_CONFIDENCE = 0.72
/** A side whose edge carries on past either corner by more than this share is a stripe or a table edge, not a card. */
const MAX_CONTINUATION = 0.5
/** Looking outward from the strongest rectangle for the card edge, a side needs only this much support... */
const OUTER_MIN_SUPPORT = 0.4
/** ...and this much polarity agreement. */
const OUTER_MIN_POLARITY = 0.5
/** The gradient along a side points across it: cos of the angle allowed between the two. */
const ACROSS = 0.9
/**
 * Share of a side's edge pixels that must agree on which way is brighter. A
 * card edge is one step; a line through art is a jumble. Kept loose because a
 * border thinner than the smoothing shows both of its steps in one sample.
 */
const MIN_POLARITY = 0.65
/** Above this the side's polarity sign is trusted and must agree with the other sides'. */
const SURE_POLARITY = 0.8
/** Rounded corners and the odd finger: this share of each end of a side is not sampled. */
const SIDE_END_SKIP = 0.07
/** In-plane rotation handled, degrees either way. */
const MAX_ROTATION = 30
/** A pixel's gradient may be this far from a line's normal and still vote for it. */
const VOTE_SPREAD = 5
/** The card must be at least this share of the frame's short side wide. */
const MIN_WIDTH_FRAC = 0.15

interface Gradient {
  w: number
  h: number
  gx: Float32Array
  gy: Float32Array
  mag: Float32Array
  /** Edge threshold on `mag`. */
  threshold: number
}

interface Line {
  /** Normal angle, degrees; the sign of `rho` goes with it, so it is never folded. */
  theta: number
  /** Signed distance from the origin along the normal. */
  rho: number
  votes: number
  /** An image border standing in for a side that is out of frame. */
  border: boolean
}

/**
 * Box-shrink to the working size and return smoothed RGB planes. Shrinking
 * by an integer factor averages sensor grain away; at factor 1 one 3 × 3 pass
 * does the same job.
 */
function shrink(image: PixelImage): { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array; scale: number } {
  const short = Math.min(image.width, image.height)
  const s = Math.max(1, Math.floor(short / OUTLINE_WORK_SHORT_SIDE))
  const w = Math.floor(image.width / s)
  const h = Math.floor(image.height / s)
  const r = new Float32Array(w * h)
  const g = new Float32Array(w * h)
  const b = new Float32Array(w * h)
  const d = image.data
  const inv = 1 / (s * s)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0
      let sg = 0
      let sb = 0
      for (let yy = 0; yy < s; yy++) {
        let i = ((y * s + yy) * image.width + x * s) * 4
        for (let xx = 0; xx < s; xx++) {
          sr += d[i]
          sg += d[i + 1]
          sb += d[i + 2]
          i += 4
        }
      }
      const o = y * w + x
      r[o] = sr * inv
      g[o] = sg * inv
      b[o] = sb * inv
    }
  }
  if (s === 1) {
    box3(r, w, h)
    box3(g, w, h)
    box3(b, w, h)
  }
  return { w, h, r, g, b, scale: s }
}

function box3(a: Float32Array, w: number, h: number): void {
  const t = new Float32Array(a.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : x
      const x1 = x < w - 1 ? x + 1 : x
      t[y * w + x] = (a[y * w + x0] + a[y * w + x] + a[y * w + x1]) / 3
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : y
    const y1 = y < h - 1 ? y + 1 : y
    for (let x = 0; x < w; x++) a[y * w + x] = (t[y0 * w + x] + t[y * w + x] + t[y1 * w + x]) / 3
  }
}

/**
 * Median gradient magnitude over `take`. Zeros count: on a plain table most
 * pixels are flat, and the median must be that floor rather than the card
 * edge itself (which is nearly the only non-zero pixel on a clean frame).
 */
function magMedian(mag: Float32Array, w: number, h: number, take: (x: number, y: number) => boolean): number {
  const hist = new Uint32Array(256)
  let n = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!take(x, y)) continue
      hist[Math.min(255, Math.round(mag[y * w + x]))]++
      n++
    }
  }
  if (n < 32) return 0
  let acc = 0
  for (let k = 0; k < 256; k++) {
    acc += hist[k]
    if (acc >= n / 2) return k
  }
  return 0
}

/**
 * Noise floor for an edge. The whole frame's median is raised by busy print;
 * the outer band is the table, and is used when it is the quieter of the two.
 * A card that fills the band makes that band loud, and the frame median stands.
 */
function edgeFloor(mag: Float32Array, w: number, h: number): number {
  const full = magMedian(mag, w, h, () => true)
  const bx = Math.max(4, Math.round(w * 0.1))
  const by = Math.max(4, Math.round(h * 0.1))
  const border = magMedian(mag, w, h, (x, y) => y < by || y >= h - by || x < bx || x >= w - bx)
  if (border > 0 && (full === 0 || border < full)) return border
  return full > 0 ? full : 2
}

/**
 * Sobel on each colour plane; a pixel takes the plane where it steps most,
 * so a purple card on a grey cloth of the same brightness still has an
 * edge. Magnitudes are scaled so a clean step of Δ levels reads about Δ.
 */
function gradient(p: { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array }): Gradient {
  const { w, h } = p
  const gx = new Float32Array(w * h)
  const gy = new Float32Array(w * h)
  const mag = new Float32Array(w * h)
  const planes = [p.r, p.g, p.b]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let bestM = 0
      let bx = 0
      let by = 0
      for (const a of planes) {
        const o = y * w + x
        const sx = a[o - w + 1] + 2 * a[o + 1] + a[o + w + 1] - a[o - w - 1] - 2 * a[o - 1] - a[o + w - 1]
        const sy = a[o + w - 1] + 2 * a[o + w] + a[o + w + 1] - a[o - w - 1] - 2 * a[o - w] - a[o - w + 1]
        const m = sx * sx + sy * sy
        if (m > bestM) {
          bestM = m
          bx = sx
          by = sy
        }
      }
      const o = y * w + x
      gx[o] = bx / 4
      gy[o] = by / 4
      mag[o] = Math.sqrt(bestM) / 4
    }
  }
  // Noise floor from the table, not the card art: the outer band of the frame.
  // Busy print would otherwise raise the floor until a soft card edge stops counting.
  const threshold = Math.max(6, edgeFloor(mag, w, h) * 3)
  return { w, h, gx, gy, mag, threshold }
}

const DEG = Math.PI / 180

/**
 * Lines near one orientation. Gradient pixels vote for the normal angles
 * within VOTE_SPREAD of their own, at the distance that line would pass the
 * pixel. A card side gathers its whole length into one cell; cloth texture
 * scatters.
 */
function houghFamily(g: Gradient, centreDeg: number): Line[] {
  const { w, h, gx, gy, mag, threshold } = g
  const half = MAX_ROTATION + VOTE_SPREAD
  const nTheta = 2 * half + 1
  const diag = Math.ceil(Math.hypot(w, h))
  const nRho = 2 * diag + 1
  const acc = new Float32Array(nTheta * nRho)
  const cos = new Float32Array(nTheta)
  const sin = new Float32Array(nTheta)
  for (let t = 0; t < nTheta; t++) {
    const deg = centreDeg - half + t
    cos[t] = Math.cos(deg * DEG)
    sin[t] = Math.sin(deg * DEG)
  }
  const cap = threshold * 3
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const o = y * w + x
      const m = mag[o]
      if (m < threshold) continue
      // Normal angle in [0, 180), folded onto this family's window.
      let phi = Math.atan2(gy[o], gx[o]) / DEG
      if (phi < 0) phi += 180
      let rel = phi - centreDeg
      if (rel > 90) rel -= 180
      if (rel < -90) rel += 180
      if (Math.abs(rel) > half) continue
      const weight = m > cap ? cap : m
      const t0 = Math.max(0, Math.round(rel + half) - VOTE_SPREAD)
      const t1 = Math.min(nTheta - 1, Math.round(rel + half) + VOTE_SPREAD)
      for (let t = t0; t <= t1; t++) {
        const rho = Math.round(x * cos[t] + y * sin[t]) + diag
        acc[t * nRho + rho] += weight
      }
    }
  }
  // Peaks: cells above a floor that are the largest in a ±3° × ±2 px window.
  // Wider in distance would swallow the card edge when the print border, a few
  // pixels in, is the stronger line.
  let max = 0
  for (let i = 0; i < acc.length; i++) if (acc[i] > max) max = acc[i]
  const minLen = Math.min(w, h) * MIN_WIDTH_FRAC * 0.6
  const floor = Math.max(max * 0.06, minLen * threshold)
  const peaks: Line[] = []
  for (let t = VOTE_SPREAD; t < nTheta - VOTE_SPREAD; t++) {
    for (let r = 0; r < nRho; r++) {
      const v = acc[t * nRho + r]
      if (v < floor) continue
      let isMax = true
      for (let dt = -3; dt <= 3 && isMax; dt++) {
        const tt = t + dt
        if (tt < 0 || tt >= nTheta) continue
        for (let dr = -2; dr <= 2; dr++) {
          const rr = r + dr
          if (rr < 0 || rr >= nRho || (dt === 0 && dr === 0)) continue
          const u = acc[tt * nRho + rr]
          if (u > v || (u === v && (dt < 0 || (dt === 0 && dr < 0)))) {
            isMax = false
            break
          }
        }
      }
      if (isMax) peaks.push({ theta: centreDeg - half + t, rho: r - diag, votes: v, border: false })
    }
  }
  peaks.sort((a, b) => b.votes - a.votes)
  return peaks.slice(0, 16)
}

function linePoints(l: Line): [Point, Point] {
  const c = Math.cos(l.theta * DEG)
  const s = Math.sin(l.theta * DEG)
  const p0 = { x: l.rho * c, y: l.rho * s }
  return [p0, { x: p0.x - s * 1000, y: p0.y + c * 1000 }]
}

function cross(a: Line, b: Line): Point | null {
  const [a1, a2] = linePoints(a)
  const [b1, b2] = linePoints(b)
  return lineIntersection(a1, a2, b1, b2)
}

interface Support {
  /** Share of samples on an edge pointing across the side, 0–1. */
  share: number
  /** Share of those agreeing on which way is brighter. */
  polarity: number
  /** Lowest share among the three thirds of the side. */
  weakestThird: number
  /** +1 when the inside of the side is the brighter tone, −1 when darker, 0 when there is no edge. */
  sign: 1 | -1 | 0
}

/**
 * Edge evidence along the segment from `a` to `b` between parameters `t0`
 * and `t1` (0 and 1 are the corners; outside that range samples the line's
 * continuation past a corner).
 */
function edgeAlong(g: Gradient, a: Point, b: Point, t0: number, t1: number, n: number): Support {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < 8) return { share: 0, polarity: 0, weakestThird: 0, sign: 0 }
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const nx = -uy
  const ny = ux
  const hitsBy = [0, 0, 0]
  const countBy = [0, 0, 0]
  let hits = 0
  let pos = 0
  let neg = 0
  let seen = 0
  const floor = g.threshold * 0.7
  for (let k = 0; k < n; k++) {
    const t = t0 + ((t1 - t0) * (k + 0.5)) / n
    const third = Math.min(2, Math.floor((3 * k) / n))
    const px = a.x + ux * t * len
    const py = a.y + uy * t * len
    if (px < 1 || py < 1 || px >= g.w - 1 || py >= g.h - 1) continue
    seen++
    countBy[third]++
    let best = 0
    let bestDot = 0
    for (let d = -1; d <= 1; d++) {
      const x = Math.round(px + nx * d)
      const y = Math.round(py + ny * d)
      if (x < 1 || y < 1 || x >= g.w - 1 || y >= g.h - 1) continue
      const o = y * g.w + x
      const m = g.mag[o]
      if (m <= best) continue
      const dot = (g.gx[o] * nx + g.gy[o] * ny) / (m || 1)
      if (Math.abs(dot) < ACROSS) continue
      best = m
      bestDot = dot
    }
    if (best >= floor) {
      hits++
      hitsBy[third]++
      if (bestDot > 0) pos++
      else neg++
    }
  }
  if (!seen) return { share: 0, polarity: 0, weakestThird: 0, sign: 0 }
  let weakest = 1
  for (let i = 0; i < 3; i++) if (countBy[i]) weakest = Math.min(weakest, hitsBy[i] / countBy[i])
  // The normal points into the quad, so a gradient along it means the inside is the brighter tone.
  return { share: hits / seen, polarity: Math.max(pos, neg) / Math.max(1, hits), weakestThird: weakest, sign: hits === 0 ? 0 : pos >= neg ? 1 : -1 }
}

/**
 * Support for a side as one of the four of a card: on an edge for most of
 * its length and in each third of it (so a short strong mark inside the card
 * cannot stand in for a side), one polarity (card lighter than ground along
 * the whole side, or darker, never both), and stopping at both corners (a
 * stripe on the cloth or a table edge carries on; a card side does not).
 * Returns 0 when any of those fails. Ends are skipped for rounded corners.
 */
type SideEvidence = { share: number; sign: 1 | -1 | 0 }
const NO_SIDE: SideEvidence = { share: 0, sign: 0 }

function sideSupport(g: Gradient, a: Point, b: Point): SideEvidence {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.max(15, Math.min(60, Math.round(len / 3)))
  const on = edgeAlong(g, a, b, SIDE_END_SKIP, 1 - SIDE_END_SKIP, n)
  if (on.share < MIN_SIDE_SUPPORT || on.weakestThird < MIN_THIRD_SUPPORT || on.polarity < MIN_POLARITY) return NO_SIDE
  if (continues(g, a, b)) return NO_SIDE
  return { share: on.share, sign: on.polarity >= SURE_POLARITY ? on.sign : 0 }
}

/** Looser evidence for a card edge found outward of the print edge: shade or a finger may interrupt it. */
function outerSupport(g: Gradient, a: Point, b: Point): SideEvidence {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.max(15, Math.min(60, Math.round(len / 3)))
  const on = edgeAlong(g, a, b, SIDE_END_SKIP, 1 - SIDE_END_SKIP, n)
  if (on.share < OUTER_MIN_SUPPORT || on.polarity < OUTER_MIN_POLARITY) return NO_SIDE
  if (continues(g, a, b)) return NO_SIDE
  return { share: on.share, sign: on.polarity >= SURE_POLARITY ? on.sign : 0 }
}

/** The edge carries on past either corner: a stripe on the cloth or a table edge, not a card side. */
function continues(g: Gradient, a: Point, b: Point): boolean {
  const before = edgeAlong(g, a, b, -0.2, -0.06, 8)
  if (before.share > MAX_CONTINUATION) return true
  const after = edgeAlong(g, a, b, 1.06, 1.2, 8)
  return after.share > MAX_CONTINUATION
}

/**
 * The sides that are sure of their polarity agree on which tone is inside: a
 * card edge against a ground, or a border against its print. A mix is two
 * different edges patched into one rectangle.
 */
function sameSign(sides: SideEvidence[]): boolean {
  const signs = sides.map((s) => s.sign).filter((s) => s !== 0)
  return signs.every((s) => s === signs[0])
}

interface Candidate {
  quad: Quad
  support: [number, number, number, number]
  confidence: number
  /** Confidence plus how strongly its lines stood out in the vote, for ranking. */
  score: number
  area: number
  borders: number
  width: number
}

/**
 * Refit one side on the pixels: at stations along it, the edge's sub-pixel
 * position across a ±3 px band (magnitude-weighted centroid), then a median
 * slope and offset through the stations.
 */
function refineSide(g: Gradient, a: Point, b: Point): [Point, Point] {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < 12) return [a, b]
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const nx = -uy
  const ny = ux
  const stations = Math.max(9, Math.min(31, Math.round(len / 6)))
  const marks: { t: number; d: number }[] = []
  for (let k = 0; k < stations; k++) {
    const t = SIDE_END_SKIP + ((1 - 2 * SIDE_END_SKIP) * (k + 0.5)) / stations
    const px = a.x + ux * t * len
    const py = a.y + uy * t * len
    let wsum = 0
    let dsum = 0
    let peak = 0
    for (let d = -3; d <= 3; d++) {
      const x = Math.round(px + nx * d)
      const y = Math.round(py + ny * d)
      if (x < 1 || y < 1 || x >= g.w - 1 || y >= g.h - 1) continue
      const o = y * g.w + x
      const m = g.mag[o]
      if (m < g.threshold * 0.5) continue
      const dot = Math.abs(g.gx[o] * nx + g.gy[o] * ny) / (m || 1)
      if (dot < ACROSS) continue
      wsum += m
      dsum += m * d
      if (m > peak) peak = m
    }
    if (wsum > 0 && peak >= g.threshold * 0.7) marks.push({ t, d: dsum / wsum })
  }
  if (marks.length < 5) return [a, b]
  const slopes: number[] = []
  for (let i = 0; i < marks.length; i++) {
    for (let j = i + 1; j < marks.length; j++) slopes.push((marks[j].d - marks[i].d) / (marks[j].t - marks[i].t))
  }
  const slope = median(slopes)
  const offset = median(marks.map((m) => m.d - slope * m.t))
  const at = (t: number): Point => {
    const d = offset + slope * t
    return { x: a.x + ux * t * len + nx * d, y: a.y + uy * t * len + ny * d }
  }
  return [at(0), at(1)]
}

function median(values: number[]): number {
  const v = [...values].sort((p, q) => p - q)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

function orderedQuad(tl: Point, tr: Point, br: Point, bl: Point): Quad {
  return [tl, tr, br, bl]
}

function isConvex(q: Quad): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const c = q[(i + 2) % 4]
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (z === 0) return false
    const s = z > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

function inside(p: Point, w: number, h: number, margin: number): boolean {
  return p.x >= margin && p.y >= margin && p.x <= w - 1 - margin && p.y <= h - 1 - margin
}

export function findCardOutline(image: PixelImage): OutlineResult {
  if (image.width < 24 || image.height < 24) return { ok: false, reason: 'no-card' }
  const small = shrink(image)
  const g = gradient(small)
  const { w, h } = g
  // Normal near 0° → vertical sides (left, right); near 90° → horizontal (top, bottom).
  const vertical = houghFamily(g, 0)
  const horizontal = houghFamily(g, 90)
  // Image borders stand in for sides that are out of frame, so a card that runs off the
  // picture is reported as cut off rather than as a smaller card or none.
  const borderV: Line[] = [
    { theta: 0, rho: 0.5, votes: 0, border: true },
    { theta: 0, rho: w - 1.5, votes: 0, border: true },
  ]
  const borderH: Line[] = [
    { theta: 90, rho: 0.5, votes: 0, border: true },
    { theta: 90, rho: h - 1.5, votes: 0, border: true },
  ]
  const vs = [...vertical, ...borderV]
  const hs = [...horizontal, ...borderH]
  const maxV = Math.max(1, ...vertical.map((l) => l.votes))
  const maxH = Math.max(1, ...horizontal.map((l) => l.votes))
  const strength = (l: Line, max: number) => (l.border ? 1 : Math.min(1, l.votes / max))
  const minW = Math.min(w, h) * MIN_WIDTH_FRAC
  const BORDER_SIDE: SideEvidence = { share: 1, sign: 0 }
  const supportCache = new Map<string, SideEvidence>()
  const supportOf = (line: Line, key: string, a: Point, b: Point): SideEvidence => {
    if (line.border) return BORDER_SIDE
    const hit = supportCache.get(key)
    if (hit) return hit
    const s = sideSupport(g, a, b)
    supportCache.set(key, s)
    return s
  }

  // Lines are within MAX_ROTATION of the axes, so the gap between two of a family's
  // ρ values is close to the card's width or height; pairs that cannot make a card
  // of the right size and shape are dropped before any intersection is computed.
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const offset = (l: Line) => l.rho - (cx * Math.cos(l.theta * DEG) + cy * Math.sin(l.theta * DEG))
  const offV = vs.map(offset)
  const offH = hs.map(offset)
  const gapOk = (d: number) => d >= minW * 0.8 && d <= Math.max(w, h)
  const shapeOk = (lr: number, tb: number) => {
    const aspect = lr / tb
    return aspect >= ASPECT * (1 - ASPECT_TOLERANCE) * 0.8 && aspect <= ASPECT * (1 + ASPECT_TOLERANCE) * 1.25
  }

  let best: Candidate | null = null
  let bestCut: Candidate | null = null
  for (let li = 0; li < vs.length; li++) {
    for (let ri = 0; ri < vs.length; ri++) {
      if (li === ri) continue
      const L = vs[li]
      const R = vs[ri]
      const lrGap = offV[ri] - offV[li]
      if ((L.border && R.border) || !gapOk(lrGap)) continue
      for (let ti = 0; ti < hs.length; ti++) {
        for (let bi = 0; bi < hs.length; bi++) {
          if (ti === bi) continue
          const T = hs[ti]
          const B = hs[bi]
          const tbGap = offH[bi] - offH[ti]
          if ((T.border && B.border) || !gapOk(tbGap) || !shapeOk(lrGap, tbGap)) continue
          const borders = (L.border ? 1 : 0) + (R.border ? 1 : 0) + (T.border ? 1 : 0) + (B.border ? 1 : 0)
          if (borders > 1) continue
          const tl = cross(T, L)
          const tr = cross(T, R)
          const br = cross(B, R)
          const bl = cross(B, L)
          if (!tl || !tr || !br || !bl) continue
          // Left of right, top of bottom, as seen in the frame.
          if (tl.x >= tr.x || bl.x >= br.x || tl.y >= bl.y || tr.y >= br.y) continue
          const quad = orderedQuad(tl, tr, br, bl)
          if (!isConvex(quad)) continue
          if (!quad.every((p) => inside(p, w, h, -2))) continue
          const width = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2
          const height = (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2
          if (width < minW || height < minW) continue
          const aspect = width / height
          if (Math.abs(aspect - ASPECT) > ASPECT * ASPECT_TOLERANCE) continue
          if (quadKeystoneDeg(quad) > 50) continue
          // Sides are walked clockwise so the normal points into the quad. The role
          // is part of the cache key: the same line read as a top has the opposite
          // polarity sign to the same line read as a bottom.
          const eT = supportOf(T, `t${ti}:${li},${ri}`, tl, tr)
          if (!eT.share) continue
          const eB = supportOf(B, `b${bi}:${li},${ri}`, br, bl)
          if (!eB.share) continue
          const eL = supportOf(L, `l${li}:${ti},${bi}`, bl, tl)
          if (!eL.share) continue
          const eR = supportOf(R, `r${ri}:${ti},${bi}`, tr, br)
          if (!eR.share) continue
          if (!sameSign([eT, eR, eB, eL])) continue
          const sT = eT.share
          const sR = eR.share
          const sB = eB.share
          const sL = eL.share
          const real = [sT, sR, sB, sL].filter((_, i) => ![T, R, B, L][i].border)
          const confidence = real.reduce((s, v) => s + v, 0) / real.length
          if (confidence < MIN_CONFIDENCE) continue
          // Long clean edges gather far more votes than a line through busy art that happens to
          // pick up enough gradient; let that weigh in beside the support.
          const votes = (strength(T, maxH) + strength(B, maxH) + strength(L, maxV) + strength(R, maxV)) / 4
          const cand: Candidate = { quad, support: [sT, sR, sB, sL], confidence, score: confidence + 0.5 * votes, area: quadArea(quad), borders, width }
          if (borders > 0) {
            if (!bestCut || cand.score > bestCut.score) bestCut = cand
            continue
          }
          if (!best || cand.score > best.score) best = cand
        }
      }
    }
  }
  if (!best) return bestCut ? { ok: false, reason: 'cut-off' } : { ok: false, reason: 'no-card' }

  // A card back's print border is itself a 63 × 88-ish rectangle on strong edges, often a
  // stronger one than the card edge against the table; a front's white border is the same.
  // From the strongest rectangle, look outward on every side for a parallel edge a border's
  // width away. All four found: that is the card edge. Fewer: this rectangle is the card.
  let chosen = best
  for (let pass = 0; pass < 2; pass++) {
    const outer = stepOutward(g, chosen)
    if (!outer) break
    chosen = outer
  }
  // The print border inside a card is itself a 63 × 88 rectangle on strong edges.
  // Flattening it crops the real border, which is the failure this finder exists
  // to avoid: keep the raw frame instead.
  if (quadIsInset(small, chosen.quad)) return { ok: false, reason: 'no-card' }

  // Refit each side on the pixels and re-intersect, then back to full-size coordinates.
  const q = chosen.quad
  const sides: [Point, Point][] = [refineSide(g, q[0], q[1]), refineSide(g, q[1], q[2]), refineSide(g, q[2], q[3]), refineSide(g, q[3], q[0])]
  const refined: Point[] = []
  for (let s = 0; s < 4; s++) {
    const prev = sides[(s + 3) % 4]
    const cur = sides[s]
    refined.push(lineIntersection(prev[0], prev[1], cur[0], cur[1]) ?? q[s])
  }
  const sc = small.scale
  const full = refined.map((p) => ({ x: (p.x + 0.5) * sc - 0.5, y: (p.y + 0.5) * sc - 0.5 })) as Quad
  // A side the refit pushed off the picture means the card really is at the edge.
  if (!full.every((p) => inside(p, image.width, image.height, -1))) return { ok: false, reason: 'cut-off' }
  return {
    ok: true,
    outline: {
      quad: full,
      keystoneDeg: quadKeystoneDeg(full),
      tiltDeg: axisTiltDeg(full),
      coverage: quadArea(full) / (image.width * image.height),
      support: chosen.support,
      confidence: chosen.confidence,
    },
  }
}

type Rgb3 = [number, number, number]

function colourAt(p: { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array }, x: number, y: number): Rgb3 | null {
  const ix = Math.round(x)
  const iy = Math.round(y)
  if (ix < 0 || iy < 0 || ix >= p.w || iy >= p.h) return null
  const o = iy * p.w + ix
  return [p.r[o], p.g[o], p.b[o]]
}

function dist3(a: Rgb3, b: Rgb3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function pointInConvex(q: Quad, x: number, y: number): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const z = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
    if (Math.abs(z) < 0.5) continue
    const s = z > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/**
 * The rectangle is the print border inside the card, not the card edge: on
 * three or more sides the colour just outside it is the card, not the ground
 * showing in the frame corners. Flattening that crops the border, so the
 * caller keeps the raw frame.
 */
function quadIsInset(p: { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array }, q: Quad): boolean {
  // The middle of a back is the compass, not the card colour. Sample toward
  // the four corners of the quad, where the field is.
  const centre = meanOver(
    p,
    (u, v) => {
      const uu = u < 0.5 ? 0.12 + 0.32 * u : 0.72 + 0.32 * (u - 0.5)
      const vv = v < 0.5 ? 0.12 + 0.32 * v : 0.72 + 0.32 * (v - 0.5)
      const top = { x: q[0].x + (q[1].x - q[0].x) * uu, y: q[0].y + (q[1].y - q[0].y) * uu }
      const bot = { x: q[3].x + (q[2].x - q[3].x) * uu, y: q[3].y + (q[2].y - q[3].y) * uu }
      return { x: top.x + (bot.x - top.x) * vv, y: top.y + (bot.y - top.y) * vv }
    },
    0,
    1,
    0,
    1,
  )
  const ground = groundColour(p, q)
  if (!centre || !ground) return false
  const cardW = (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y)) / 2
  // A print border is a few percent of the card wide. Just outside an inner
  // edge that band is still the card; a little further is the table.
  const near0 = Math.max(2, cardW * 0.012)
  const near1 = Math.max(near0 + 2, cardW * 0.04)
  const far0 = Math.max(near1 + 2, cardW * 0.07)
  const far1 = Math.max(far0 + 2, cardW * 0.11)
  let cardSides = 0
  for (let s = 0; s < 4; s++) {
    const a = q[s]
    const b = q[(s + 1) % 4]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const ox = (b.y - a.y) / len
    const oy = -(b.x - a.x) / len
    const band = (d0: number, d1: number) =>
      meanOver(
        p,
        (u, v) => {
          const t = 0.25 + 0.5 * u
          const d = d0 + (d1 - d0) * v
          return { x: a.x + (b.x - a.x) * t + ox * d, y: a.y + (b.y - a.y) * t + oy * d }
        },
        0,
        1,
        0,
        1,
      )
    const near = band(near0, near1)
    const far = band(far0, far1)
    if (!near || !far) continue
    const nearCard = dist3(near, centre)
    const farCard = dist3(far, centre)
    const farGround = dist3(far, ground)
    // Near the line is still the card, and further out is the table: this side is an inner edge.
    // The band just outside an inner print edge is still the card; a little
    // further out it is closer to the table than to the card.
    if (nearCard < 55 && farCard > nearCard + 6 && farGround < farCard) cardSides++
  }
  return cardSides >= 3
}

function meanOver(
  p: { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array },
  at: (u: number, v: number) => Point,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
): Rgb3 | null {
  let sr = 0
  let sg = 0
  let sb = 0
  let n = 0
  const nU = 4
  const nV = 4
  for (let j = 0; j < nV; j++) {
    for (let i = 0; i < nU; i++) {
      const u = u0 + ((u1 - u0) * (i + 0.5)) / nU
      const v = v0 + ((v1 - v0) * (j + 0.5)) / nV
      const c = colourAt(p, at(u, v).x, at(u, v).y)
      if (!c) continue
      sr += c[0]
      sg += c[1]
      sb += c[2]
      n++
    }
  }
  if (n < 6) return null
  return [sr / n, sg / n, sb / n]
}

/** Mean colour of the frame corners that fall outside the quad: the table. */
function groundColour(p: { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array }, q: Quad): Rgb3 | null {
  const rad = 7
  let sr = 0
  let sg = 0
  let sb = 0
  let n = 0
  const corners = [
    [0, 0],
    [p.w - 1, 0],
    [0, p.h - 1],
    [p.w - 1, p.h - 1],
  ]
  for (const [cx, cy] of corners) {
    for (let dy = 0; dy < rad; dy++) {
      for (let dx = 0; dx < rad; dx++) {
        const x = cx === 0 ? dx : cx - dx
        const y = cy === 0 ? dy : cy - dy
        if (pointInConvex(q, x, y)) continue
        const o = y * p.w + x
        sr += p.r[o]
        sg += p.g[o]
        sb += p.b[o]
        n++
      }
    }
  }
  if (n < 16) return null
  return [sr / n, sg / n, sb / n]
}

/**
 * The next rectangle out from `inner`: on each side, the card edge 1.5–12% of
 * the card width outward, found by scanning that range for the offset with
 * the most edge in each third of the side (so a tilted or foreshortened edge
 * is still met) and fitting a line through the thirds' offsets. Null unless
 * all four sides have one and the four still make a card.
 */
function stepOutward(g: Gradient, inner: Candidate): Candidate | null {
  const q = inner.quad
  const lo = Math.max(1.5, inner.width * 0.015)
  const hi = inner.width * 0.12
  // A side already on the card edge (the cloth step) has nothing further out, so it
  // stays; only sides sitting on an inner print edge move. One clean step is
  // enough to try the larger rectangle.
  const lines: [Point, Point][] = []
  let moved = 0
  for (let s = 0; s < 4; s++) {
    const a = q[s]
    const b = q[(s + 1) % 4]
    const l = outwardEdge(g, a, b, lo, hi)
    if (l) moved++
    lines.push(l ?? [a, b])
  }
  if (!moved) return null
  const corners: Point[] = []
  for (let s = 0; s < 4; s++) {
    const prev = lines[(s + 3) % 4]
    const cur = lines[s]
    const p = lineIntersection(prev[0], prev[1], cur[0], cur[1])
    if (!p) return null
    corners.push(p)
  }
  const quad = corners as Quad
  if (!isConvex(quad) || !quad.every((p) => inside(p, g.w, g.h, -2))) return null
  const [tl, tr, br, bl] = quad
  const eT = outerSupport(g, tl, tr)
  const eR = outerSupport(g, tr, br)
  const eB = outerSupport(g, br, bl)
  const eL = outerSupport(g, bl, tl)
  // A hand-held card is lighter than the table on one side and darker than a
  // finger on another, so the outer edge does not share one polarity. The
  // print border inside it does, which is why that rectangle won the search.
  if (!eT.share || !eR.share || !eB.share || !eL.share) return null
  const width = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2
  const height = (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2
  if (Math.abs(width / height - ASPECT) > ASPECT * ASPECT_TOLERANCE) return null
  const support: [number, number, number, number] = [eT.share, eR.share, eB.share, eL.share]
  const confidence = (eT.share + eR.share + eB.share + eL.share) / 4
  return { quad, support, confidence, score: confidence, area: quadArea(quad), borders: 0, width }
}

/**
 * The edge parallel-ish to the side `a`→`b` (walked clockwise, so outward
 * is to its right) between `lo` and `hi` pixels out. Each third of the side
 * picks the offset where it meets the most edge of one polarity; a line
 * through at least two thirds' picks is returned, so one shaded or covered
 * third does not lose the side.
 */
function outwardEdge(g: Gradient, a: Point, b: Point, lo: number, hi: number): [Point, Point] | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < 12) return null
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const ox = uy
  const oy = -ux
  const span = 1 - 2 * SIDE_END_SKIP
  const n = Math.max(6, Math.min(20, Math.round(len / 9)))
  const marks: { t: number; d: number }[] = []
  for (let k = 0; k < 3; k++) {
    const t0 = SIDE_END_SKIP + (span * k) / 3
    const t1 = SIDE_END_SKIP + (span * (k + 1)) / 3
    let bestShare = 0
    let bestD = 0
    const profile: number[] = []
    for (let d = lo; d <= hi; d += 1) {
      const a2 = { x: a.x + ox * d, y: a.y + oy * d }
      const b2 = { x: b.x + ox * d, y: b.y + oy * d }
      const s = edgeAlong(g, a2, b2, t0, t1, n)
      profile.push(s.share)
      if (s.polarity < OUTER_MIN_POLARITY) continue
      if (s.share > bestShare) {
        bestShare = s.share
        bestD = d
      }
    }
    // A card edge is a spike in the profile; cloth texture is a plateau that may be
    // as high in places but never stands clear of its own level.
    if (profile.length < 3 || bestShare < OUTER_MIN_SUPPORT || bestShare < 2.5 * median(profile)) continue
    marks.push({ t: (t0 + t1) / 2, d: bestD })
  }
  if (marks.length < 2) return null
  const slopes: number[] = []
  for (let i = 0; i < marks.length; i++) {
    for (let j = i + 1; j < marks.length; j++) slopes.push((marks[j].d - marks[i].d) / (marks[j].t - marks[i].t))
  }
  const slope = median(slopes)
  const offset = median(marks.map((m) => m.d - slope * m.t))
  const at = (t: number): Point => {
    const d = offset + slope * t
    return { x: a.x + ux * t * len + ox * d, y: a.y + uy * t * len + oy * d }
  }
  return [at(0), at(1)]
}
