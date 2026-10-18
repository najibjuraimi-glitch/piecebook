import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decode as decodeJpeg } from 'jpeg-js'
import { MAX_ANGLE_DEG, MIN_SHORT_SIDE_PX, makeSyntheticCard, measurePhoto, type PixelImage, type Quad } from './centering'
import { findCardOutline } from './cardOutline'
import {
  AUTO_CAPTURE_MS,
  BLOWN_LEVEL,
  CARD_RATIO,
  FLATTEN_MARGIN_FRAC,
  HINT_TEXT,
  MAX_LIVE_KEYSTONE_DEG,
  MAX_LIVE_TILT_DEG,
  MIN_COVERAGE,
  MIN_SHARPNESS,
  applyHomography,
  assessFrame,
  brightness,
  flattenCard,
  glareReport,
  homographyFromQuads,
  SCAN_INTERVAL_MS,
  BOX_MOTION_RESIDUAL,
  MOVED_HOLD_MS,
  PAUSE_RESUME_RESIDUAL,
  SCENE_MOVE_FRAC,
  SCENE_MOVE_MAD,
  SCENE_RESET_FRAC,
  SCENE_STEADY_MS,
  boxIoU,
  compareFrames,
  contentMotionComputeCount,
  DIM_FRAME_MEAN,
  dryStreakAfterDiscard,
  emptySeen,
  greyDownscale,
  initialLiveView,
  initialSceneHold,
  insideQuad,
  invertMat3,
  forgetsSeenCards,
  labelOffset,
  markSceneScanned,
  nextDryStreak,
  placeRead,
  rearmAfterDiscard,
  resetsMovedHold,
  resumesPausedScan,
  pickCleanerFrame,
  scanIntervalOpen,
  sceneMoved,
  simulateCaseWatch,
  sharpness,
  simulateDriftScans,
  simulatePausedMotion,
  steadyWaitMs,
  stepFrameHold,
  substantialSceneChange,
  unreadBoxMotion,
  unreadSlabsAreNew,
  shrinkQuad,
  stepLiveView,
  stepSceneHold,
  warpImage,
  type FrameAssessment,
  type HintCode,
} from './cardFrame'

function loadJpegFixture(name: string): PixelImage {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
  const raw = decodeJpeg(readFileSync(join(dir, name)), { useTArray: true })
  return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) }
}

function copy(img: PixelImage): PixelImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
}

function paintRect(img: PixelImage, x0: number, y0: number, w: number, h: number, rgb: [number, number, number]): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * img.width + x) * 4
      img.data[i] = rgb[0]
      img.data[i + 1] = rgb[1]
      img.data[i + 2] = rgb[2]
      img.data[i + 3] = 255
    }
  }
}

function boxBlur(img: PixelImage, r: number): PixelImage {
  const out = new Uint8ClampedArray(img.data.length)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const s = [0, 0, 0]
      let n = 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(img.width - 1, Math.max(0, x + dx))
          const yy = Math.min(img.height - 1, Math.max(0, y + dy))
          const i = (yy * img.width + xx) * 4
          s[0] += img.data[i]
          s[1] += img.data[i + 1]
          s[2] += img.data[i + 2]
          n++
        }
      }
      const o = (y * img.width + x) * 4
      out[o] = s[0] / n
      out[o + 1] = s[1] / n
      out[o + 2] = s[2] / n
      out[o + 3] = 255
    }
  }
  return { width: img.width, height: img.height, data: out }
}

/** A viewfinder-sized frame: card well inside, borders readable. */
function liveFrame(noise = 4): PixelImage {
  return makeSyntheticCard({
    width: 240,
    height: 320,
    card: { x: 50, y: 40, w: 140, h: 196 },
    borders: { left: 12, right: 10, top: 11, bottom: 11 },
    noise,
  })
}

const LIVE_CARD: Quad = [
  { x: 50, y: 40 },
  { x: 189, y: 40 },
  { x: 189, y: 235 },
  { x: 50, y: 235 },
]

function expectNear(p: { x: number; y: number }, x: number, y: number, tol: number) {
  expect(Math.abs(p.x - x)).toBeLessThanOrEqual(tol)
  expect(Math.abs(p.y - y)).toBeLessThanOrEqual(tol)
}

describe('glare: blown-highlight blobs on the card', () => {
  it('a lamp reflection on the card is glare; a clean card is not', () => {
    const clean = liveFrame()
    const none = glareReport(clean, LIVE_CARD)
    expect(none.glare).toBe(false)
    expect(none.blobs).toBe(0)
    expect(none.fraction).toBe(0)

    const lit = copy(clean)
    paintRect(lit, 90, 120, 35, 30, [253, 253, 253])
    const g = glareReport(lit, LIVE_CARD)
    expect(g.glare).toBe(true)
    expect(g.blobs).toBe(1)
    expect(g.largestFraction).toBeGreaterThan(0.03)
    expect(g.largestFraction).toBeLessThan(0.05)
  })

  it('a blown region outside the card quad does not count', () => {
    const img = liveFrame()
    paintRect(img, 2, 260, 40, 40, [255, 255, 255])
    expect(glareReport(img, LIVE_CARD).glare).toBe(false)
    // The same frame read without a quad sees it.
    expect(glareReport(img).glare).toBe(true)
  })

  it('scattered sparkle under the blob floor is not glare', () => {
    const img = liveFrame()
    // 1-pixel points, never touching, far under 2% of the card area.
    for (let k = 0; k < 20; k++) paintRect(img, 70 + k * 5, 100 + (k % 3) * 20, 1, 1, [255, 255, 255])
    const g = glareReport(img, LIVE_CARD)
    expect(g.blobs).toBe(0)
    expect(g.glare).toBe(false)
    expect(g.fraction).toBeGreaterThan(0)
  })

  it('a white border under even light is not blown', () => {
    // Stock in the synthetic card is 250/248/242: below BLOWN_LEVEL in blue.
    const img = liveFrame(0)
    expect(BLOWN_LEVEL).toBe(248)
    expect(glareReport(img, LIVE_CARD).fraction).toBe(0)
  })

  it('a very wide blown area is glare even without one big blob', () => {
    const img = liveFrame(0)
    // Chequerboard of 2×2 blown squares across a third of the card: each is under the floor, together far over 2%.
    for (let y = 60; y < 200; y += 4) for (let x = 60; x < 180; x += 4) paintRect(img, x, y, 2, 2, [255, 255, 255])
    const g = glareReport(img, LIVE_CARD)
    expect(g.blobs).toBe(0)
    expect(g.fraction).toBeGreaterThan(0.02)
    expect(g.glare).toBe(true)
  })
})

describe('blur and light', () => {
  it('a sharp card scores far above the floor and blur brings it down monotonically', () => {
    const sharp = liveFrame()
    const s0 = sharpness(sharp, LIVE_CARD)
    const s1 = sharpness(boxBlur(sharp, 1), LIVE_CARD)
    const s2 = sharpness(boxBlur(sharp, 2), LIVE_CARD)
    const s4 = sharpness(boxBlur(sharp, 4), LIVE_CARD)
    expect(s0).toBeGreaterThan(MIN_SHARPNESS * 20)
    expect(s1).toBeLessThan(s0)
    expect(s2).toBeLessThan(s1)
    expect(s4).toBeLessThan(s2)
    expect(s4).toBeLessThan(MIN_SHARPNESS)
  })

  it('real card photos read as sharp, even at full size where pixel steps are gentler', () => {
    for (const name of ['nami-op09-070-sp-front.jpg', 'nami-op09-070-sp-back.jpg']) {
      const img = loadJpegFixture(name)
      const outline = findCardOutline(img)
      expect(outline.ok).toBe(true)
      if (!outline.ok) return
      expect(sharpness(img, outline.outline.quad)).toBeGreaterThan(MIN_SHARPNESS)
    }
  })

  it('brightness is the mean luminance over the card', () => {
    const img = liveFrame(0)
    const b = brightness(img, LIVE_CARD)
    expect(b).toBeGreaterThan(70)
    expect(b).toBeLessThan(200)
    const dark = { ...img, data: img.data.map((v, i) => (i % 4 === 3 ? v : v * 0.2)) as Uint8ClampedArray }
    expect(brightness(dark, LIVE_CARD)).toBeLessThan(b * 0.3)
  })

  it('a region with too few samples scores 0, not NaN', () => {
    const img = liveFrame(0)
    const tiny: Quad = [
      { x: 100, y: 100 },
      { x: 102, y: 100 },
      { x: 102, y: 102 },
      { x: 100, y: 102 },
    ]
    expect(sharpness(img, tiny)).toBe(0)
  })
})

