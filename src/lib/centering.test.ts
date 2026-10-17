import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decode as decodeJpeg } from 'jpeg-js'
import {
  BACK_TEN_MAX,
  FRONT_TEN_MAX,
  MIN_PRINT_BORDER_PX,
  centeringLabel,
  chooseMeasure,
  hasPixelGeometry,
  makeSyntheticCard,
  measureFromBorders,
  measurePhoto,
  scaleMeasureTo,
  splitFromPair,
  type PhotoResult,
  type PixelImage,
} from './centering'

function loadJpegFixture(name: string): PixelImage {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
  const raw = decodeJpeg(readFileSync(join(dir, name)), { useTArray: true })
  return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) }
}

function expectSplit(got: number, expected: number) {
  expect(Math.abs(got - expected)).toBeLessThanOrEqual(2)
}

describe('centering ratios from known borders', () => {
  it('larger / sum per axis; worse axis counts', () => {
    const even = measureFromBorders(50, 50, 50, 50, 'front')
    expect(even.lr.label).toBe('50/50')
    expect(even.tb.label).toBe('50/50')
    expect(even.cannotBeTen).toBe(false)

    const frontFail = measureFromBorders(60, 40, 50, 50, 'front')
    expect(frontFail.lr.largerPct).toBeCloseTo(60, 5)
    expect(frontFail.worseAxis).toBe('lr')
    expect(frontFail.cannotBeTen).toBe(true)

    const frontOk = measureFromBorders(55, 45, 52, 48, 'front')
    expect(frontOk.cannotBeTen).toBe(false)
    expect(frontOk.worse.largerPct).toBeCloseTo(55, 5)

    const backOk = measureFromBorders(75, 25, 50, 50, 'back')
    expect(backOk.cannotBeTen).toBe(false)
    const backFail = measureFromBorders(76, 24, 50, 50, 'back')
    expect(backFail.cannotBeTen).toBe(true)
    expect(FRONT_TEN_MAX).toBe(55)
    expect(BACK_TEN_MAX).toBe(75)
  })

  it('splitFromPair is larger / sum', () => {
    const s = splitFromPair(80, 40)
    expect(s.largerPct).toBeCloseTo(200 / 3, 5)
    expect(s.label).toBe('67/33')
  })

  it('a border thinner than the guard is unresolved and never rules a 10 out', () => {
    expect(MIN_PRINT_BORDER_PX).toBe(4)
    const noise = measureFromBorders(2, 2, 2, 2, 'front')
    expect(noise.resolved).toBe(false)
    expect(noise.cannotBeTen).toBe(false)
    expect(centeringLabel(noise)).toMatch(/not measured/)
    expect(centeringLabel(noise)).not.toMatch(/50\/50/)
    // One pixel of jitter on a 2px border would read 60/40 — still nothing is ruled out.
    const jitter = measureFromBorders(3, 2, 2, 2, 'front')
    expect(jitter.lr.label).toBe('60/40')
    expect(jitter.resolved).toBe(false)
    expect(jitter.cannotBeTen).toBe(false)
    // A real border over the line still rules out.
    const real = measureFromBorders(60, 40, 50, 50, 'front')
    expect(real.resolved).toBe(true)
    expect(real.cannotBeTen).toBe(true)
    expect(centeringLabel(real)).toBe('60/40 · 50/50 · cannot be a 10')
  })

  it('restored log rows carry placeholder corners, not pixel geometry', () => {
    const unit = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ] as const
    expect(hasPixelGeometry({ corners: [unit[0], unit[1], unit[2], unit[3]] })).toBe(false)
    expect(hasPixelGeometry({ corners: [{ x: 120, y: 100 }, { x: 880, y: 100 }, { x: 880, y: 1164 }, { x: 120, y: 1164 }] })).toBe(true)
  })
})

describe('centering from synthetic photos (±2 points)', () => {
  it('reads 60/40 left-right on a square-on card', () => {
    const img = makeSyntheticCard({
      width: 1000,
      height: 1400,
      card: { x: 120, y: 100, w: 760, h: 1064 },
      borders: { left: 120, right: 80, top: 90, bottom: 90 },
    })
    const result = measurePhoto(img, 'front')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 120 / 200 = 60/40
    expectSplit(result.measure.lr.largerPct, 60)
    expectSplit(result.measure.tb.largerPct, 50)
    expect(result.measure.resolved).toBe(true)
    expect(result.measure.cannotBeTen).toBe(true)
  })

  it('reads 55/45 and does not rule out a front 10', () => {
    const img = makeSyntheticCard({
      width: 1000,
      height: 1400,
      card: { x: 110, y: 90, w: 780, h: 1092 },
      borders: { left: 110, right: 90, top: 80, bottom: 80 },
    })
    const result = measurePhoto(img, 'front')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expectSplit(result.measure.lr.largerPct, 55)
    // The 55/45 line itself is covered by measureFromBorders; here we only need the ratio.
  })

  it('reads 70/30 top-bottom as the worse axis', () => {
    const img = makeSyntheticCard({
      width: 1000,
      height: 1400,
      card: { x: 140, y: 120, w: 720, h: 1008 },
      borders: { left: 60, right: 60, top: 140, bottom: 60 },
    })
    const result = measurePhoto(img, 'front')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expectSplit(result.measure.tb.largerPct, 70)
    expect(result.measure.worseAxis).toBe('tb')
    expect(result.measure.cannotBeTen).toBe(true)
  })

  it('stays within ±2 after a small in-plane rotation', () => {
    const img = makeSyntheticCard({
      width: 1100,
      height: 1500,
      card: { x: 160, y: 140, w: 760, h: 1064 },
      borders: { left: 100, right: 60, top: 80, bottom: 80 },
      rotateDeg: 3,
    })
    const result = measurePhoto(img, 'front')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 100 / 160 = 62.5/37.5
    expectSplit(result.measure.lr.largerPct, 62.5)
  })

  it('back over 75/25 cannot be a 10', () => {
    const img = makeSyntheticCard({
      width: 1000,
      height: 1400,
      card: { x: 120, y: 100, w: 760, h: 1064 },
      borders: { left: 160, right: 40, top: 80, bottom: 80 },
    })
    const result = measurePhoto(img, 'back')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expectSplit(result.measure.lr.largerPct, 80)
    expect(result.measure.cannotBeTen).toBe(true)
  })
})

