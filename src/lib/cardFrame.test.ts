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
  MOVED_HOLD_MS,
  SCENE_MOVE_FRAC,
  SCENE_MOVE_MAD,
  SCENE_STEADY_MS,
  boxIoU,
  compareFrames,
  emptySeen,
  greyDownscale,
  initialLiveView,
  initialSceneHold,
  insideQuad,
  invertMat3,
  markSceneScanned,
  nextDryStreak,
  pickCleanerFrame,
  scanIntervalOpen,
  sceneMoved,
  sharpness,
  steadyWaitMs,
  substantialSceneChange,
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

  it('keeps a 0.5% to 1% tremble and a 10% exposure change on a real card photo', () => {
    const full = loadJpegFixture('nami-op09-070-sp-front.jpg')
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
  })
})