describe('live frame hints', () => {
  it('a framed, lit, sharp card is ready with no hints', () => {
    const a = assessFrame(liveFrame())
    expect(a.hints).toEqual([])
    expect(a.ready).toBe(true)
    expect(a.outline).not.toBeNull()
    expect(a.outline?.coverage).toBeGreaterThan(0.3)
  })

  it('no card on a plain ground', () => {
    const img = liveFrame()
    paintRect(img, 0, 0, 240, 320, [28, 28, 30])
    const a = assessFrame(img)
    expect(a.hints).toEqual(['no-card'])
    expect(a.ready).toBe(false)
    expect(a.metrics).toBeNull()
  })

  it('a card running out of the frame is off-frame', () => {
    const img = makeSyntheticCard({
      width: 240,
      height: 320,
      card: { x: 40, y: -30, w: 160, h: 224 },
      borders: { left: 12, right: 10, top: 11, bottom: 11 },
    })
    expect(assessFrame(img).hints).toEqual(['off-frame'])
  })

  it('a small card is too far, a frame-filling one too close', () => {
    const far = makeSyntheticCard({
      width: 240,
      height: 320,
      card: { x: 78, y: 102, w: 84, h: 117 },
      borders: { left: 7, right: 7, top: 7, bottom: 7 },
    })
    expect(assessFrame(far).hints).toContain('too-far')
    const close = makeSyntheticCard({
      width: 240,
      height: 320,
      card: { x: 8, y: 8, w: 224, h: 304 },
      borders: { left: 20, right: 18, top: 20, bottom: 20 },
    })
    expect(assessFrame(close).hints).toContain('too-close')
  })

  it('too dark comes before blur; glare is its own hint', () => {
    const live = liveFrame()
    const dark = { ...live, data: live.data.map((v, i) => (i % 4 === 3 ? v : v * 0.2)) as Uint8ClampedArray }
    const d = assessFrame(dark)
    expect(d.hints[0]).toBe('dark')
    expect(d.ready).toBe(false)

    const lit = copy(live)
    paintRect(lit, 90, 120, 35, 30, [253, 253, 253])
    expect(assessFrame(lit).hints).toEqual(['glare'])

    expect(assessFrame(boxBlur(live, 4)).hints).toEqual(['blur'])
  })

  it('a clearly keystoned card is asked to be held flat', () => {
    const img = makeSyntheticCard({
      width: 240,
      height: 320,
      card: { x: 40, y: 40, w: 160, h: 224 },
      borders: { left: 12, right: 10, top: 11, bottom: 11 },
      topSqueeze: 0.3,
    })
    const a = assessFrame(img)
    expect(a.outline?.keystoneDeg).toBeGreaterThan(MAX_LIVE_KEYSTONE_DEG)
    expect(a.hints).toContain('tilted')
  })

  it('an in-plane turn is asked to line up with the outline, not to hold flat', () => {
    const img = makeSyntheticCard({
      width: 240,
      height: 320,
      card: { x: 60, y: 60, w: 120, h: 168 },
      borders: { left: 10, right: 8, top: 9, bottom: 9 },
      rotateDeg: 14,
    })
    const a = assessFrame(img)
    expect(a.outline?.tiltDeg).toBeGreaterThan(MAX_LIVE_TILT_DEG)
    expect(a.hints).toContain('rotated')
    expect(a.hints).not.toContain('tilted')
  })

  it('every hint has short plain wording and the auto-capture hold is about half a second', () => {
    for (const text of Object.values(HINT_TEXT)) {
      expect(text.length).toBeLessThan(90)
      expect(text).not.toMatch(/keystone|laplacian|homograph/i)
    }
    expect(AUTO_CAPTURE_MS).toBe(500)
  })
})

describe('quad helpers', () => {
  it('insideQuad and shrinkQuad', () => {
    expect(insideQuad(LIVE_CARD, 100, 100)).toBe(true)
    expect(insideQuad(LIVE_CARD, 10, 10)).toBe(false)
    const s = shrinkQuad(LIVE_CARD, 0.1)
    expectNear(s[0], 50 + 139 * 0.05, 40 + 195 * 0.05, 0.01)
    expect(insideQuad(s, 51, 41)).toBe(false)
  })
})

describe('corner detection', () => {
  it('finds the four corners of a square-on card to the pixel', () => {
    const img = makeSyntheticCard({
      width: 1200,
      height: 1600,
      card: { x: 150, y: 140, w: 900, h: 1257 },
      borders: { left: 120, right: 80, top: 90, bottom: 90 },
      noise: 4,
    })
    const r = findCardOutline(img)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [tl, tr, br, bl] = r.outline.quad
    expectNear(tl, 150, 140, 1.5)
    expectNear(tr, 1049, 140, 1.5)
    expectNear(br, 1049, 1396, 1.5)
    expectNear(bl, 150, 1396, 1.5)
    expect(r.outline.keystoneDeg).toBeLessThan(3)
    expect(r.outline.tiltDeg).toBeLessThan(1)
    expect(r.outline.coverage).toBeCloseTo((900 * 1257) / (1200 * 1600), 1)
  })

  it('reports no card and a cut-off card as such', () => {
    const blank: PixelImage = { width: 240, height: 320, data: new Uint8ClampedArray(240 * 320 * 4).fill(30) }
    expect(findCardOutline(blank)).toEqual({ ok: false, reason: 'no-card' })
    const cut = makeSyntheticCard({
      width: 240,
      height: 320,
      card: { x: 40, y: -30, w: 160, h: 224 },
      borders: { left: 12, right: 10, top: 11, bottom: 11 },
    })
    expect(findCardOutline(cut)).toEqual({ ok: false, reason: 'cut-off' })
  })
})

describe('homography', () => {
  const unit: Quad = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]
  const trap: Quad = [
    { x: 120, y: 60 },
    { x: 880, y: 60 },
    { x: 999, y: 1399 },
    { x: 0, y: 1399 },
  ]

  it('maps each source corner onto its destination corner', () => {
    const H = homographyFromQuads(unit, trap)
    expect(H).not.toBeNull()
    if (!H) return
    for (let i = 0; i < 4; i++) expectNear(applyHomography(H, unit[i]), trap[i].x, trap[i].y, 1e-6)
    // Straight lines stay straight: the midpoint of the top edge lands on the top edge.
    expectNear(applyHomography(H, { x: 0.5, y: 0 }), 500, 60, 1e-6)
  })

  it('identity in, identity out; the inverse round-trips', () => {
    const I = homographyFromQuads(trap, trap)
    expect(I).not.toBeNull()
    if (!I) return
    expectNear(applyHomography(I, { x: 333, y: 777 }), 333, 777, 1e-6)
    const H = homographyFromQuads(unit, trap) as NonNullable<ReturnType<typeof homographyFromQuads>>
    const Hinv = invertMat3(H)
    expect(Hinv).not.toBeNull()
    if (!Hinv) return
    const p = applyHomography(Hinv, applyHomography(H, { x: 0.3, y: 0.8 }))
    expectNear(p, 0.3, 0.8, 1e-9)
  })

  it('a degenerate quad (three corners on a line) gives null', () => {
    const flat: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
    ]
    expect(homographyFromQuads(flat, unit)).toBeNull()
  })

  it('warpImage resamples through the inverse map and repeats the edge past the source', () => {
    const src = liveFrame(0)
    const H = homographyFromQuads(unit, unit) as NonNullable<ReturnType<typeof homographyFromQuads>>
    const same = warpImage(src, H, src.width, src.height)
    expect(Array.from(same.data.subarray(0, 4000))).toEqual(Array.from(src.data.subarray(0, 4000)))
    // Shift by 10 px: the first 10 output columns copy the source's left edge.
    const shift: ReturnType<typeof invertMat3> = [1, 0, -10, 0, 1, 0, 0, 0, 1]
    const moved = warpImage(src, shift as NonNullable<typeof shift>, src.width, src.height)
    const at = (img: PixelImage, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3))
    expect(at(moved, 5, 100)).toEqual(at(src, 0, 100))
    expect(at(moved, 60, 100)).toEqual(at(src, 50, 100))
  })
})