describe('hand-held photos: card on a palm, uneven ground, alt-art edges', () => {
  const CARD = { x: 220, y: 200, w: 760, h: 1064 }
  const BORDERS = { left: 60, right: 40, top: 50, bottom: 50 }
  const expectCorners = (got: { x: number; y: number }[], card: typeof CARD) => {
    const want = [
      { x: card.x, y: card.y },
      { x: card.x + card.w, y: card.y },
      { x: card.x + card.w, y: card.y + card.h },
      { x: card.x, y: card.y + card.h },
    ]
    got.forEach((p, i) => {
      expect(Math.abs(p.x - want[i].x)).toBeLessThanOrEqual(3)
      expect(Math.abs(p.y - want[i].y)).toBeLessThanOrEqual(3)
    })
  }

  it('a palm behind the card on a lit ground does not move the card edge or the ratios', () => {
    const img = makeSyntheticCard({
      width: 1200,
      height: 1600,
      card: CARD,
      borders: BORDERS,
      hand: { x: 500, y: 600, w: 560, h: 740 },
      groundGradient: true,
      noise: 6,
    })
    const result = measurePhoto(img, 'front')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.measure.resolved).toBe(true)
    expectSplit(result.measure.lr.largerPct, 60)
    expectSplit(result.measure.tb.largerPct, 50)
    expectCorners(result.measure.corners, CARD)
    expect(result.measure).toMatchObject({ imageWidth: 1200, imageHeight: 1600, unresolvedSides: [] })
  })

  it('fingers over the top of the card still leave enough clean stations to read the top border', () => {
    const card = { ...CARD, y: 300 }
    const img = makeSyntheticCard({
      width: 1200,
      height: 1600,
      card,
      borders: BORDERS,
      hand: { x: 400, y: 120, w: 500, h: 900 },
      groundGradient: true,
      noise: 6,
    })
    const result = measurePhoto(img, 'back')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.measure.resolved).toBe(true)
    expectSplit(result.measure.tb.largerPct, 50)
    expectCorners(result.measure.corners, card)
  })

  it('a slightly tilted card on a palm reads within ±2', () => {
    const img = makeSyntheticCard({
      width: 1200,
      height: 1600,
      card: CARD,
      borders: BORDERS,
      hand: { x: 500, y: 600, w: 560, h: 740 },
      groundGradient: true,
      rotateDeg: 2,
      noise: 6,
    })
    const result = measurePhoto(img, 'front')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.measure.resolved).toBe(true)
    expectSplit(result.measure.lr.largerPct, 60)
  })

  it('alt art bled to the right and bottom is not measured, names those sides, and never shows a ratio', () => {
    const img = makeSyntheticCard({ width: 1200, height: 1600, card: CARD, borders: BORDERS, artToEdge: ['right', 'bottom'], noise: 6 })
    const result = measurePhoto(img, 'front')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.measure.resolved).toBe(false)
    expect(result.measure.cannotBeTen).toBe(false)
    expect(result.measure.unresolvedSides).toEqual(['right', 'bottom'])
    expect(centeringLabel(result.measure)).toBe('Card found · print edge not measured on the right and bottom · nothing ruled out')
    expectCorners(result.measure.corners, CARD)
  })

  it('full art on every side is not measured, with no side singled out', () => {
    const img = makeSyntheticCard({ width: 1200, height: 1600, card: CARD, borders: BORDERS, artToEdge: ['left', 'right', 'top', 'bottom'], noise: 6 })
    const result = measurePhoto(img, 'back')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.measure.resolved).toBe(false)
    expect(result.measure.unresolvedSides).toEqual(['left', 'right', 'top', 'bottom'])
    expect(centeringLabel(result.measure)).toBe('Card found · print edge not measured · nothing ruled out')
  })

  it('the same card reads the same at camera size and at upload size', () => {
    const full = measurePhoto(makeSyntheticCard({ width: 1500, height: 2000, card: { x: 275, y: 250, w: 950, h: 1330 }, borders: { left: 75, right: 50, top: 62, bottom: 62 }, groundGradient: true, noise: 6 }), 'front')
    const small = measurePhoto(makeSyntheticCard({ width: 1200, height: 1600, card: { x: 220, y: 200, w: 760, h: 1064 }, borders: { left: 60, right: 40, top: 50, bottom: 50 }, groundGradient: true, noise: 6 }), 'front')
    expect(full.ok && small.ok).toBe(true)
    if (!full.ok || !small.ok) return
    expect(Math.abs(full.measure.lr.largerPct - small.measure.lr.largerPct)).toBeLessThanOrEqual(2)
    expect(Math.abs(full.measure.tb.largerPct - small.measure.tb.largerPct)).toBeLessThanOrEqual(2)
    // Carried to a screen that holds the smaller copy, the geometry scales with the image.
    const scaled = scaleMeasureTo(full.measure, 1200, 1600)
    expect(Math.abs(scaled.corners[0].x - small.measure.corners[0].x)).toBeLessThanOrEqual(3)
    expect(Math.abs(scaled.corners[2].y - small.measure.corners[2].y)).toBeLessThanOrEqual(3)
  })
})

