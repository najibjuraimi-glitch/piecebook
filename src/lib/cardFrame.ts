/**
 * Guided camera helpers, all plain pixels on the client: glare, blur and
 * brightness over the card, live hints for the viewfinder, and a projective
 * flatten so a slightly angled shot measures like a square-on one. Nothing
 * here grades a card. Photos can rule a PSA 10 out; they never confirm one.
 */
import { MIN_SHORT_SIDE_PX, type PixelImage, type Point, type Quad } from './centering'
import { findCardOutline, type CardOutline } from './cardOutline'

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
/** A new hint has to agree this many frames in a row before it replaces the one on screen. */
export const HINT_SETTLE_FRAMES = 2
/** After the viewfinder opens or a retake, auto-capture waits this long so the first frames cannot fire it. */
export const CAPTURE_ARM_MS = 800
/** Corners may move this far, in analysis pixels, and still count as steady. */
export const QUAD_STABLE_PX = 8
/** A card that stays not-ready this long gets "or tap the shutter", so a harsh hint cannot block the shot forever. */
export const STUCK_HINT_MS = 3500

export type HintCode = 'no-card' | 'off-frame' | 'too-far' | 'too-close' | 'tilted' | 'rotated' | 'dark' | 'blur' | 'glare'

export const HINT_TEXT: Record<HintCode, string> = {
  'no-card': 'Point at the card on a plain, darker background.',
  'off-frame': 'Move back a little: all four edges need to be in the frame.',
  'too-far': 'Move closer so the card fills the outline.',
  'too-close': 'Move back a touch: leave a margin around the card.',
  tilted: 'Hold the phone flat over the card, straight down.',
  rotated: 'Turn the phone or the card so the edges line up with the outline.',
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
 * a collector should fix them: find the card, frame it, hold it flat and
 * square, then light, focus and glare.
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
  if (o.keystoneDeg > MAX_LIVE_KEYSTONE_DEG) hints.push('tilted')
  else if (o.tiltDeg > MAX_LIVE_TILT_DEG) hints.push('rotated')
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

/** Largest distance between matching corners, in pixels. */
export function quadDrift(a: Quad, b: Quad): number {
  let worst = 0
  for (let i = 0; i < 4; i++) worst = Math.max(worst, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y))
  return worst
}

function blendQuad(prev: Quad, next: Quad): Quad {
  // A small move is eased so the outline does not jitter; a big move snaps.
  const drift = quadDrift(prev, next)
  const toward = drift > QUAD_STABLE_PX * 3 ? 1 : 0.65
  return prev.map((p, i) => ({ x: p.x + (next[i].x - p.x) * toward, y: p.y + (next[i].y - p.y) * toward })) as Quad
}

/** What the viewfinder is showing, and the clocks auto-capture depends on. */
export interface LiveViewState {
  /** Hint on screen. Null means the outline is locked. */
  shown: HintCode | null
  /** Latest unsettled reading. Undefined until the first frame. Null means ready. */
  raw: HintCode | null | undefined
  rawCount: number
  /** Smoothed outline in analysis pixels. */
  outline: Quad | null
  /** Last raw outline, for the steadiness check. */
  lastQuad: Quad | null
  readySince: number | null
  /** Not-locked frames since the hold started. One is forgiven. */
  misses: number
  /** When an outline was first seen in this spell. */
  cardSince: number | null
  /** When the viewfinder opened or the shot was retaken. */
  bornAt: number
}

export function initialLiveView(now: number): LiveViewState {
  return { shown: null, raw: undefined, rawCount: 0, outline: null, lastQuad: null, readySince: null, misses: 0, cardSince: null, bornAt: now }
}

export interface LiveStep {
  state: LiveViewState
  /** The shutter should fire on its own. */
  capture: boolean
  /** Offer the manual shutter in the hint, because the card has been stuck. */
  offerShutter: boolean
  /** The outline is locked: green, and the hold bar is running. */
  ready: boolean
  /** 0–1 fill of the hold bar. */
  progress: number
}

/**
 * One analysis frame. A hint replaces the one on screen only after it repeats,
 * the outline eases instead of jumping, and auto-capture waits out an arm
 * delay plus a steady hold. A single bad frame does not throw away a hold
 * that was already going.
 */
