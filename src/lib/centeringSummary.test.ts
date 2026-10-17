import { describe, expect, it } from 'vitest'
import {
  CENTERING_LIMITS,
  WORKER_NOT_MEASURED_NOTE,
  centeringFromBorders,
  centeringLine,
  parseCenteringSummary,
  parsePhotoCentering,
  edgeDetail,
  photoCentering,
  photoCenteringFromStored,
  summariseCentering,
  unmeasured,
} from './centeringSummary'
import type { PhotoResult } from './centering'

const measured = (side: 'front' | 'back', l: number, r: number, t: number, b: number): PhotoResult => ({
  ok: true,
  side,
  measure: {
    left: l,
    right: r,
    top: t,
    bottom: b,
    lr: { largerPct: 0, smallerPct: 0, label: '', leftOrTop: l, rightOrBottom: r },
    tb: { largerPct: 0, smallerPct: 0, label: '', leftOrTop: t, rightOrBottom: b },
    worse: { largerPct: 0, smallerPct: 0, label: '', leftOrTop: 0, rightOrBottom: 0 },
    worseAxis: 'lr',
    cannotBeTen: false,
    resolved: true,
    side,
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    inner: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    maxAngleErrorDeg: 0,
  },
})

describe('centeringFromBorders', () => {
  it('labels both axes larger-first and keeps 55/45 as still a 10 on the front', () => {
    const c = centeringFromBorders('front', 55, 45, 50, 50)
    expect(c).toMatchObject({ measured: true, leftRight: '55/45', topBottom: '50/50', resolved: true, cannotBeTen: false })
  })

  it('rules a 10 out past the front and back limits', () => {
    expect(centeringFromBorders('front', 60, 40, 50, 50)).toMatchObject({ cannotBeTen: true })
    expect(centeringFromBorders('back', 60, 40, 50, 50)).toMatchObject({ cannotBeTen: false })
    expect(centeringFromBorders('back', 76, 24, 50, 50)).toMatchObject({ cannotBeTen: true })
    expect(CENTERING_LIMITS).toEqual({ front: '55/45', back: '75/25' })
  })

  it('is "not measured", never a ratio, when a border is thinner than the print-edge floor', () => {
    const c = centeringFromBorders('front', 2, 60, 50, 50)
    expect(c).toEqual({
      side: 'front',
      measured: false,
      reason: 'no-print-edge',
      note: 'Front: card found, but no print border could be read on the left. Nothing ruled out.',
    })
    // The scan that found no border at all reports 0 on every side: no side is singled out.
    expect(centeringFromBorders('back', 0, 0, 0, 0)).toMatchObject({
      measured: false,
      reason: 'no-print-edge',
      note: 'Back: card found, but no print border could be read. Nothing ruled out.',
    })
    expect(centeringFromBorders('front', 0, 0, 0, 0, ['right', 'bottom'])).toMatchObject({
      note: 'Front: card found, but no print border could be read on the right and bottom. Nothing ruled out.',
    })
  })
})

describe('photoCentering and the stored form', () => {
  it('recomputes the ratios from the pixel borders of a live measurement', () => {
    const c = photoCentering(measured('front', 30, 70, 48, 52), 'front')
    expect(c).toMatchObject({ measured: true, leftRight: '70/30', topBottom: '52/48', cannotBeTen: true })
  })

  it('carries a reject as unmeasured with its message', () => {
    const c = photoCentering({ ok: false, side: 'back', code: 'short-side', message: 'Back: short side is 448px (need 800).' }, 'back')
    expect(c).toEqual({ side: 'back', measured: false, reason: 'short-side', note: 'Back: short side is 448px (need 800).' })
  })

  it('turns a found card with no print edge into "not measured" naming the sides, not a 50/50', () => {
    const r = measured('front', 0, 0, 0, 0)
    r.ok && (r.measure.resolved = false)
    r.ok && (r.measure.unresolvedSides = ['right', 'bottom'])
    expect(photoCentering(r, 'front')).toEqual({
      side: 'front',
      measured: false,
      reason: 'no-print-edge',
      note: 'Front: card found, but no print border could be read on the right and bottom. Nothing ruled out.',
    })
  })

  it('reads a prediction log row the same way', () => {
    expect(photoCenteringFromStored({ side: 'front', centering: { left: 55, right: 45, top: 50, bottom: 50 } })).toMatchObject({ leftRight: '55/45' })
    expect(photoCenteringFromStored({ side: 'back', reject: { code: 'angled', message: 'Back: photo is angled about 12°.' } })).toMatchObject({
      measured: false,
      reason: 'angled',
    })
    expect(photoCenteringFromStored({ side: 'back' })).toBeNull()
    expect(photoCentering(null, 'front')).toBeNull()
  })
})

