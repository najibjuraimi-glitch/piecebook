/**
 * Guided camera helpers, all plain pixels on the client: glare, blur and
 * brightness over the card, live hints for the viewfinder, and a projective
 * flatten so a slightly angled shot measures like a square-on one. Nothing
 * here grades a card. Photos can rule a PSA 10 out; they never confirm one.
 */
import { MIN_SHORT_SIDE_PX, findCardOutline, type CardOutline, type PixelImage, type Point, type Quad } from './centering'

/** A standard trading card is 63 × 88 mm. */
export const CARD_RATIO = 63 / 88

// --- thresholds for the live view (frames of ~320 px short side) -----------
/** Below this share of the frame the borders are too few pixels to read. */
export const MIN_COVERAGE = 0.18
/** Above this the card is about to touch the frame. */
export const MAX_COVERAGE = 0.8
/**
 * Keystone above this is asked to be straightened. The scale is the one
 * `measurePhoto` uses (the foreshortening of the short opposite side read as
 * a tilt angle): hand-held shots read 7–14 here and flatten fine, so the hint
 * fires only when the trapezoid is plain to see.
 */
export const MAX_LIVE_KEYSTONE_DEG = 25
/** In-plane rotation above this: the outline guide is clearly off. */
export const MAX_LIVE_TILT_DEG = 8
/** Variance of the Laplacian over the card, on a ~320 px frame, under which the shot is soft. */
export const MIN_SHARPNESS = 50
/** Mean luminance over the card under which the shot is too dark to read. */
export const MIN_BRIGHTNESS = 70
/** A pixel this bright in every channel is blown out. */
export const BLOWN_LEVEL = 248
/** One blown region at least this share of the card area is glare. */
export const GLARE_BLOB_FRAC = 0.004
/** Or blown pixels of any shape covering this share of the card. */
export const GLARE_TOTAL_FRAC = 0.02
/** How long the card must stay ready before the shutter fires on its own, ms. */
export const AUTO_CAPTURE_MS = 500

export type HintCode = 'no-card' | 'off-frame' | 'too-far' | 'too-close' | 'tilted' | 'dark' | 'blur' | 'glare'

export const HINT_TEXT: Record<HintCode, string> = {
  'no-card': 'Point at the card on a plain, darker background.',
  'off-frame': 'Move back a little: all four edges need to be in the frame.',
  'too-far': 'Move closer so the card fills the outline.',
  'too-close': 'Move back a touch: leave a margin around the card.',
  tilted: 'Hold the phone flat over the card, straight down.',
  dark: 'Too dark. Face a window or hold a sheet of white paper to bounce light in.',
  blur: 'Hold still. Tap the card to focus if it stays soft.',
  glare: 'Glare on the card. Tilt it a little, or move the lamp out of the foil.',
}

export interface GlareReport {
  /** Share of the card area that is blown out, 0–1. */
  fraction: number
  /** Largest connected blown region as a share of the card area. */
  largestFraction: number
  /** Connected blown regions over the blob floor. */
  blobs: number
  glare: boolean
}

export interface FrameMetrics {
  sharpness: number
  brightness: number
  glare: GlareReport
}

export interface FrameAssessment {
  outline: CardOutline | null
  /** Why the frame is not ready yet, most important first. Empty when it is. */
  hints: HintCode[]
  ready: boolean
  metrics: FrameMetrics | null
}

function lum(data: Uint8ClampedArray, i: number): number {
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
}

/** Point-in-convex-quad, quad ordered around the outline. */
export function insideQuad(q: Quad, x: number, y: number): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
    if (cross === 0) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** Shrink a quad toward its centre by a share of its size, so edge anti-aliasing stays outside. */
export function shrinkQuad(q: Quad, frac: number): Quad {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4
  return q.map((p) => ({ x: cx + (p.x - cx) * (1 - frac), y: cy + (p.y - cy) * (1 - frac) })) as Quad
}