describe('flattening an angled shot', () => {
  const W = 1200
  const H = 1600
  const flat = makeSyntheticCard({
    width: W,
    height: H,
    card: { x: 150, y: 140, w: 900, h: 1257 },
    borders: { left: 48, right: 32, top: 36, bottom: 36 },
    noise: 4,
  })
  const frame: Quad = [
    { x: 0, y: 0 },
    { x: W - 1, y: 0 },
    { x: W - 1, y: H - 1 },
    { x: 0, y: H - 1 },
  ]
  /** The flat shot seen with the phone tipped: the top edge drawn `squeeze` px narrower each side. */
  const tipped = (squeeze: number): PixelImage => {
    const to: Quad = [
      { x: squeeze, y: 40 },
      { x: W - 1 - squeeze, y: 40 },
      { x: W - 1, y: H - 1 },
      { x: 0, y: H - 1 },
    ]
    const Hm = homographyFromQuads(frame, to) as NonNullable<ReturnType<typeof homographyFromQuads>>
    return warpImage(flat, invertMat3(Hm) as NonNullable<ReturnType<typeof invertMat3>>, W, H)
  }

  it('the square-on shot is the truth: 60/40 · 50/50', () => {
    const t = measurePhoto(flat, 'front')
    expect(t.ok).toBe(true)
    if (!t.ok) return
    // One pixel of the ink line moves a narrow frame by a point. The bar is ±2.
    expect(Math.abs(t.measure.lr.largerPct - 60)).toBeLessThanOrEqual(2)
    expect(Math.abs(t.measure.tb.largerPct - 50)).toBeLessThanOrEqual(2)
  })

  it('a slightly angled shot is rejected raw but measures the same once flattened', () => {
    const angled = tipped(90)
    const raw = measurePhoto(angled, 'front')
    expect(raw.ok).toBe(false)
    expect(!raw.ok && raw.code).toBe('angled')

    const f = flattenCard(angled)
    expect(f.flattened).toBe(true)
    if (!f.flattened) return
    expect(f.outline.keystoneDeg).toBeGreaterThan(MAX_LIVE_KEYSTONE_DEG)
    expect(f.image.width / f.image.height).toBeCloseTo((CARD_RATIO * (1 + 2 * FLATTEN_MARGIN_FRAC)) / (1 + 2 * FLATTEN_MARGIN_FRAC * CARD_RATIO), 1)
    expect(Math.min(f.image.width, f.image.height)).toBeGreaterThanOrEqual(MIN_SHORT_SIDE_PX)
    const m = measurePhoto(f.image, 'front')
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.measure.resolved).toBe(true)
    expect(Math.abs(m.measure.lr.largerPct - 60)).toBeLessThanOrEqual(2)
    expect(Math.abs(m.measure.tb.largerPct - 50)).toBeLessThanOrEqual(2)
    expect(m.measure.maxAngleErrorDeg).toBeLessThan(MAX_ANGLE_DEG)
  })

  it('with the flattened corners handed over, the measure skips the search and reads the same', () => {
    const f = flattenCard(tipped(90))
    if (!f.flattened) throw new Error('expected flatten')
    const m = measurePhoto(f.image, 'front', { outline: f.cardQuad })
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.measure.resolved).toBe(true)
    expect(Math.abs(m.measure.lr.largerPct - 60)).toBeLessThanOrEqual(2)
    expect(Math.abs(m.measure.tb.largerPct - 50)).toBeLessThanOrEqual(2)
    expect(m.measure.maxAngleErrorDeg).toBe(0)
    // The outline is trusted for where the card is, not for the print edges: these still come from the pixels.
    expect(m.measure.left).toBeGreaterThan(m.measure.right)
  })

  it('a strongly angled shot flattens too', () => {
    const f = flattenCard(tipped(220))
    expect(f.flattened).toBe(true)
    const m = measurePhoto(f.image, 'front')
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(Math.abs(m.measure.lr.largerPct - 60)).toBeLessThanOrEqual(2)
    expect(Math.abs(m.measure.tb.largerPct - 50)).toBeLessThanOrEqual(2)
  })

  it('the card lands where cardQuad says, with a margin of ground around it', () => {
    const f = flattenCard(tipped(90))
    if (!f.flattened) throw new Error('expected flatten')
    const found = findCardOutline(f.image)
    expect(found.ok).toBe(true)
    if (!found.ok) return
    for (let i = 0; i < 4; i++) expectNear(found.outline.quad[i], f.cardQuad[i].x, f.cardQuad[i].y, 2.5)
    expect(f.cardQuad[0].x).toBeGreaterThan(20)
  })

  it('a small card (the least the live view accepts) is drawn up to the measuring floor rather than under it', () => {
    const small = makeSyntheticCard({
      width: 900,
      height: 1200,
      card: { x: 240, y: 307, w: 420, h: 587 },
      borders: { left: 30, right: 20, top: 24, bottom: 24 },
      noise: 4,
    })
    const o = findCardOutline(small)
    expect(o.ok && o.outline.coverage).toBeGreaterThan(MIN_COVERAGE)
    const f = flattenCard(small)
    expect(f.flattened).toBe(true)
    expect(Math.min(f.image.width, f.image.height)).toBeGreaterThanOrEqual(MIN_SHORT_SIDE_PX)
    const m = measurePhoto(f.image, 'front')
    expect(m.ok).toBe(true)
    expect(m.ok && m.measure.lr.label).toBe('60/40')
  })

  it('falls back to the raw image with a reason when no corners are found', () => {
    const blank: PixelImage = { width: 900, height: 1200, data: new Uint8ClampedArray(900 * 1200 * 4).fill(30) }
    const f = flattenCard(blank)
    expect(f.flattened).toBe(false)
    expect(!f.flattened && f.reason).toBe('no-card')
    expect(f.image).toBe(blank)
  })
})

describe('glare retry: keep the cleaner of two shots', () => {
  const clean = { fraction: 0, largestFraction: 0, blobs: 0, glare: false }
  const bad = { fraction: 0.05, largestFraction: 0.04, blobs: 1, glare: true }
  const worse = { fraction: 0.09, largestFraction: 0.08, blobs: 1, glare: true }

  it('takes the retry when it is cleaner, keeps the first otherwise', () => {
    expect(pickCleanerFrame(bad, clean).index).toBe(1)
    expect(pickCleanerFrame(bad, worse).index).toBe(0)
    expect(pickCleanerFrame(bad, bad).index).toBe(0)
    expect(pickCleanerFrame(clean, clean)).toEqual({ index: 0, reason: 'neither shot had glare' })
  })

  it('always says why, for the "which frame was used" line', () => {
    expect(pickCleanerFrame(bad, clean).reason).toMatch(/second/)
    expect(pickCleanerFrame(bad, worse).reason).toMatch(/first/)
  })
})