describe('parsePhotoCentering (wire)', () => {
  it('accepts border pixels and recomputes everything else', () => {
    const c = parsePhotoCentering({ left: 60, right: 40, top: 50, bottom: 50, cannotBeTen: false, leftRight: '50/50' }, 'front')
    expect(c).toMatchObject({ measured: true, leftRight: '60/40', cannotBeTen: true })
  })

  it('accepts numeric strings but drops negatives, NaN, missing sides and absurd sizes', () => {
    expect(parsePhotoCentering({ left: '50', right: '50', top: '50', bottom: '50' }, 'front')).toMatchObject({ leftRight: '50/50' })
    expect(parsePhotoCentering({ left: -1, right: 50, top: 50, bottom: 50 }, 'front')).toBeNull()
    expect(parsePhotoCentering({ left: 'x', right: 50, top: 50, bottom: 50 }, 'front')).toBeNull()
    expect(parsePhotoCentering({ left: 50, right: 50, top: 50 }, 'front')).toBeNull()
    expect(parsePhotoCentering({ left: 50_000, right: 50, top: 50, bottom: 50 }, 'front')).toBeNull()
    expect(parsePhotoCentering('55/45', 'front')).toBeNull()
    expect(parsePhotoCentering(null, 'front')).toBeNull()
  })

  it('refuses a block whose side disagrees with the slot', () => {
    expect(parsePhotoCentering({ side: 'back', left: 50, right: 50, top: 50, bottom: 50 }, 'front')).toBeNull()
  })

  it('keeps an unmeasured side only with a known reason, and clamps the note', () => {
    expect(parsePhotoCentering({ measured: false, reason: 'short-side', note: 'Front: short side is 448px (need 800).' }, 'front')).toEqual({
      side: 'front',
      measured: false,
      reason: 'short-side',
      note: 'Front: short side is 448px (need 800).',
    })
    expect(parsePhotoCentering({ measured: false, reason: 'because' }, 'front')).toBeNull()
    const long = parsePhotoCentering({ measured: false, reason: 'cut-off', note: 'x'.repeat(500) }, 'front')
    expect(long && !long.measured && long.note.length).toBe(160)
    expect(parsePhotoCentering({ measured: false, reason: 'no-card' }, 'back')).toMatchObject({ note: 'Back: could not measure (no-card).' })
    expect(parsePhotoCentering({ measured: false, reason: 'no-print-edge' }, 'back')).toMatchObject({
      note: 'Back: card found, but no print border could be read. Nothing ruled out.',
    })
  })

  it('refuses to turn sub-floor borders from the wire into a measurement', () => {
    const c = parsePhotoCentering({ left: 0, right: 0, top: 0, bottom: 0, leftRight: '50/50', topBottom: '50/50', measured: true }, 'front')
    expect(c).toMatchObject({ measured: false, reason: 'no-print-edge' })
  })
})