export function stepLiveView(prev: LiveViewState, frame: FrameAssessment, now: number): LiveStep {
  const raw: HintCode | null = frame.ready ? null : (frame.hints[0] ?? 'no-card')
  const rawCount = raw === prev.raw ? prev.rawCount + 1 : 1
  const shown = raw !== prev.shown && rawCount >= HINT_SETTLE_FRAMES ? raw : prev.shown
  const outline = frame.outline ? (prev.outline ? blendQuad(prev.outline, frame.outline.quad) : frame.outline.quad) : null
  const steady = Boolean(frame.outline && prev.lastQuad && quadDrift(prev.lastQuad, frame.outline.quad) <= QUAD_STABLE_PX)
  const frameLocked = Boolean(frame.ready && steady)
  // The hint on screen has settled on ready, and this frame agrees.
  const settledReady = shown === null && raw === null && rawCount >= HINT_SETTLE_FRAMES
  let misses = prev.misses
  let readySince = prev.readySince
  if (frameLocked) {
    misses = 0
    readySince ??= now
  } else if (readySince !== null) {
    misses += 1
    if (misses >= 2) {
      readySince = null
      misses = 0
    }
  }
  const cardSince = frame.outline ? (prev.cardSince ?? now) : null
  const capture = Boolean(frameLocked && settledReady && now - prev.bornAt >= CAPTURE_ARM_MS && readySince !== null && now - readySince >= AUTO_CAPTURE_MS)
  const offerShutter = Boolean(cardSince !== null && shown !== null && now - cardSince >= STUCK_HINT_MS)
  const progress = readySince === null ? 0 : Math.min(1, (now - readySince) / AUTO_CAPTURE_MS)
  return {
    state: {
      shown,
      raw,
      rawCount,
      outline,
      lastQuad: frame.outline ? frame.outline.quad : null,
      readySince,
      misses,
      cardSince,
      bornAt: prev.bornAt,
    },
    capture,
    offerShutter,
    ready: frameLocked && settledReady,
    progress,
  }
}

/** A case scan waits this long on one steady view before it sends the photo. */
export const SCENE_STEADY_MS = 1000
/** After this many reads that moved, automatic scans wait for a longer steady spell. */
export const MOVED_HOLD_AFTER = 2
/** Steady spell required once two reads in a row were taken while the phone was moving. */
export const MOVED_HOLD_MS = 3000
/** Do not send another automatic scan until this long after the last one. */
export const SCAN_INTERVAL_MS = 4000
/** Downscaled greyscale long edge used to see a pan across a case. */
export const SCENE_LONG_EDGE = 128
/** A shift of this share of the long edge is a pan, not sensor noise. */
export const SCENE_MOVE_FRAC = 0.06
/** A shift this large is a different view, so cards seen before it are forgotten. */
export const SCENE_RESET_FRAC = 0.2
/** Residual difference, after aligning and removing exposure, above which the picture itself changed. */
export const SCENE_MOVE_MAD = 12

export interface GreyFrame {
  width: number
  height: number
  data: Uint8Array
}

export interface FrameMotion {
  /** Mean absolute grey difference before aligning, 0–255. */
  mad: number
  /** Difference after the shift, with the mean removed and a small blur. */
  residual: number
  dx: number
  dy: number
  /** Shift length. X is a share of the width and y a share of the height, then combined. */
  shiftFrac: number
}

export interface SceneHold {
  /** The greyscale view this steady spell is measured against. */
  anchor: GreyFrame | null
  steadySince: number | null
  misses: number
  /** This spell already sent a scan. */
  scanned: boolean
}

export function initialSceneHold(): SceneHold {
  return { anchor: null, steadySince: null, misses: 0, scanned: false }
}

export function markSceneScanned(state: SceneHold): SceneHold {
  return { ...state, scanned: true }
}

/** True when an automatic scan is allowed. The first scan of a session does not wait. */
export function scanIntervalOpen(lastScanAt: number | null, now: number): boolean {
  return lastScanAt == null || now - lastScanAt >= SCAN_INTERVAL_MS
}