describe('live view: hints settle and auto-capture waits', () => {
  const quad = (dx = 0): Quad => [
    { x: 40 + dx, y: 30 },
    { x: 200 + dx, y: 30 },
    { x: 200 + dx, y: 250 },
    { x: 40 + dx, y: 250 },
  ]
  const frame = (ready: boolean, hint: HintCode, q: Quad | null): FrameAssessment => ({
    outline: q ? { quad: q, keystoneDeg: 1, tiltDeg: 0, coverage: 0.4, support: [1, 1, 1, 1], confidence: 1 } : null,
    hints: ready ? [] : [hint],
    ready,
    metrics: null,
  })

  it('keeps the hint through one dissenting frame and changes it after two', () => {
    let s = initialLiveView(0)
    s = stepLiveView(s, frame(false, 'blur', quad()), 100).state
    let step = stepLiveView(s, frame(false, 'blur', quad(1)), 250)
    expect(step.state.shown).toBe('blur')
    step = stepLiveView(step.state, frame(false, 'glare', quad(1)), 400)
    expect(step.state.shown).toBe('blur')
    step = stepLiveView(step.state, frame(false, 'glare', quad(1)), 550)
    expect(step.state.shown).toBe('glare')
  })

  it('does not auto-capture before the arm delay, then does once the hold is up', () => {
    let s = initialLiveView(0)
    s = stepLiveView(s, frame(true, 'blur', quad()), 200).state
    let step = stepLiveView(s, frame(true, 'blur', quad(1)), 400)
    expect(step.ready).toBe(true)
    expect(step.capture).toBe(false)
    step = stepLiveView(step.state, frame(true, 'blur', quad(1)), 700)
    expect(step.capture).toBe(false)
    step = stepLiveView(step.state, frame(true, 'blur', quad(2)), 1100)
    expect(step.capture).toBe(true)
  })

  it('one bad frame does not throw away a hold that was already running', () => {
    let s = initialLiveView(0)
    s = stepLiveView(s, frame(true, 'blur', quad()), 1000).state
    s = stepLiveView(s, frame(true, 'blur', quad(1)), 1200).state
    const running = stepLiveView(s, frame(false, 'blur', quad(1)), 1400)
    expect(running.state.readySince).toBe(1200)
    const back = stepLiveView(running.state, frame(true, 'blur', quad(1)), 1550)
    expect(back.state.readySince).toBe(1200)
    expect(back.capture).toBe(false)
    const fired = stepLiveView(back.state, frame(true, 'blur', quad(1)), 1750)
    expect(fired.capture).toBe(true)
  })

  it('offers the shutter when a found card stays not-ready', () => {
    let s = initialLiveView(0)
    s = stepLiveView(s, frame(false, 'too-far', quad()), 100).state
    let step = stepLiveView(s, frame(false, 'too-far', quad()), 250)
    expect(step.offerShutter).toBe(false)
    expect(step.state.shown).toBe('too-far')
    step = stepLiveView(step.state, frame(false, 'too-far', quad(20)), 4000)
    expect(step.offerShutter).toBe(true)
    expect(step.capture).toBe(false)
  })
})

function patterned(width = 32, height = 24) {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data[y * width + x] = (x * 13 + y * 29) % 251
  }
  return { width, height, data }
}

function shiftGrey(frame: { width: number; height: number; data: Uint8Array }, dx: number) {
  const data = new Uint8Array(frame.data.length)
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const sx = x - dx
      data[y * frame.width + x] = sx >= 0 && sx < frame.width ? frame.data[y * frame.width + sx] : 0
    }
  }
  return { width: frame.width, height: frame.height, data }
}

function brighten(frame: { width: number; height: number; data: Uint8Array }, delta: number) {
  const data = new Uint8Array(frame.data.length)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.max(0, Math.min(255, frame.data[i] + delta))
  return { width: frame.width, height: frame.height, data }
}

function translateImage(img: PixelImage, frac: number): PixelImage {
  const dx = Math.round(img.width * frac)
  const data = new Uint8ClampedArray(img.data.length)
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const sx = x - dx
      const di = (y * img.width + x) * 4
      if (sx < 0 || sx >= img.width) {
        data[di] = data[di + 1] = data[di + 2] = 128
        data[di + 3] = 255
        continue
      }
      const si = (y * img.width + sx) * 4
      data[di] = img.data[si]
      data[di + 1] = img.data[si + 1]
      data[di + 2] = img.data[si + 2]
      data[di + 3] = 255
    }
  }
  return { width: img.width, height: img.height, data }
}

function sensorNoise(img: PixelImage): PixelImage {
  const data = new Uint8ClampedArray(img.data)
  for (let i = 0; i < data.length; i += 4) {
    const delta = (i / 4) % 2 === 0 ? 2 : -2
    data[i] = Math.max(0, Math.min(255, data[i] + delta))
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + delta))
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + delta))
  }
  return { width: img.width, height: img.height, data }
}

function translateSubpixel(img: PixelImage, fracX: number, fracY = 0): PixelImage {
  const dx = img.width * fracX
  const dy = img.height * fracY
  const data = new Uint8ClampedArray(img.data.length)
  const at = (x: number, y: number) => {
    const cx = Math.min(img.width - 1, Math.max(0, x))
    const cy = Math.min(img.height - 1, Math.max(0, y))
    const i = (cy * img.width + cx) * 4
    return [img.data[i], img.data[i + 1], img.data[i + 2]]
  }
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const sx = x - dx
      const sy = y - dy
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const tx = sx - x0
      const ty = sy - y0
      const a = at(x0, y0)
      const b = at(x0 + 1, y0)
      const c = at(x0, y0 + 1)
      const d = at(x0 + 1, y0 + 1)
      const mix = (i: number) => a[i] * (1 - tx) * (1 - ty) + b[i] * tx * (1 - ty) + c[i] * (1 - tx) * ty + d[i] * tx * ty
      const di = (y * img.width + x) * 4
      data[di] = mix(0)
      data[di + 1] = mix(1)
      data[di + 2] = mix(2)
      data[di + 3] = 255
    }
  }
  return { width: img.width, height: img.height, data }
}

function caseGrid(): PixelImage {
  const width = 240
  const height = 180
  const data = new Uint8ClampedArray(width * height * 4)
  const img = { width, height, data }
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const tone = 30 + (row * 3 + col) * 35
      paintRect(img, col * 80, row * 90, 80, 90, [tone, tone, tone])
    }
  }
  return img
}

function repaint(img: PixelImage, x0: number, y0: number, w: number, h: number): PixelImage {
  const out = copy(img)
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const on = ((x >> 2) + (y >> 2)) % 2 === 0
      const v = on ? 245 : 12
      const i = (y * img.width + x) * 4
      out.data[i] = v
      out.data[i + 1] = v
      out.data[i + 2] = v
      out.data[i + 3] = 255
    }
  }
  return out
}

/** A single slab. Small enough that the residual stays under a row swap. */
function swapLeftOfRow1(img: PixelImage): PixelImage {
  return repaint(img, 8, 8, 40, 36)
}

function swapWholeRow1(img: PixelImage): PixelImage {
  return repaint(img, 0, 0, img.width, 90)
}

function casePortrait(): PixelImage {
  const width = 196
  const height = 256
  const data = new Uint8ClampedArray(width * height * 4)
  const cols = 3
  const rows = 4
  const cw = Math.floor(width / cols)
  const ch = Math.floor(height / rows)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const col = Math.min(cols - 1, Math.floor(x / cw))
      const row = Math.min(rows - 1, Math.floor(y / ch))
      const period = 12 + row * 4
      const phase = col * 5 + row
      const on = Math.floor((x + phase * 3) / period) % 2 === Math.floor((y + phase) / (8 + col * 2)) % 2
      const tone = on ? 30 + row * 25 + col * 15 : 210 - row * 10
      const i = (y * width + x) * 4
      data[i] = tone
      data[i + 1] = Math.min(255, tone + 20)
      data[i + 2] = Math.max(0, 180 - tone)
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

function noisy(img: PixelImage, sigma: number, seed = 8): PixelImage {
  const out = copy(img)
  let state = seed
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  for (let i = 0; i < out.data.length; i += 4) {
    const u = Math.max(1e-9, rand())
    const v = rand()
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma
    out.data[i] = Math.max(0, Math.min(255, Math.round(out.data[i] + n)))
    out.data[i + 1] = Math.max(0, Math.min(255, Math.round(out.data[i + 1] + n)))
    out.data[i + 2] = Math.max(0, Math.min(255, Math.round(out.data[i + 2] + n)))
  }
  return out
}

function expose(img: PixelImage, factor: number): PixelImage {
  const data = new Uint8ClampedArray(img.data.length)
  for (let i = 0; i < img.data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, Math.round(img.data[i] * factor)))
    data[i + 1] = Math.max(0, Math.min(255, Math.round(img.data[i + 1] * factor)))
    data[i + 2] = Math.max(0, Math.min(255, Math.round(img.data[i + 2] * factor)))
    data[i + 3] = 255
  }
  return { width: img.width, height: img.height, data }
}

function contentFlicker(frame: { width: number; height: number; data: Uint8Array }) {
  const data = new Uint8Array(frame.data)
  for (let y = 4; y < 20; y += 1) {
    for (let x = 4; x < 28; x += 1) data[y * frame.width + x] = 255 - data[y * frame.width + x]
  }
  return { width: frame.width, height: frame.height, data }
}

