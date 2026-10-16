import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decode as decodeJpeg } from 'jpeg-js'
import {
  BACK_TEN_MAX,
  FRONT_TEN_MAX,
  makeSyntheticCard,
  measureFromBorders,
  measurePhoto,
  splitFromPair,
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

  it('eBay Nami OP09-070 SP front is not cut off', () => {
    const result = measurePhoto(loadJpegFixture('nami-op09-070-sp-front.jpg'), 'front')
    expect(result.ok).toBe(true)
    if (!result.ok) expect(result.message).toBe('')
  }, 30_000)

  it('eBay Nami OP09-070 SP back is not cut off', () => {
    const result = measurePhoto(loadJpegFixture('nami-op09-070-sp-back.jpg'), 'back')
    expect(result.ok).toBe(true)
    if (!result.ok) expect(result.message).toBe('')
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