/** Downscale to greyscale. A case is compared as this picture, not as four brightness centroids. */
export function greyDownscale(img: PixelImage, longEdge = SCENE_LONG_EDGE): GreyFrame {
  const long = Math.max(img.width, img.height, 1)
  const scale = longEdge / long
  const width = Math.max(8, Math.round(img.width * scale))
  const height = Math.max(8, Math.round(img.height * scale))
  const data = new Uint8Array(width * height)
  const xScale = img.width / width
  const yScale = img.height / height
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.min(img.height - 1, Math.floor(y * yScale))
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.min(img.width - 1, Math.floor(x * xScale))
      const i = (y0 * img.width + x0) * 4
      data[y * width + x] = Math.round(0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2])
    }
  }
  return { width, height, data }
}

export function meanAbsDiff(anchor: GreyFrame, next: GreyFrame): number {
  const width = Math.min(anchor.width, next.width)
  const height = Math.min(anchor.height, next.height)
  let sum = 0
  let n = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      sum += Math.abs(anchor.data[y * anchor.width + x] - next.data[y * next.width + x])
      n += 1
    }
  }
  return n ? sum / n : 0
}

function blockSad(anchor: GreyFrame, next: GreyFrame, dx: number, dy: number, x0: number, y0: number, x1: number, y1: number): number | null {
  let sumA = 0
  let sumB = 0
  let n = 0
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const bx = x + dx
      const by = y + dy
      if (bx < 0 || by < 0 || bx >= next.width || by >= next.height) continue
      sumA += anchor.data[y * anchor.width + x]
      sumB += next.data[by * next.width + bx]
      n += 1
    }
  }
  if (!n) return null
  const meanA = sumA / n
  const meanB = sumB / n
  let sad = 0
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const bx = x + dx
      const by = y + dy
      if (bx < 0 || by < 0 || bx >= next.width || by >= next.height) continue
      sad += Math.abs(anchor.data[y * anchor.width + x] - meanA - (next.data[by * next.width + bx] - meanB))
    }
  }
  return sad / n
}

/** Best whole-pixel shift of the anchor block inside the next frame, searched out to a quarter of the long edge. */
export function blockShift(anchor: GreyFrame, next: GreyFrame): { dx: number; dy: number } {
  const width = Math.min(anchor.width, next.width)
  const height = Math.min(anchor.height, next.height)
  const radius = Math.max(4, Math.round(Math.max(width, height) * 0.25))
  const x0 = radius
  const y0 = radius
  const x1 = width - radius
  const y1 = height - radius
  if (x1 <= x0 || y1 <= y0) return { dx: 0, dy: 0 }
  const zero = blockSad(anchor, next, 0, 0, x0, y0, x1, y1)
  if (zero == null) return { dx: 0, dy: 0 }
  // A tied or barely better alignment is sensor noise, not a pan. Keep zero.
  const clearer = (sad: number, current: number) => sad + 0.25 < current
  let best = { dx: 0, dy: 0, sad: zero }
  for (let dy = -radius; dy <= radius; dy += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      const sad = blockSad(anchor, next, dx, dy, x0, y0, x1, y1)
      if (sad != null && clearer(sad, best.sad)) best = { dx, dy, sad }
    }
  }
  let refined = best
  for (let dy = best.dy - 2; dy <= best.dy + 2; dy += 1) {
    for (let dx = best.dx - 2; dx <= best.dx + 2; dx += 1) {
      if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue
      const sad = blockSad(anchor, next, dx, dy, x0, y0, x1, y1)
      if (sad != null && clearer(sad, refined.sad)) refined = { dx, dy, sad }
    }
  }
  // Keep a slide only when lining the frames up removes a real mismatch.
  // A tie, or a one-level improvement, is the search fitting sensor noise.
  if (zero - refined.sad < 6 && refined.sad > zero / 3) return { dx: 0, dy: 0 }
  return { dx: refined.dx, dy: refined.dy }
}