describe('case view: one steady second, then not the same scene again', () => {
  const base = patterned()

  it('is ready after a second of the same view and does not scan that view again', () => {
    let step = stepSceneHold(initialSceneHold(), base, 0)
    expect(step.ready).toBe(false)
    step = stepSceneHold(step.state, brighten(base, 2), 100)
    expect(step.steady).toBe(true)
    expect(step.ready).toBe(false)
    expect(step.state.steadySince).toBe(100)
    step = stepSceneHold(step.state, brighten(base, -2), 100 + SCENE_STEADY_MS - 1)
    expect(step.ready).toBe(false)
    step = stepSceneHold(step.state, base, 100 + SCENE_STEADY_MS)
    expect(step.ready).toBe(true)
    step = stepSceneHold(markSceneScanned(step.state), base, 5000)
    expect(step.ready).toBe(false)
    expect(step.moved).toBe(false)
  })

  it('ends the spell when the picture shifts', () => {
    let step = stepSceneHold(initialSceneHold(), base, 0)
    step = stepSceneHold(step.state, brighten(base, 1), 200)
    const moved = stepSceneHold(markSceneScanned(step.state), shiftGrey(base, 8), 800)
    expect(moved.moved).toBe(true)
    expect(moved.state.scanned).toBe(false)
    expect(moved.state.steadySince).toBeNull()
    const held = stepSceneHold(moved.state, shiftGrey(base, 8), 900)
    expect(held.ready).toBe(false)
    const again = stepSceneHold(held.state, shiftGrey(base, 8), 900 + SCENE_STEADY_MS)
    expect(again.ready).toBe(true)
  })

  it('forgives one flicker that is not a pan and resets on the next', () => {
    let step = stepSceneHold(initialSceneHold(), base, 0)
    step = stepSceneHold(step.state, base, 100)
    const flicker = contentFlicker(base)
    const motion = compareFrames(base, flicker)
    expect(motion.shiftFrac).toBeLessThan(SCENE_MOVE_FRAC)
    expect(motion.residual).toBeGreaterThanOrEqual(SCENE_MOVE_MAD)
    const wobble = stepSceneHold(step.state, flicker, 200)
    expect(wobble.moved).toBe(false)
    expect(wobble.state.steadySince).toBe(100)
    const lost = stepSceneHold(wobble.state, flicker, 300)
    expect(lost.moved).toBe(true)
  })

  it('waits four seconds between automatic scans, and lets the first one go', () => {
    expect(scanIntervalOpen(null, 1000)).toBe(true)
    expect(scanIntervalOpen(1000, 1000 + SCAN_INTERVAL_MS - 1)).toBe(false)
    expect(scanIntervalOpen(1000, 1000 + SCAN_INTERVAL_MS)).toBe(true)
  })

  it('counts a 10% and a 20% pan of the case fixture as moved, and sensor noise as still', () => {
    const full = loadJpegFixture('full.jpg')
    const anchor = greyDownscale(full)
    const ten = compareFrames(anchor, greyDownscale(translateImage(full, 0.1)))
    const twenty = compareFrames(anchor, greyDownscale(translateImage(full, 0.2)))
    const still = compareFrames(anchor, greyDownscale(sensorNoise(full)))
    expect(Math.abs(ten.shiftFrac - 0.1)).toBeLessThan(0.03)
    expect(sceneMoved(ten)).toBe(true)
    expect(Math.abs(twenty.shiftFrac - 0.2)).toBeLessThan(0.03)
    expect(sceneMoved(twenty)).toBe(true)
    expect(still.shiftFrac).toBeLessThan(SCENE_MOVE_FRAC)
    expect(still.residual).toBeLessThan(SCENE_MOVE_MAD)
    expect(sceneMoved(still)).toBe(false)
  })

  it('keeps a 0.5% to 1% tremble and a 10% exposure change on the generated case grid', () => {
    const full = loadJpegFixture('full.jpg')
    const anchor = greyDownscale(full)
    for (const frac of [0.0025, -0.0025, 0.005, -0.005, 0.01, -0.01]) {
      const motion = compareFrames(anchor, greyDownscale(translateSubpixel(full, frac, frac * 0.3)))
      expect(motion.shiftFrac).toBeLessThan(SCENE_MOVE_FRAC)
      expect(motion.residual).toBeLessThan(SCENE_MOVE_MAD)
      expect(sceneMoved(motion)).toBe(false)
    }
    for (const factor of [1.1, 0.9]) {
      const motion = compareFrames(anchor, greyDownscale(expose(full, factor)))
      expect(motion.shiftFrac).toBeLessThan(SCENE_MOVE_FRAC)
      expect(motion.residual).toBeLessThan(SCENE_MOVE_MAD)
      expect(sceneMoved(motion)).toBe(false)
    }
    let step = stepSceneHold(initialSceneHold(), anchor, 0)
    let t = 100
    for (const frac of [0.0025, -0.0025, 0.005, -0.005, 0.01, -0.01]) {
      step = stepSceneHold(step.state, greyDownscale(translateSubpixel(full, frac)), t)
      expect(step.moved).toBe(false)
      t += 200
    }
    step = stepSceneHold(step.state, greyDownscale(expose(full, 1.1)), t)
    expect(step.moved).toBe(false)
    expect(step.steady).toBe(true)
  })

  it('resets a portrait frame on a sideways pan of about 20% of the width', () => {
    const portrait = loadJpegFixture('portrait.jpg')
    const anchor = greyDownscale(portrait)
    expect(anchor.height).toBeGreaterThan(anchor.width)
    const side = compareFrames(anchor, greyDownscale(translateImage(portrait, 0.2)))
    expect(Math.abs(Math.abs(side.dx) / anchor.width - 0.2)).toBeLessThan(0.04)
    expect(side.shiftFrac).toBeGreaterThanOrEqual(0.18)
    expect(substantialSceneChange(side)).toBe(true)
    const smaller = compareFrames(anchor, greyDownscale(translateImage(portrait, 0.1)))
    expect(sceneMoved(smaller)).toBe(true)
    expect(substantialSceneChange(smaller)).toBe(false)
  })

  it('waits three seconds of steadiness after two moved reads, and one second otherwise', () => {
    expect(steadyWaitMs(0)).toBe(SCENE_STEADY_MS)
    expect(steadyWaitMs(1)).toBe(SCENE_STEADY_MS)
    expect(steadyWaitMs(2)).toBe(MOVED_HOLD_MS)
    let step = stepSceneHold(initialSceneHold(), base, 0, MOVED_HOLD_MS)
    step = stepSceneHold(step.state, base, 100, MOVED_HOLD_MS)
    step = stepSceneHold(step.state, base, 100 + SCENE_STEADY_MS, MOVED_HOLD_MS)
    expect(step.steady).toBe(true)
    expect(step.ready).toBe(false)
    step = stepSceneHold(step.state, base, 100 + MOVED_HOLD_MS, MOVED_HOLD_MS)
    expect(step.ready).toBe(true)
    const jumped = stepSceneHold(step.state, base, 50, MOVED_HOLD_MS)
    expect(jumped.state.steadySince).toBe(50)
    expect(jumped.ready).toBe(false)
  })

  it('pauses after three scans that add no new card', () => {
    let seen = emptySeen()
    let streak = 0
    const step = (cards: { printId?: string | null; codeText?: string | null }[]) => {
      const next = nextDryStreak(seen, streak, cards)
      seen = next.seen
      streak = next.streak
      return next
    }
    expect(step([{ printId: 'OP09-004p2', codeText: 'OP09-004' }]).pause).toBe(false)
    expect(streak).toBe(0)
    expect(step([{ printId: 'OP09-004p2' }]).pause).toBe(false)
    expect(step([{ codeText: 'OP09-004p2' }]).streak).toBe(2)
    expect(step([{ printId: '', codeText: '  ' }]).pause).toBe(true)
    expect(streak).toBe(3)
    const box = { x: 0.1, y: 0.2, w: 0.2, h: 0.3 }
    const unread = nextDryStreak(emptySeen(), 2, [{ printId: '', codeText: '', box }])
    expect(unread.streak).toBe(0)
    expect(unread.pause).toBe(false)
    const samePlace = nextDryStreak(unread.seen, 0, [{ codeText: '', box: { x: 0.12, y: 0.18, w: 0.22, h: 0.28 } }])
    expect(samePlace.streak).toBe(1)
    const otherPlace = nextDryStreak(samePlace.seen, samePlace.streak, [{ box: { x: 0.6, y: 0.2, w: 0.2, h: 0.3 } }])
    expect(otherPlace.streak).toBe(0)
    const resumed = nextDryStreak(seen, 0, [{ printId: 'EB04-003' }])
    expect(resumed.pause).toBe(false)
    expect(resumed.streak).toBe(0)
    const again = nextDryStreak(resumed.seen, resumed.streak, [{ codeText: 'EB04-003' }])
    expect(again.streak).toBe(1)
    expect(again.pause).toBe(false)
  })

  it('matches an unread slab by overlap after the shift, including y 0.25 and 0.247', () => {
    const firstBox = { x: 0.2, y: 0.25, w: 0.3, h: 0.4 }
    const nudged = { x: 0.2, y: 0.247, w: 0.3, h: 0.4 }
    expect(Math.round(firstBox.y * 10) / 10).not.toBe(Math.round(nudged.y * 10) / 10)
    expect(boxIoU(firstBox, nudged)).toBeGreaterThanOrEqual(0.5)
    const first = nextDryStreak(emptySeen(), 2, [{ printId: '', codeText: '', box: firstBox }])
    expect(first.streak).toBe(0)
    expect(first.pause).toBe(false)
    const second = nextDryStreak(first.seen, 0, [{ box: nudged }])
    expect(second.streak).toBe(1)
    expect(second.pause).toBe(false)
    const slid = { x: 0.4, y: 0.25, w: 0.3, h: 0.4 }
    expect(boxIoU(firstBox, slid)).toBeLessThan(0.5)
    const width = 100
    const shifted = nextDryStreak(first.seen, 0, [{ box: slid }], { dx: 0.2 * width, dy: 0, width, height: 80 })
    expect(shifted.streak).toBe(1)
    const trusted = { mad: 0, residual: BOX_MOTION_RESIDUAL - 1, dx: 20, dy: 0, shiftFrac: 0.2 }
    const shaky = { ...trusted, residual: BOX_MOTION_RESIDUAL }
    expect(unreadBoxMotion(trusted, width, 80)).toEqual({ dx: 20, dy: 0, width, height: 80 })
    expect(unreadBoxMotion(shaky, width, 80)).toBeNull()
    const refused = nextDryStreak(first.seen, 2, [{ box: slid }], unreadBoxMotion(shaky, width, 80))
    expect(refused.streak).toBe(0)
    expect(refused.pause).toBe(false)
  })

  it('stops a slow drift within three scans or with a pause', () => {
    for (const drift of [0.003, 0.002]) {
      const session = simulateDriftScans(drift, 360_000, 33_700)
      expect(session.scans <= 3 || session.paused).toBe(true)
    }
  })

  it('resumes a pause on a fifth of the frame or a local-mean residual of 16, and not on a shadow', () => {
    const pan = simulatePausedMotion(0.3, 1_500, 30_000)
    expect(pan.resumed).toBe(true)
    expect(pan.scans).toBeGreaterThan(0)
    const drift = simulatePausedMotion(0.003, 60_000)
    expect(drift.resumed).toBe(false)
    expect(drift.scans).toBe(0)
    const shadow = simulatePausedMotion(0, 60_000, 0, 8.7)
    expect(shadow.resumed).toBe(false)
    expect(shadow.scans).toBe(0)
    const changed = simulatePausedMotion(0, 1_000, 2_000, PAUSE_RESUME_RESIDUAL)
    expect(changed.resumed).toBe(true)
    expect(changed.scans).toBeGreaterThan(0)
    const sway = { mad: 8, residual: 2, dx: 8, dy: 0, shiftFrac: 0.08 }
    const fifteen = { mad: 8, residual: 2, dx: 15, dy: 0, shiftFrac: 0.15, contentShiftFrac: 0.15, contentResidual: 3 }
    const slide = { mad: 8, residual: 2, dx: 20, dy: 0, shiftFrac: SCENE_RESET_FRAC }
    const shade = { mad: 30, residual: 31, dx: 0, dy: 0, shiftFrac: 0, contentResidual: 8.7 }
    expect(resumesPausedScan(sway)).toBe(false)
    expect(resumesPausedScan(fifteen)).toBe(false)
    expect(resumesPausedScan(slide)).toBe(true)
    expect(resumesPausedScan(shade)).toBe(false)
    expect(resumesPausedScan({ ...shade, contentResidual: undefined, residual: 31 })).toBe(true)
    expect(resumesPausedScan({ ...shade, residual: PAUSE_RESUME_RESIDUAL, contentResidual: PAUSE_RESUME_RESIDUAL })).toBe(true)
    const swapped = { mad: 20, residual: 8.1, dx: 8, dy: 0, shiftFrac: 0.08 }
    expect(placeRead(swapped)).toBe('discard')
    const kept = { mad: 20, residual: 5, dx: 8, dy: 0, shiftFrac: 0.08 }
    expect(placeRead(kept)).toBe('show')
    expect(labelOffset(kept, 100, 80)).toEqual({ x: 0.08, y: 0 })
  })

  it('counts a residual-only discard toward the dry streak, and not a slide', () => {
    const blink = { mad: 30, residual: 23.6, dx: 0, dy: 0, shiftFrac: 0 }
    expect(placeRead(blink)).toBe('discard')
    let streak = 0
    let pause = false
    for (let i = 0; i < 3; i += 1) {
      const step = dryStreakAfterDiscard(streak, blink)
      expect(step).not.toBeNull()
      streak = step!.streak
      pause = step!.pause
    }
    expect(streak).toBe(3)
    expect(pause).toBe(true)
    const slide = { mad: 10, residual: 2, dx: 8, dy: 0, shiftFrac: SCENE_MOVE_FRAC }
    expect(dryStreakAfterDiscard(2, slide)).toBeNull()
  })

  it('keeps a wobble of 8% paused near four scans, and a blink near three', () => {
    const wobble = simulateCaseWatch({
      durationMs: 120_000,
      readMs: 2_000,
      position: (t) => 0.08 * Math.sin((2 * Math.PI * t) / 8_000),
      residual: () => 0,
    })
    expect(wobble.scans).toBe(4)
    expect(wobble.paused).toBe(true)
    expect(wobble.resumedSameTick).toBe(false)
    expect(wobble.resumeCount).toBe(0)

    const phase = (t: number) => Math.floor(t / 3000) % 2
    const blink = simulateCaseWatch({
      durationMs: 300_000,
      readMs: 2_000,
      position: () => 0,
      residual: (from, to) => (phase(from) === phase(to) ? 0 : 23.6),
      contentResidual: (from, to) => (phase(from) === phase(to) ? 0 : 4),
    })
    expect(blink.scans).toBe(3)
    expect(blink.paused).toBe(true)
    expect(blink.resumeCount).toBe(0)
    expect(blink.resumedSameTick).toBe(false)
  })

  it('does not resume a slow read on the tick it pauses, and a row swap still resumes', () => {
    const watch = (rate: number) =>
      simulateCaseWatch({
        durationMs: 360_000,
        readMs: 33_700,
        position: (t) => rate * (t / 1000),
        residual: () => 0,
      })
    for (const rate of [0.002, 0.003, 0.004]) {
      const session = watch(rate)
      expect(session.resumedSameTick).toBe(false)
      expect(session.shiftAtPause).not.toBeNull()
      expect(session.shiftAtPause!).toBeGreaterThanOrEqual(SCENE_MOVE_FRAC)
      expect(session.shiftAtPause!).toBeLessThan(SCENE_RESET_FRAC)
    }
    const row = simulatePausedMotion(0, 1_000, 5_000, 31.6)
    expect(row.resumed).toBe(true)
    expect(simulatePausedMotion(0, 1_000, 5_000, 41.5).resumed).toBe(true)
    const held = simulateCaseWatch({
      durationMs: 45_000,
      readMs: 2_000,
      position: (t) => 0.01 * (t / 1000),
      residual: (from, to) => (from < 36_000 && to >= 36_000 ? 35 : 0),
    })
    expect(held.resumedSameTick).toBe(false)
    expect(held.pausedAt).not.toBeNull()
    expect(held.pausedAt!).toBeLessThan(36_000)
    expect(held.resumedAt).toBeGreaterThanOrEqual(36_000)
    expect(held.pausedAt! + 20_000).toBeGreaterThan(held.resumedAt!)
  })

  it('keeps read keys when a row changes, and a shadow is not a new slab', () => {
    for (const contentResidual of [0.5, 8.7]) {
      const shadow = { mad: 30, residual: 31, dx: 0, dy: 0, shiftFrac: 0, contentResidual }
      expect(unreadSlabsAreNew(shadow)).toBe(false)
      expect(resumesPausedScan(shadow)).toBe(false)
    }
    const rowSwap = { mad: 40, residual: 25.9, dx: 0, dy: 0, shiftFrac: 0, contentResidual: 24.4 }
    expect(unreadSlabsAreNew(rowSwap)).toBe(true)
    expect(unreadSlabsAreNew({ ...rowSwap, contentResidual: 31.7 })).toBe(true)
    expect(forgetsSeenCards(rowSwap)).toBe(false)
    const left = { x: 0, y: 0, w: 1 / 3, h: 0.5 }
    const named = { printId: 'OP09-004', codeText: 'OP09-004', box: { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 } }
    const first = nextDryStreak(emptySeen(), 0, [{ box: left }, named])
    expect(first.seen.keys.has('OP09-004')).toBe(true)
    const same = nextDryStreak(first.seen, 2, [{ box: left }, named])
    expect(same.pause).toBe(true)
    const row = nextDryStreak(first.seen, 2, [{ box: left }, named], null, unreadSlabsAreNew(rowSwap))
    expect(row.streak).toBe(0)
    expect(row.pause).toBe(false)
    expect(row.seen.keys.has('OP09-004')).toBe(true)
    expect(row.seen.boxes).toHaveLength(1)
    const grid = caseGrid()
    const anchor = greyDownscale(grid)
    const oneSlab = compareFrames(anchor, greyDownscale(swapLeftOfRow1(grid)))
    const wholeRow = compareFrames(anchor, greyDownscale(swapWholeRow1(grid)))
    expect(oneSlab.shiftFrac).toBeLessThan(SCENE_MOVE_FRAC)
    expect(wholeRow.shiftFrac).toBeLessThan(SCENE_MOVE_FRAC)
    expect(oneSlab.contentResidual ?? 0).toBeLessThan(PAUSE_RESUME_RESIDUAL)
    expect(unreadSlabsAreNew(oneSlab)).toBe(false)
    expect(forgetsSeenCards(oneSlab)).toBe(false)
    expect(forgetsSeenCards(wholeRow)).toBe(false)
  })

  it('moves labels by a shift under 6% when the pictures still agree', () => {
    const nudge = { mad: 4, residual: BOX_MOTION_RESIDUAL - 1, dx: 3, dy: -1, shiftFrac: 0.03 }
    expect(placeRead(nudge)).toBe('show')
    expect(labelOffset(nudge, 100, 50)).toEqual({ x: 0.03, y: -0.02 })
    expect(labelOffset({ ...nudge, residual: BOX_MOTION_RESIDUAL }, 100, 50)).toEqual({ x: 0, y: 0 })
  })

  it('ignores a 3s on and 3s off blink while the phone is steady', () => {
    const blink = { mad: 40, residual: 23, dx: 0, dy: 0, shiftFrac: 0 }
    expect(sceneMoved(blink)).toBe(true)
    expect(resetsMovedHold(blink)).toBe(false)
    let since: number | null = 0
    let ready = false
    for (let t = 200; t <= 9000; t += 200) {
      const edge = t % 3000 === 0
      const hop = edge ? blink : { mad: 1, residual: 1, dx: 0, dy: 0, shiftFrac: 0 }
      const step = stepFrameHold(since, resetsMovedHold(hop), t)
      since = step.since
      ready = step.ready
    }
    expect(ready).toBe(true)
    expect(since).toBe(0)
    const slide = { mad: 8, residual: 2, dx: 8, dy: 0, shiftFrac: SCENE_MOVE_FRAC }
    expect(resetsMovedHold(slide)).toBe(true)
    expect(stepFrameHold(since, true, 9000).since).toBeNull()
  })

  it('shows a 0.75% tremor on the case grid unshifted, and a discard scans again', () => {
    const full = loadJpegFixture('full.jpg')
    const anchor = greyDownscale(full)
    const motion = compareFrames(anchor, greyDownscale(translateSubpixel(full, 0.0075, 0.00225)))
    expect(motion.shiftFrac).toBeLessThan(SCENE_MOVE_FRAC)
    expect(motion.residual).toBeGreaterThanOrEqual(BOX_MOTION_RESIDUAL)
    expect(placeRead(motion)).toBe('show')
    expect(labelOffset(motion, anchor.width, anchor.height)).toEqual({ x: 0, y: 0 })
    expect(sceneMoved(motion)).toBe(false)
    expect(forgetsSeenCards(motion)).toBe(false)

    const shadow = { mad: 20, residual: SCENE_MOVE_MAD + 3, dx: 1, dy: 0, shiftFrac: 0.02 }
    expect(substantialSceneChange(shadow)).toBe(true)
    expect(placeRead(shadow)).toBe('discard')
    expect(forgetsSeenCards(shadow)).toBe(false)
    const slidAway = { mad: 20, residual: 0, dx: 25, dy: 0, shiftFrac: 0.25 }
    expect(forgetsSeenCards(slidAway)).toBe(true)
    expect(placeRead(slidAway)).toBe('discard')

    let step = stepSceneHold(initialSceneHold(), anchor, 0)
    step = stepSceneHold(step.state, anchor, 100)
    expect(step.steady).toBe(true)
    expect(step.ready).toBe(false)
    step = stepSceneHold(step.state, anchor, 100 + SCENE_STEADY_MS)
    expect(step.ready).toBe(true)
    const scanned = stepSceneHold(markSceneScanned(step.state), anchor, 100 + SCENE_STEADY_MS + 50)
    expect(scanned.ready).toBe(false)
    const rearmed = stepSceneHold(rearmAfterDiscard(scanned.state), anchor, 100 + SCENE_STEADY_MS + 100)
    expect(rearmed.ready).toBe(true)
    expect(rearmed.state.scanned).toBe(false)
  })

  it('keeps a shadow under the local-mean gate and lets a row swap through', () => {
    const width = 196
    const height = 256
    const data = new Uint8ClampedArray(width * height * 4)
    const img: PixelImage = { width, height, data }
    const cols = 3
    const rows = 4
    const cw = Math.floor(width / cols)
    const ch = Math.floor(height / rows)
    const slab = (x: number, y: number, row: number, col: number) => {
      const period = 12 + row * 4
      const phase = col * 5 + row
      const on = Math.floor((x + phase * 3) / period) % 2 === Math.floor((y + phase) / (8 + col * 2)) % 2
      return on ? 30 + row * 25 + col * 15 : 210 - row * 10
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const col = Math.min(cols - 1, Math.floor(x / cw))
        const row = Math.min(rows - 1, Math.floor(y / ch))
        const tone = slab(x, y, row, col)
        const i = (y * width + x) * 4
        data[i] = tone
        data[i + 1] = Math.min(255, tone + 20)
        data[i + 2] = Math.max(0, 180 - tone)
        data[i + 3] = 255
      }
    }
    const shadeHalf = (factor: number) => {
      const out = copy(img)
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width / 2; x += 1) {
          const i = (y * width + x) * 4
          out.data[i] = Math.round(out.data[i] * factor)
          out.data[i + 1] = Math.round(out.data[i + 1] * factor)
          out.data[i + 2] = Math.round(out.data[i + 2] * factor)
        }
      }
      return out
    }
    const invertRows = (n: number, factor = 1) => {
      const out = expose(copy(img), factor)
      for (let row = 0; row < n; row += 1) {
        for (let y = row * ch; y < (row + 1) * ch && y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4
            out.data[i] = 255 - out.data[i]
            out.data[i + 1] = 255 - out.data[i + 1]
            out.data[i + 2] = 255 - out.data[i + 2]
          }
        }
      }
      return out
    }
    const anchor = greyDownscale(img)
    expect(anchor.width).toBe(98)
    expect(anchor.height).toBe(128)
    const half = (factor: number) => compareFrames(anchor, greyDownscale(shadeHalf(factor)))
    for (const factor of [0.7, 0.6, 0.5, 0.4]) {
      const motion = half(factor)
      expect(motion.contentResidual ?? 0).toBeGreaterThan(0.5)
      expect(motion.contentResidual ?? 0).toBeLessThan(8.7)
      expect(resumesPausedScan(motion)).toBe(false)
      expect(unreadSlabsAreNew(motion)).toBe(false)
    }
    const fifty = half(0.5)
    expect(fifty.residual).toBeGreaterThan(28)
    expect(fifty.shiftFrac).toBe(0)
    const swayed = compareFrames(anchor, greyDownscale(translateImage(shadeHalf(0.6), 0.08)))
    expect(swayed.shiftFrac).toBe(0)
    expect(swayed.residual).toBeGreaterThan(26)
    expect(swayed.contentShiftFrac ?? 0).toBeGreaterThan(0.07)
    expect(swayed.contentShiftFrac ?? 0).toBeLessThan(0.1)
    expect(swayed.contentResidual ?? 0).toBeGreaterThan(5)
    expect(swayed.contentResidual ?? 0).toBeLessThan(8)
    expect(resumesPausedScan(swayed)).toBe(false)
    const pan15 = compareFrames(anchor, greyDownscale(translateImage(img, 0.15)))
    expect(pan15.shiftFrac).toBeGreaterThan(0.12)
    expect(pan15.shiftFrac).toBeLessThan(SCENE_RESET_FRAC)
    expect(Math.abs((pan15.contentShiftFrac ?? 0) - pan15.shiftFrac)).toBeLessThan(0.02)
    expect(resumesPausedScan(pan15)).toBe(false)
    for (const factor of [1, 0.6, 0.45]) {
      const motion = compareFrames(anchor, greyDownscale(invertRows(2, factor)))
      expect(motion.contentResidual ?? 0).toBeGreaterThanOrEqual(PAUSE_RESUME_RESIDUAL)
      expect(resumesPausedScan(motion)).toBe(true)
      expect(unreadSlabsAreNew(motion)).toBe(true)
      expect(forgetsSeenCards(motion)).toBe(false)
    }
    const oneRow = compareFrames(anchor, greyDownscale(invertRows(1)))
    expect(oneRow.contentResidual ?? 0).toBeLessThan(PAUSE_RESUME_RESIDUAL)
    expect(unreadSlabsAreNew(oneRow)).toBe(false)
    const differed = fifty
    let seed = 50
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    let dark = false
    const shadeOn = new Map<number, boolean>()
    for (let t = 0; t <= 300_000; t += 200) {
      if (rand() < 0.08) dark = !dark
      shadeOn.set(t, dark)
    }
    const blink = simulateCaseWatch({
      durationMs: 300_000,
      readMs: 2_000,
      position: () => 0,
      residual: (from, to) => (shadeOn.get(from) === shadeOn.get(to) ? 0 : differed.residual),
      contentResidual: (from, to) => (shadeOn.get(from) === shadeOn.get(to) ? 0 : differed.contentResidual ?? 0),
    })
    expect(blink.scans).toBeLessThan(10)
    expect(blink.resumeCount).toBe(0)
    expect(blink.paused).toBe(true)
  })

  it('floors near-black noise, keeps a pale sleeve and a white table over the gate, and sees a dim pan', () => {
    const img = casePortrait()
    const anchor = greyDownscale(img)
    const before = contentMotionComputeCount()
    const lit = compareFrames(anchor, greyDownscale(translateImage(img, 0.1)))
    expect(contentMotionComputeCount()).toBe(before)
    expect(sceneMoved(lit)).toBe(true)
    expect(contentMotionComputeCount()).toBe(before)
    const still = compareFrames(anchor, anchor)
    expect(contentMotionComputeCount()).toBe(before)
    expect(still.contentResidual).toBe(0)
    expect(contentMotionComputeCount()).toBe(before + 1)
    expect(still.contentShiftFrac).toBe(0)
    expect(contentMotionComputeCount()).toBe(before + 1)

    const dark = expose(img, 0.05)
    const noise = compareFrames(greyDownscale(dark), greyDownscale(noisy(dark, 8)))
    expect(noise.frameMean ?? 255).toBeLessThan(20)
    expect(noise.contentResidual ?? 99).toBeLessThan(PAUSE_RESUME_RESIDUAL)
    expect(resumesPausedScan(noise)).toBe(false)
    expect(unreadSlabsAreNew(noise)).toBe(false)

    const sleeveImg = copy(img)
    for (let y = 0; y < img.height; y += 1) {
      for (let x = 0; x < img.width; x += 1) {
        const tone = Math.floor(y / 18) % 2 === 0 ? 214 : 236
        const i = (y * img.width + x) * 4
        sleeveImg.data[i] = sleeveImg.data[i + 1] = sleeveImg.data[i + 2] = tone
      }
    }
    const sleeve = compareFrames(anchor, greyDownscale(sleeveImg))
    expect(sleeve.contentResidual ?? 0).toBeGreaterThan(PAUSE_RESUME_RESIDUAL)
    expect(sleeve.contentResidual ?? 0).toBeLessThan(20)
    expect(resumesPausedScan(sleeve)).toBe(true)

    const tableImg = copy(img)
    for (let y = 0; y < img.height * 0.85; y += 1) {
      for (let x = 0; x < img.width; x += 1) {
        const i = (y * img.width + x) * 4
        tableImg.data[i] = tableImg.data[i + 1] = tableImg.data[i + 2] = 250
      }
    }
    const table = compareFrames(anchor, greyDownscale(tableImg))
    expect(table.contentResidual ?? 0).toBeGreaterThan(PAUSE_RESUME_RESIDUAL)
    expect(resumesPausedScan(table)).toBe(true)
    expect(unreadSlabsAreNew(table)).toBe(true)

    for (const frac of [0.1, 0.2, 0.3]) {
      const started = contentMotionComputeCount()
      const dimA = noisy(expose(img, 0.15), 7, 11)
      const dimB = noisy(expose(translateImage(img, frac), 0.15), 7, 12)
      const motion = compareFrames(greyDownscale(dimA), greyDownscale(dimB))
      expect(contentMotionComputeCount()).toBe(started)
      expect(motion.frameMean ?? 255).toBeLessThan(DIM_FRAME_MEAN)
      expect(motion.shiftFrac).toBeLessThan(SCENE_MOVE_FRAC)
      expect(motion.residual).toBeLessThan(SCENE_MOVE_MAD)
      expect(sceneMoved(motion)).toBe(true)
      expect(contentMotionComputeCount()).toBe(started + 1)
      expect(motion.contentShiftFrac ?? 0).toBeGreaterThan(frac - 0.03)
      expect(motion.contentShiftFrac ?? 0).toBeLessThan(frac + 0.03)
      let step = stepSceneHold(initialSceneHold(), greyDownscale(dimA), 0)
      step = stepSceneHold(step.state, greyDownscale(dimB), 200)
      expect(step.moved).toBe(false)
      step = stepSceneHold(step.state, greyDownscale(dimB), 400)
      expect(step.moved).toBe(true)
    }
  })

  it('times the moving-read hold from one frame to the next', () => {
    let hold = stepFrameHold(null, false, 0)
    expect(hold.ready).toBe(false)
    hold = stepFrameHold(hold.since, false, SCENE_STEADY_MS)
    expect(hold.ready).toBe(false)
    hold = stepFrameHold(hold.since, true, SCENE_STEADY_MS + 200)
    expect(hold.since).toBeNull()
    hold = stepFrameHold(hold.since, false, 2000)
    hold = stepFrameHold(hold.since, false, 2000 + MOVED_HOLD_MS)
    expect(hold.ready).toBe(true)
    const driftPerTick = 0.003 * 0.2
    expect(driftPerTick).toBeLessThan(SCENE_MOVE_FRAC)
  })
})