function bbox(q: Quad): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.floor(Math.min(q[0].x, q[1].x, q[2].x, q[3].x)),
    y0: Math.floor(Math.min(q[0].y, q[1].y, q[2].y, q[3].y)),
    x1: Math.ceil(Math.max(q[0].x, q[1].x, q[2].x, q[3].x)),
    y1: Math.ceil(Math.max(q[0].y, q[1].y, q[2].y, q[3].y)),
  }
}

function wholeFrame(img: PixelImage): Quad {
  return [
    { x: 0, y: 0 },
    { x: img.width - 1, y: 0 },
    { x: img.width - 1, y: img.height - 1 },
    { x: 0, y: img.height - 1 },
  ]
}

/**
 * Blown-highlight regions over the card. A blown pixel is near white in every
 * channel; a border of white stock under even light sits well under that.
 * Regions are 4-connected and counted against the card area, so one bright
 * lamp reflection reads as glare while scattered sparkle on a foil does not.
 */
export function glareReport(img: PixelImage, quad?: Quad): GlareReport {
  const q = quad ? shrinkQuad(quad, 0.03) : wholeFrame(img)
  const b = bbox(q)
  const x0 = Math.max(0, b.x0)
  const y0 = Math.max(0, b.y0)
  const x1 = Math.min(img.width - 1, b.x1)
  const y1 = Math.min(img.height - 1, b.y1)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  if (w <= 0 || h <= 0) return { fraction: 0, largestFraction: 0, blobs: 0, glare: false }
  const mask = new Uint8Array(w * h)
  let cardArea = 0
  let blown = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!insideQuad(q, x, y)) continue
      cardArea++
      const i = (y * img.width + x) * 4
      if (img.data[i] >= BLOWN_LEVEL && img.data[i + 1] >= BLOWN_LEVEL && img.data[i + 2] >= BLOWN_LEVEL) {
        mask[(y - y0) * w + (x - x0)] = 1
        blown++
      }
    }
  }
  if (!cardArea) return { fraction: 0, largestFraction: 0, blobs: 0, glare: false }
  const floor = Math.max(4, cardArea * GLARE_BLOB_FRAC)
  let blobs = 0
  let largest = 0
  const stack: number[] = []
  for (let s = 0; s < mask.length; s++) {
    if (mask[s] !== 1) continue
    let size = 0
    mask[s] = 2
    stack.push(s)
    while (stack.length) {
      const k = stack.pop() as number
      size++
      const kx = k % w
      const ky = (k - kx) / w
      const next = [k - 1, k + 1, k - w, k + w]
      if (kx === 0) next[0] = -1
      if (kx === w - 1) next[1] = -1
      if (ky === 0) next[2] = -1
      if (ky === h - 1) next[3] = -1
      for (const n of next) {
        if (n >= 0 && mask[n] === 1) {
          mask[n] = 2
          stack.push(n)
        }
      }
    }
    if (size >= floor) blobs++
    if (size > largest) largest = size
  }
  const fraction = blown / cardArea
  const largestFraction = largest / cardArea
  return { fraction, largestFraction, blobs, glare: blobs > 0 || fraction >= GLARE_TOTAL_FRAC }
}

/**
 * Variance of a 3×3 Laplacian over the card's luminance, sampled on a stride
 * so a live frame costs little. Sharp edges and print give a high number;
 * motion blur and a missed focus flatten it.
 */
export function sharpness(img: PixelImage, quad?: Quad, stride = 2): number {
  const q = quad ? shrinkQuad(quad, 0.08) : wholeFrame(img)
  const b = bbox(q)
  const x0 = Math.max(1, b.x0)
  const y0 = Math.max(1, b.y0)
  const x1 = Math.min(img.width - 2, b.x1)
  const y1 = Math.min(img.height - 2, b.y1)
  let n = 0
  let sum = 0
  let sumSq = 0
  const d = img.data
  const w = img.width
  for (let y = y0; y <= y1; y += stride) {
    for (let x = x0; x <= x1; x += stride) {
      if (!insideQuad(q, x, y)) continue
      const c = lum(d, (y * w + x) * 4)
      const lap = 4 * c - lum(d, (y * w + x - 1) * 4) - lum(d, (y * w + x + 1) * 4) - lum(d, ((y - 1) * w + x) * 4) - lum(d, ((y + 1) * w + x) * 4)
      sum += lap
      sumSq += lap * lap
      n++
    }
  }
  if (n < 16) return 0
  const mean = sum / n
  return sumSq / n - mean * mean
}

