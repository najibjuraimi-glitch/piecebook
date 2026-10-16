import { describe, expect, it } from 'vitest'
import { MIN_SHORT_SIDE_PX } from './centering'
import { fitForMeasure, MAX_MEASURE_LONG_EDGE } from './photoPixels'

describe('fitForMeasure (F10)', () => {
  it('leaves carried 1600 px photos and small files alone', () => {
    expect(fitForMeasure(1200, 1600)).toEqual({ width: 1200, height: 1600, scale: 1 })
    expect(fitForMeasure(640, 480)).toEqual({ width: 640, height: 480, scale: 1 })
  })
  it('caps a 12 MP camera upload at the long edge', () => {
    const fit = fitForMeasure(3024, 4032)
    expect(fit.height).toBe(MAX_MEASURE_LONG_EDGE)
    expect(fit.width).toBe(1500)
    expect(fit.scale).toBeCloseTo(2000 / 4032, 6)
    expect(fit.width * fit.height).toBeLessThan(3024 * 4032 * 0.25)
  })
  it('keeps the short side at the measuring minimum on a wide frame', () => {
    const fit = fitForMeasure(6000, 2000)
    expect(Math.min(fit.width, fit.height)).toBe(MIN_SHORT_SIDE_PX)
    expect(fit.width).toBe(2400)
  })
  it('never upscales a frame that is already under the minimum', () => {
    const fit = fitForMeasure(5000, 500)
    expect(fit.scale).toBeLessThan(1)
    expect(fit.height).toBe(200)
  })
})