function overlapSamples(anchor: GreyFrame, next: GreyFrame, dx: number, dy: number): { a: Float32Array; b: Float32Array; width: number; height: number } | null {
  const x0 = Math.max(0, -dx)
  const y0 = Math.max(0, -dy)
  const x1 = Math.min(anchor.width, next.width - dx)
  const y1 = Math.min(anchor.height, next.height - dy)
  const width = x1 - x0
  const height = y1 - y0
  if (width < 8 || height < 8) return null
  const a = new Float32Array(width * height)
  const b = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      a[y * width + x] = anchor.data[(y + y0) * anchor.width + (x + x0)]
      b[y * width + x] = next.data[(y + y0 + dy) * next.width + (x + x0 + dx)]
    }
  }
  return { a, b, width, height }
}

/** A wide box blur, so a fraction of a pixel does not read as a new picture. */
function blurBox(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const out = new Float32Array(src.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0
      let n = 0
      for (let ky = -radius; ky <= radius; ky += 1) {
        const yy = y + ky
        if (yy < 0 || yy >= height) continue
        for (let kx = -radius; kx <= radius; kx += 1) {
          const xx = x + kx
          if (xx < 0 || xx >= width) continue
          sum += src[yy * width + xx]
          n += 1
        }
      }
      out[y * width + x] = sum / n
    }
  }
  return out
}

/**
 * How different the pictures are once the slide is removed.
 * The mean is taken off so a brighter exposure is not a new scene, then a blur
 * so a tremble smaller than a pixel is not one either.
 */
export function alignedResidual(anchor: GreyFrame, next: GreyFrame, dx: number, dy: number): number {
  const pair = overlapSamples(anchor, next, dx, dy)
  if (!pair) return meanAbsDiff(anchor, next)
  const a = blurBox(pair.a, pair.width, pair.height, 2)
  const b = blurBox(pair.b, pair.width, pair.height, 2)
  let meanA = 0
  let meanB = 0
  for (let i = 0; i < a.length; i += 1) {
    meanA += a[i]
    meanB += b[i]
  }
  meanA /= a.length
  meanB /= b.length
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - meanA - (b[i] - meanB))
  return sum / a.length
}

/** Shift first, then the residual of the aligned frames. A shift that does not actually line the pictures up is dropped. */
export function compareFrames(anchor: GreyFrame, next: GreyFrame): FrameMotion {
  const mad = meanAbsDiff(anchor, next)
  let shift = blockShift(anchor, next)
  let residual = alignedResidual(anchor, next, shift.dx, shift.dy)
  if (shift.dx !== 0 || shift.dy !== 0) {
    const atZero = alignedResidual(anchor, next, 0, 0)
    if (residual > atZero * 0.75) {
      shift = { dx: 0, dy: 0 }
      residual = atZero
    }
  }
  const width = Math.max(anchor.width, 1)
  const height = Math.max(anchor.height, 1)
  const shiftFrac = Math.hypot(shift.dx / width, shift.dy / height)
  return { mad, residual, dx: shift.dx, dy: shift.dy, shiftFrac }
}

/**
 * Moved when the frame slid by about 6% of its width or its height.
 * A tremble or an exposure change stays put: the residual after aligning,
 * removing the mean, and blurring has to clear the bar on its own.
 */
export function sceneMoved(motion: FrameMotion): boolean {
  return motion.shiftFrac >= SCENE_MOVE_FRAC || motion.residual >= SCENE_MOVE_MAD
}

/** A slide of about 20% of the width or the height, or a picture that still disagrees after aligning. */
export function substantialSceneChange(motion: FrameMotion): boolean {
  return motion.shiftFrac >= SCENE_RESET_FRAC || motion.residual >= SCENE_MOVE_MAD
}

/** One second, or three after two moved reads in a row. */
export function steadyWaitMs(movedReads: number): number {
  return movedReads >= MOVED_HOLD_AFTER ? MOVED_HOLD_MS : SCENE_STEADY_MS
}

/**
 * Steadiness for a whole case. The anchor is the greyscale frame, so a pan
 * across a grid of slabs counts even when each quadrant stays the same brightness.
 * One mild flicker is forgiven. A real shift ends the spell.
 */