/** Mean luminance over the card, 0–255. */
export function brightness(img: PixelImage, quad?: Quad, stride = 2): number {
  const q = quad ? shrinkQuad(quad, 0.05) : wholeFrame(img)
  const b = bbox(q)
  const x0 = Math.max(0, b.x0)
  const y0 = Math.max(0, b.y0)
  const x1 = Math.min(img.width - 1, b.x1)
  const y1 = Math.min(img.height - 1, b.y1)
  let n = 0
  let sum = 0
  for (let y = y0; y <= y1; y += stride) {
    for (let x = x0; x <= x1; x += stride) {
      if (!insideQuad(q, x, y)) continue
      sum += lum(img.data, (y * img.width + x) * 4)
      n++
    }
  }
  return n ? sum / n : 0
}

/**
 * One live frame → outline, hints and readiness. Order of hints is the order
 * a collector should fix them: find the card, frame it, hold it flat, then
 * light, focus and glare.
 */
export function assessFrame(img: PixelImage): FrameAssessment {
  const found = findCardOutline(img)
  if (!found.ok) {
    return { outline: null, hints: [found.reason === 'cut-off' ? 'off-frame' : 'no-card'], ready: false, metrics: null }
  }
  const o = found.outline
  const hints: HintCode[] = []
  if (o.coverage < MIN_COVERAGE) hints.push('too-far')
  else if (o.coverage > MAX_COVERAGE) hints.push('too-close')
  if (o.keystoneDeg > MAX_LIVE_KEYSTONE_DEG || o.tiltDeg > MAX_LIVE_TILT_DEG) hints.push('tilted')
  const metrics: FrameMetrics = {
    sharpness: sharpness(img, o.quad),
    brightness: brightness(img, o.quad),
    glare: glareReport(img, o.quad),
  }
  if (metrics.brightness < MIN_BRIGHTNESS) hints.push('dark')
  if (metrics.sharpness < MIN_SHARPNESS) hints.push('blur')
  if (metrics.glare.glare) hints.push('glare')
  return { outline: o, hints, ready: hints.length === 0, metrics }
}

// --- projective flatten -----------------------------------------------------

/** Row-major 3×3. */
export type Mat3 = [number, number, number, number, number, number, number, number, number]

function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    if (Math.abs(m[pivot][col]) < 1e-12) return null
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = m[r][col] / m[col][col]
      if (!f) continue
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c]
    }
  }
  return m.map((row, i) => row[n] / row[i])
}

/** The homography taking each `src` corner onto the matching `dst` corner, or null when degenerate. */
export function homographyFromQuads(src: Quad, dst: Quad): Mat3 | null {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  const h = solve(A, b)
  if (!h) return null
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

export function applyHomography(H: Mat3, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

export function invertMat3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) return null
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ]
}

/**
 * Resample `src` into a `destW × destH` image; `destToSrc` maps each output
 * pixel back to the source. Past the source edge the nearest edge pixel is
 * repeated, so a margin that reaches outside the photo keeps the photo's own
 * ground colour and the frame-median card mask still works on the result.
 */
