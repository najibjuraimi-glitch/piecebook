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
  initialLiveView,
  insideQuad,
  invertMat3,
  pickCleanerFrame,
  sharpness,
  shrinkQuad,
  stepLiveView,
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
    borders: { left: 120, right: 80, top: 90, bottom: 90 },
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
    expect(t.ok && t.measure.lr.label).toBe('60/40')
    expect(t.ok && t.measure.tb.label).toBe('50/50')
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
    expect(m.measure.lr.label).toBe('60/40')
    expect(m.measure.tb.label).toBe('50/50')
    expect(m.measure.maxAngleErrorDeg).toBeLessThan(MAX_ANGLE_DEG)
  })

  it('with the flattened corners handed over, the measure skips the search and reads the same', () => {
    const f = flattenCard(tipped(90))
    if (!f.flattened) throw new Error('expected flatten')
    const m = measurePhoto(f.image, 'front', { outline: f.cardQuad })
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.measure.resolved).toBe(true)
    expect(m.measure.lr.label).toBe('60/40')
    expect(m.measure.tb.label).toBe('50/50')
    expect(m.measure.maxAngleErrorDeg).toBe(0)
    // The outline is trusted for where the card is, not for the print edges: these still come from the pixels.
    expect(m.measure.left).toBeGreaterThan(m.measure.right)
  })

  it('a strongly angled shot flattens too', () => {
    const f = flattenCard(tipped(220))
    expect(f.flattened).toBe(true)
    const m = measurePhoto(f.image, 'front')
    expect(m.ok && m.measure.lr.label).toBe('60/40')
    expect(m.ok && m.measure.tb.label).toBe('50/50')
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
      borders: { left: 56, right: 37, top: 42, bottom: 42 },
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