export function stepSceneHold(
  prev: SceneHold,
  frame: GreyFrame,
  now: number,
  steadyMs = SCENE_STEADY_MS,
): { state: SceneHold; steady: boolean; moved: boolean; ready: boolean; motion: FrameMotion | null } {
  if (!prev.anchor) {
    return { state: { anchor: frame, steadySince: null, misses: 0, scanned: false }, steady: false, moved: false, ready: false, motion: null }
  }
  const motion = compareFrames(prev.anchor, frame)
  if (!sceneMoved(motion)) {
    const steadySince = prev.steadySince ?? now
    const state = { anchor: prev.anchor, steadySince, misses: 0, scanned: prev.scanned }
    return { state, steady: true, moved: false, ready: !state.scanned && now - steadySince >= steadyMs, motion }
  }
  const hard = motion.shiftFrac >= SCENE_MOVE_FRAC
  if (!hard && prev.misses < 1) {
    return { state: { ...prev, misses: prev.misses + 1 }, steady: false, moved: false, ready: false, motion }
  }
  return { state: { anchor: frame, steadySince: null, misses: 0, scanned: false }, steady: false, moved: true, ready: false, motion }
}

/** Print id, otherwise the code text. An unread slab is matched by its box, not by this key. */
export function scanCardKey(card: { printId?: string | null; codeText?: string | null }): string {
  const printId = (card.printId || '').trim()
  if (printId) return printId
  return (card.codeText || '').trim()
}

export interface CardBox {
  x: number
  y: number
  w: number
  h: number
}

/** Named cards, plus the boxes of slabs that had no code. Boxes are in the last frame's fractions. */
export interface SeenCards {
  keys: Set<string>
  boxes: CardBox[]
}

export function emptySeen(): SeenCards {
  return { keys: new Set(), boxes: [] }
}

/** Overlap over union. Zero when either box has no area. */
export function boxIoU(a: CardBox, b: CardBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  const inter = w * h
  const union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}

/** Move a box by a greyscale shift. dx is pixels across the frame width, dy across the height. */
export function shiftBox(box: CardBox, dx: number, dy: number, width: number, height: number): CardBox {
  return {
    x: box.x + dx / Math.max(width, 1),
    y: box.y + dy / Math.max(height, 1),
    w: box.w,
    h: box.h,
  }
}

export interface BoxMotion {
  dx: number
  dy: number
  width: number
  height: number
}

const BOX_MATCH_IOU = 0.5

/**
 * How many scans in a row added no new card. Three pauses the camera.
 * An unread slab matches a box already seen when the overlap, after the
 * measured shift between the two frames, is at least half the union.
 */
export function nextDryStreak(
  seen: SeenCards,
  streak: number,
  cards: { printId?: string | null; codeText?: string | null; box?: CardBox | null }[],
  motion: BoxMotion | null = null,
): { seen: SeenCards; streak: number; pause: boolean } {
  const keys = new Set(seen.keys)
  const boxes = seen.boxes.map((box) => (motion ? shiftBox(box, motion.dx, motion.dy, motion.width, motion.height) : { ...box }))
  let fresh = false
  for (const card of cards) {
    const key = scanCardKey(card)
    if (key) {
      if (keys.has(key)) continue
      keys.add(key)
      fresh = true
      continue
    }
    const box = card.box
    if (!box || !(box.w > 0) || !(box.h > 0)) continue
    const hit = boxes.findIndex((prev) => boxIoU(prev, box) >= BOX_MATCH_IOU)
    if (hit >= 0) {
      boxes[hit] = { x: box.x, y: box.y, w: box.w, h: box.h }
      continue
    }
    boxes.push({ x: box.x, y: box.y, w: box.w, h: box.h })
    fresh = true
  }
  if (fresh) return { seen: { keys, boxes }, streak: 0, pause: false }
  const next = streak + 1
  return { seen: { keys, boxes }, streak: next, pause: next >= 3 }
}

/** Of two shots of the same side, the one with less glare on the card; ties keep the first. */
export function pickCleanerFrame(a: GlareReport, b: GlareReport): { index: 0 | 1; reason: string } {
  const score = (g: GlareReport) => g.largestFraction * 4 + g.fraction
  if (score(b) < score(a) * 0.9) return { index: 1, reason: 'the second, tilted shot had less glare' }
  if (!a.glare && !b.glare) return { index: 0, reason: 'neither shot had glare' }
  return { index: 0, reason: 'the first shot had the same or less glare' }
}