export function warpImage(src: PixelImage, destToSrc: Mat3, destW: number, destH: number): PixelImage {
  const out = new Uint8ClampedArray(destW * destH * 4)
  const d = src.data
  const sw = src.width
  const sh = src.height
  for (let y = 0; y < destH; y++) {
    for (let x = 0; x < destW; x++) {
      const w = destToSrc[6] * x + destToSrc[7] * y + destToSrc[8]
      const sx = Math.min(sw - 1, Math.max(0, (destToSrc[0] * x + destToSrc[1] * y + destToSrc[2]) / w))
      const sy = Math.min(sh - 1, Math.max(0, (destToSrc[3] * x + destToSrc[4] * y + destToSrc[5]) / w))
      const o = (y * destW + x) * 4
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(sw - 1, x0 + 1)
      const y1 = Math.min(sh - 1, y0 + 1)
      const fx = sx - x0
      const fy = sy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      for (let c = 0; c < 3; c++) {
        out[o + c] = d[i00 + c] * (1 - fx) * (1 - fy) + d[i10 + c] * fx * (1 - fy) + d[i01 + c] * (1 - fx) * fy + d[i11 + c] * fx * fy
      }
      out[o + 3] = 255
    }
  }
  return { width: destW, height: destH, data: out }
}

/**
 * Margin of ground kept around the flattened card, as a share of its width.
 * Wide enough that the card stays under ~70% of the output, where the
 * frame-median colour mask still separates it from the ground.
 */
export const FLATTEN_MARGIN_FRAC = 0.12

export interface FlattenOptions {
  /** Margin of background kept around the card, as a share of the card's width. */
  marginFrac?: number
  /** Longest the card itself is drawn, in pixels. */
  maxCardHeight?: number
}

export type FlattenResult =
  | { flattened: true; image: PixelImage; outline: CardOutline; cardQuad: Quad }
  | { flattened: false; image: PixelImage; reason: 'no-card' | 'cut-off' | 'degenerate' }

/**
 * Find the four corners and warp the shot so the card is an upright 63 × 88
 * rectangle with a margin of background around it, the way a square-on photo
 * looks. When the corners cannot be found the raw image comes back and the
 * caller says centering may be less accurate.
 */
export function flattenCard(image: PixelImage, opts: FlattenOptions = {}): FlattenResult {
  const found = findCardOutline(image)
  if (!found.ok) return { flattened: false, image, reason: found.reason }
  const o = found.outline
  const [tl, tr, br, bl] = o.quad
  const widthPx = Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y))
  const heightPx = Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y))
  if (widthPx < 8 || heightPx < 8) return { flattened: false, image, reason: 'degenerate' }
  // Keep the source's pixel density on the card; the aspect comes from the real card, not the photo.
  // Never come out under the measuring floor: a foreshortened card is drawn up to it.
  const marginFrac = opts.marginFrac ?? FLATTEN_MARGIN_FRAC
  const maxH = opts.maxCardHeight ?? 2000
  const minCardW = Math.ceil(MIN_SHORT_SIDE_PX / (1 + 2 * marginFrac)) + 2
  const cardH = Math.round(Math.min(maxH, Math.max(heightPx, widthPx / CARD_RATIO, minCardW / CARD_RATIO)))
  const cardW = Math.round(cardH * CARD_RATIO)
  const margin = Math.round(cardW * marginFrac)
  const destW = cardW + 2 * margin
  const destH = cardH + 2 * margin
  const cardQuad: Quad = [
    { x: margin, y: margin },
    { x: margin + cardW - 1, y: margin },
    { x: margin + cardW - 1, y: margin + cardH - 1 },
    { x: margin, y: margin + cardH - 1 },
  ]
  const destToSrc = homographyFromQuads(cardQuad, o.quad)
  if (!destToSrc) return { flattened: false, image, reason: 'degenerate' }
  return { flattened: true, image: warpImage(image, destToSrc, destW, destH), outline: o, cardQuad }
}

/** Of two shots of the same side, the one with less glare on the card; ties keep the first. */
export function pickCleanerFrame(a: GlareReport, b: GlareReport): { index: 0 | 1; reason: string } {
  const score = (g: GlareReport) => g.largestFraction * 4 + g.fraction
  if (score(b) < score(a) * 0.9) return { index: 1, reason: 'the second, tilted shot had less glare' }
  if (!a.glare && !b.glare) return { index: 0, reason: 'neither shot had glare' }
  return { index: 0, reason: 'the first shot had the same or less glare' }
}
