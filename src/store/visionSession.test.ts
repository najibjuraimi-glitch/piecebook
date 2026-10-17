import { beforeEach, describe, expect, it } from 'vitest'
import { clearVisionSession, confirmVisionCard, parsePhotoResult, peekVisionSession, writeVisionSession } from './visionSession'
import { makeSyntheticCard, measurePhoto, scaleMeasureTo, type PhotoResult } from '../lib/centering'

const FRONT = 'data:image/jpeg;base64,AAAA'
const BACK = 'data:image/jpeg;base64,BBBB'
const CARD = { width: 1000, height: 1400, card: { x: 120, y: 100, w: 760, h: 1064 }, borders: { left: 48, right: 32, top: 36, bottom: 36 } }

describe('visionSession', () => {
  beforeEach(() => clearVisionSession())

  it('carries photos to the card page with no check when the model refused the card', () => {
    writeVisionSession({ check: null, frontDataUrl: FRONT, confirmedCardNumber: 'EB02-010_p1' })
    const s = peekVisionSession()
    expect(s).toEqual({ check: null, frontDataUrl: FRONT, backDataUrl: undefined, confirmedCardNumber: 'EB02-010_p1' })
  })

  it('confirming a card keeps a null check', () => {
    writeVisionSession({ check: null, frontDataUrl: FRONT })
    expect(confirmVisionCard('ST01-007')?.confirmedCardNumber).toBe('ST01-007')
    expect(peekVisionSession()?.check).toBeNull()
  })

  it('carries the centering measured on /pregrade so the card page never re-measures', () => {
    const front = measurePhoto(makeSyntheticCard(CARD), 'front')
    const back: PhotoResult = { ok: false, side: 'back', code: 'angled', message: 'Back: photo is angled about 12° (need under ~8°).' }
    writeVisionSession({ check: null, frontDataUrl: FRONT, backDataUrl: BACK, centering: { front, back } })
    const s = confirmVisionCard('EB02-010_p1')
    expect(s?.centering?.front).toBe(front)
    expect(s?.centering?.back).toEqual(back)
    expect(front.ok && front.measure.lr.label).toBe('60/40')
  })
})

describe('parsePhotoResult (storage)', () => {
  const front = measurePhoto(makeSyntheticCard(CARD), 'front')
  const stored = (r: unknown) => JSON.parse(JSON.stringify(r)) as unknown

  it('round-trips a measurement through JSON with its geometry and image size intact', () => {
    const back = parsePhotoResult(stored(front), 'front')
    expect(back).toEqual(front)
    expect(back?.ok && back.measure.imageWidth).toBeGreaterThan(0)
  })

  it('round-trips a reject and an unresolved card, keeping the sides that failed', () => {
    const reject: PhotoResult = { ok: false, side: 'back', code: 'short-side', message: 'Back: short side is 448px (need 800).' }
    expect(parsePhotoResult(stored(reject), 'back')).toEqual(reject)
    const holder: PhotoResult = {
      ok: false,
      side: 'front',
      code: 'holder',
      message: 'Centering not measurable from these photos. A magnetic holder or stand covers the card edge.',
    }
    expect(parsePhotoResult(stored(holder), 'front')).toEqual(holder)
    const unresolved = front.ok ? { ...front, measure: { ...front.measure, left: 0, right: 0, top: 0, bottom: 0, resolved: false, cannotBeTen: false, unresolvedSides: ['right', 'bottom'] } } : front
    const parsed = parsePhotoResult(stored(unresolved), 'front')
    expect(parsed?.ok && parsed.measure).toMatchObject({ resolved: false, cannotBeTen: false, unresolvedSides: ['right', 'bottom'] })
  })

  it('recomputes the verdict from the borders and refuses the wrong side, junk and missing geometry', () => {
    const forged = front.ok ? { ...front, measure: { ...front.measure, left: 70, right: 30, cannotBeTen: false } } : front
    const parsed = parsePhotoResult(stored(forged), 'front')
    expect(parsed?.ok && parsed.measure.cannotBeTen).toBe(true)
    expect(parsePhotoResult(stored(front), 'back')).toBeNull()
    expect(parsePhotoResult('56/44', 'front')).toBeNull()
    expect(parsePhotoResult({ ok: true, side: 'front', measure: { left: 1, right: 2, top: 3, bottom: 4 } }, 'front')).toBeNull()
    expect(parsePhotoResult({ ok: false, side: 'front', code: 'because', message: 'x' }, 'front')).toBeNull()
  })

  it('scales carried geometry onto a smaller copy of the photo for the overlay', () => {
    if (!front.ok) throw new Error('synthetic card did not measure')
    const { imageWidth, imageHeight } = front.measure
    const scaled = scaleMeasureTo(front.measure, imageWidth! / 2, imageHeight! / 2)
    expect(scaled.corners[2]).toEqual({ x: front.measure.corners[2].x / 2, y: front.measure.corners[2].y / 2 })
    expect(scaled.inner[0]).toEqual({ x: front.measure.inner[0].x / 2, y: front.measure.inner[0].y / 2 })
    expect(scaled.left).toBe(front.measure.left)
    expect(scaleMeasureTo(front.measure, imageWidth!, imageHeight!)).toBe(front.measure)
  })
})