describe('summariseCentering', () => {
  it('names the side and axis that rule a 10 out', () => {
    const s = summariseCentering(centeringFromBorders('front', 62, 38, 50, 50), centeringFromBorders('back', 50, 50, 50, 50))
    expect(s.cannotBeTen).toBe(true)
    expect(s.verdict).toBe('Cannot be a 10 by centering: front 62/38 left to right is over 55/45.')
    expect(s.note).toBe(s.verdict)
    expect(s.source).toBe('device')
  })

  it('says not ruled out when every measured side is within its limit', () => {
    const s = summariseCentering(centeringFromBorders('front', 55, 45, 50, 50), null)
    expect(s).toMatchObject({ cannotBeTen: false, verdict: 'Centering does not rule a 10 out.' })
  })

  it('keeps the verdict honest when one side could not be measured', () => {
    const s = summariseCentering(unmeasured('front', 'short-side', 'Front: short side is 448px (need 800).'), centeringFromBorders('back', 70, 30, 50, 50))
    expect(s.cannotBeTen).toBe(false)
    expect(s.note).toBe('Centering does not rule a 10 out. Front: short side is 448px (need 800).')
  })

  it('says it was not measured when nothing was, and when only unresolved edges came back', () => {
    expect(summariseCentering(null, null, 'none')).toMatchObject({ source: 'none', cannotBeTen: false, verdict: WORKER_NOT_MEASURED_NOTE })
    const s = summariseCentering(unmeasured('front', 'unreadable'), null)
    expect(s.verdict).toBe('Centering was not measured.')
    expect(s.note).toBe('Centering was not measured. Front: the photo could not be read.')
    // An unresolved edge never contradicts itself: no ratio sits next to "not measured".
    const edge = summariseCentering(centeringFromBorders('front', 2, 60, 50, 50), null)
    expect(edge.verdict).toBe('Centering was not measured.')
    expect(edge.note).toBe('Centering was not measured. Front: card found, but no print border could be read on the left. Nothing ruled out.')
    expect(edge.note).not.toMatch(/\d+\/\d+/)
    // One side resolved, the other not: the measured side carries the verdict, the other says why it does not.
    const mixed = summariseCentering(centeringFromBorders('front', 0, 0, 0, 0, ['right', 'bottom']), centeringFromBorders('back', 53, 47, 52, 48))
    expect(mixed.verdict).toBe('Centering does not rule a 10 out.')
    expect(mixed.note).toBe(
      'Centering does not rule a 10 out. Front: card found, but no print border could be read on the right and bottom. Nothing ruled out.',
    )
  })
})

describe('centeringLine', () => {
  it('writes both axes in plain words', () => {
    expect(centeringLine(centeringFromBorders('front', 55, 45, 48, 52), 'front')).toBe('Front 55/45 left to right · 52/48 top to bottom')
    expect(centeringLine(centeringFromBorders('back', 80, 20, 50, 50), 'back')).toBe('Back 80/20 left to right · 50/50 top to bottom · over 75/25, cannot be a 10')
    expect(centeringLine(centeringFromBorders('front', 1, 60, 50, 50), 'front')).toBe(
      'Front: card found, but no print border could be read on the left. Nothing ruled out.',
    )
    expect(centeringLine(null, 'back')).toBe('Back: no photo.')
    expect(centeringLine(unmeasured('front', 'angled', 'Front: photo is angled about 12° (need under ~8°).'), 'front')).toBe('Front: photo is angled about 12° (need under ~8°).')
  })
})

describe('parseCenteringSummary', () => {
  it('rebuilds the block from a Worker answer and ignores anything it cannot trust', () => {
    const s = parseCenteringSummary({ source: 'device', front: { left: 60, right: 40, top: 50, bottom: 50 }, back: 'nope', cannotBeTen: false })
    expect(s).toMatchObject({ source: 'device', cannotBeTen: true, back: null })
    expect(parseCenteringSummary(undefined)).toBeNull()
    expect(parseCenteringSummary({ source: 'none', front: null, back: null })).toMatchObject({ source: 'none', verdict: WORKER_NOT_MEASURED_NOTE })
  })
})

describe('edgeDetail', () => {
  it('joins the per-side reasons in side order', () => {
    expect(edgeDetail({ left: '36px on 14/21', bottom: 'band not flat (8/21)' })).toBe(
      'left: 36px on 14/21 · bottom: band not flat (8/21)',
    )
    expect(edgeDetail(undefined)).toBeUndefined()
    expect(edgeDetail({})).toBeUndefined()
  })
})