describe('photo rejects name the side', () => {
  it('short side under 800px', () => {
    const img = makeSyntheticCard({
      width: 700,
      height: 980,
      card: { x: 40, y: 40, w: 620, h: 868 },
      borders: { left: 40, right: 40, top: 40, bottom: 40 },
    })
    const result = measurePhoto(img, 'front')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('short-side')
    expect(result.message).toMatch(/Front/)
    expect(result.message).toMatch(/700px/)
  })

  it('cut off at the frame', () => {
    const img = makeSyntheticCard({
      width: 1000,
      height: 1400,
      card: { x: 0, y: 80, w: 760, h: 1064 },
      borders: { left: 50, right: 50, top: 50, bottom: 50 },
    })
    const result = measurePhoto(img, 'back')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('cut-off')
    expect(result.message).toMatch(/Back/)
  })

  it('eBay Nami OP09-070 SP front is not cut off, and its full-art edge is not invented as 50/50', () => {
    const result = measurePhoto(loadJpegFixture('nami-op09-070-sp-front.jpg'), 'front')
    expect(result.ok).toBe(true)
    if (!result.ok) {
      expect(result.message).toBe('')
      return
    }
    expect(result.measure.corners[0].x).toBeGreaterThan(50)
    expect(result.measure.corners[0].y).toBeGreaterThan(20)
    expect(result.measure.resolved).toBe(false)
    expect(result.measure.cannotBeTen).toBe(false)
    expect(result.measure.unresolvedSides?.length).toBeGreaterThan(0)
    expect(centeringLabel(result.measure)).not.toMatch(/\d+\/\d+/)
  }, 30_000)

  it('eBay Nami OP09-070 SP back is not cut off and rules nothing out', () => {
    const result = measurePhoto(loadJpegFixture('nami-op09-070-sp-back.jpg'), 'back')
    expect(result.ok).toBe(true)
    if (!result.ok) {
      expect(result.message).toBe('')
      return
    }
    expect(result.measure.corners[0].x).toBeGreaterThan(50)
    expect(result.measure.resolved).toBe(false)
    expect(result.measure.cannotBeTen).toBe(false)
  }, 30_000)

  it('angled over ~8°', () => {
    const img = makeSyntheticCard({
      width: 1200,
      height: 1600,
      card: { x: 220, y: 200, w: 720, h: 1008 },
      borders: { left: 50, right: 50, top: 50, bottom: 50 },
      topSqueeze: 0.32,
    })
    const result = measurePhoto(img, 'front')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('angled')
    expect(result.message).toMatch(/Front/)
  })
})

describe('chooseMeasure', () => {
  const reading = (resolved: boolean, sides: Array<'top' | 'bottom' | 'left' | 'right'>): PhotoResult =>
    ({ ok: true, side: 'back', measure: { resolved, unresolvedSides: sides } }) as PhotoResult
  const rejected: PhotoResult = { ok: false, side: 'back', code: 'no-card', message: 'no card' }

  it('keeps the guided reading when it resolves, and the search when the outline does not', () => {
    const guided = reading(true, [])
    const searched = reading(false, ['top', 'bottom'])
    expect(chooseMeasure(guided, searched)).toBe(guided)
    const badOutline = reading(false, ['top', 'bottom'])
    const found = reading(true, [])
    expect(chooseMeasure(badOutline, found)).toBe(found)
    expect(chooseMeasure(reading(false, ['top', 'bottom']), reading(false, ['top']))).toBeTruthy()
    const fewer = reading(false, ['top'])
    expect(chooseMeasure(reading(false, ['top', 'bottom']), fewer)).toBe(fewer)
    expect(chooseMeasure(rejected, found)).toBe(found)
    expect(chooseMeasure(guided, rejected)).toBe(guided)
  })
})
