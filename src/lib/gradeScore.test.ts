import { describe, expect, it } from 'vitest'
import { centeringFromBorders, unmeasured } from './centeringSummary'
import {
  PSA_CENTERING,
  SEVERITY_BANDS,
  buildScores,
  centeringGradeFor,
  formatScore,
  lowestConfidence,
  scoreCentering,
  scorePart,
  type ConditionLike,
  type SectionLike,
} from './gradeScore'

const sec = (severity: SectionLike['severity'], flags: string[] = [], confidence: SectionLike['confidence'] = 'high'): SectionLike => ({ flags, severity, confidence })
const cond = (over: Partial<ConditionLike> = {}): ConditionLike => ({ corners: sec('none'), edges: sec('none'), surface: sec('none'), psa10_ruled_out: false, ...over })
const front = (l: number, r: number, t = 50, b = 50) => centeringFromBorders('front', l, r, t, b)
const back = (l: number, r: number, t = 50, b = 50) => centeringFromBorders('back', l, r, t, b)

describe('PSA centering thresholds', () => {
  it('cite the source and keep the house 55/45 front line for a 10', () => {
    expect(PSA_CENTERING.url).toBe('https://www.psacard.com/gradingstandards')
    expect(PSA_CENTERING.front[0]).toEqual({ grade: 10, max: 55 })
    expect(PSA_CENTERING.back[0]).toEqual({ grade: 10, max: 75 })
  })

  it('map a larger share to PSA grades on the front', () => {
    expect(centeringGradeFor(50, 'front')).toBe(10)
    expect(centeringGradeFor(55, 'front')).toBe(10)
    expect(centeringGradeFor(56, 'front')).toBe(9)
    expect(centeringGradeFor(65, 'front')).toBe(9)
    expect(centeringGradeFor(68, 'front')).toBe(8)
    expect(centeringGradeFor(72, 'front')).toBe(7)
    expect(centeringGradeFor(78, 'front')).toBe(6)
    expect(centeringGradeFor(85, 'front')).toBe(5)
    expect(centeringGradeFor(88, 'front')).toBe(3)
    expect(centeringGradeFor(95, 'front')).toBe(1)
  })

  it('on the back only 10, 9 and 1 are distinguishable, as PSA publishes', () => {
    expect(centeringGradeFor(75, 'back')).toBe(10)
    expect(centeringGradeFor(80, 'back')).toBe(9)
    expect(centeringGradeFor(90, 'back')).toBe(9)
    expect(centeringGradeFor(91, 'back')).toBe(1)
  })
})

describe('scoreCentering', () => {
  it('scores the tighter side with high confidence when both are measured', () => {
    const s = scoreCentering(front(55, 45, 52, 48), back(50, 50))
    expect(s).toMatchObject({ score: 10, low: 10, high: 10, confidence: 'high', caveats: [] })
    expect(s.basis).toBe("front 55/45 left to right, 52/48 top to bottom; back 50/50 left to right, 50/50 top to bottom. Within PSA's 10 centering line (front is the tighter side).")
    expect(scoreCentering(front(50, 50), back(80, 20))).toMatchObject({ score: 9, confidence: 'high' })
    expect(scoreCentering(front(68, 32), back(50, 50)).score).toBe(8)
    expect(scoreCentering(front(60, 40), null).basis).toBe("front 60/40 left to right, 50/50 top to bottom. Outside PSA's 10 centering line, within the 9 line (front is the tighter side).")
  })

  it('is medium confidence with one side and low when a photo is small or angled', () => {
    expect(scoreCentering(front(50, 50), null)).toMatchObject({ score: 10, confidence: 'medium', caveats: ['back not measured'] })
    expect(scoreCentering(front(50, 50), unmeasured('back', 'short-side'))).toMatchObject({ score: 10, confidence: 'low', caveats: ['back photo under 800px', 'back not measured'] })
    expect(scoreCentering(unmeasured('front', 'angled'), back(50, 50))).toMatchObject({ score: 10, confidence: 'low' })
    expect(scoreCentering(unmeasured('front', 'short-side'), null)).toMatchObject({ score: null, confidence: 'low', basis: 'Centering was not measured.' })
  })

  it('never scores from an unresolved print edge', () => {
    const s = scoreCentering(front(2, 60), null)
    expect(s.score).toBeNull()
    expect(s.basis).toBe('Centering was not measured.')
    expect(s.caveats).toEqual(['front print edge not found'])
    // The resolved back carries the score; the front's failure is a caveat, not a 50/50.
    const mixed = scoreCentering(front(0, 0, 0, 0), back(53, 47, 52, 48))
    expect(mixed).toMatchObject({ score: 10, confidence: 'medium', caveats: ['front print edge not found', 'front not measured'] })
    expect(mixed.basis).not.toContain('front 50/50')
  })
})

describe('scorePart', () => {
  const q = { caveats: [] as string[], backMissing: false }

  it('maps severity to a subscore and a band', () => {
    expect(SEVERITY_BANDS).toEqual({ none: { score: 10, low: 9.5, high: 10 }, light: { score: 9, low: 8, high: 9.5 }, moderate: { score: 7, low: 6, high: 8 }, heavy: { score: 5, low: 3, high: 6 } })
    expect(scorePart('corners', sec('none'), q)).toMatchObject({ score: 10, low: 9.5, high: 10, confidence: 'high', basis: 'None: no defect named.' })
    expect(scorePart('edges', sec('light', ['whitening']), q)).toMatchObject({ score: 9, low: 8, high: 9.5, basis: 'Light: whitening.' })
    expect(scorePart('surface', sec('heavy', ['scratch', 'crease'], 'medium'), q)).toMatchObject({ score: 5, confidence: 'medium', basis: 'Heavy: scratch, crease.' })
  })

  it('gives no score when the model could not judge, gave no severity, or gave no condition', () => {
    expect(scorePart('surface', sec('unclear'), q)).toMatchObject({ score: null, confidence: 'low', basis: 'The model could not judge this part from these photos.' })
    expect(scorePart('surface', { flags: [] }, q)).toMatchObject({ score: null, basis: 'The model gave no severity for this part.' })
    expect(scorePart('surface', null, q)).toMatchObject({ score: null, basis: 'The model gave no condition read.' })
  })

  it('drops confidence to low on glare, blur or an unclear photo, and to medium when the back was not sent', () => {
    expect(scorePart('surface', sec('none', ['glare']), q)).toMatchObject({ score: 10, confidence: 'low', caveats: ['glare'], basis: 'None: no defect named.' })
    expect(scorePart('edges', sec('light', ['unclear_photo', 'whitening']), q)).toMatchObject({ confidence: 'low', caveats: ['photo unclear'], basis: 'Light: whitening.' })
    expect(scorePart('corners', sec('none'), { caveats: [], backMissing: true })).toMatchObject({ confidence: 'medium', caveats: ['back not sent'] })
    expect(scorePart('surface', sec('none'), { caveats: [], backMissing: true })).toMatchObject({ confidence: 'high' })
    expect(scorePart('corners', sec('none'), { caveats: ['front photo under 800px'], backMissing: false })).toMatchObject({ confidence: 'low' })
  })
})

describe('buildScores', () => {
  it('a clean card: every part 10 not ruled out, overall 9.5 or better, never a confirmed 10', () => {
    const s = buildScores({ front: front(52, 48), back: back(55, 45), condition: cond() })
    expect(s.label).toBe('AI estimate, not a grade')
    expect(s.estimate).toBe(true)
    expect(s.overall).toEqual({ low: 9.5, high: 10, text: '9.5 or better · 10 not ruled out.', confidence: 'high', tenRuledOut: false, tenRuledOutBy: [] })
    expect(JSON.stringify(s)).not.toMatch(/is a 10|confirmed/)
  })

  it('a worn card: the weakest part caps the range, which reads low to high', () => {
    const s = buildScores({ front: front(50, 50), back: back(50, 50), condition: cond({ edges: sec('moderate', ['whitening']), corners: sec('light', ['ding']) }) })
    expect(s.overall).toMatchObject({ low: 6, high: 8, text: '6 to 8.', confidence: 'high' })
    expect(s.edges.score).toBe(7)
    expect(s.corners.score).toBe(9)
  })

  it('says a 10 is ruled out by centering and caps the top at 9.5', () => {
    const s = buildScores({ front: front(60, 40), back: back(50, 50), condition: cond() })
    expect(s.centering.score).toBe(9)
    expect(s.overall).toMatchObject({ high: 9, tenRuledOut: true, tenRuledOutBy: ['centering'], text: '9 to 9.' })
    const byModel = buildScores({ front: front(50, 50), back: back(50, 50), condition: cond({ psa10_ruled_out: true }) })
    expect(byModel.overall).toMatchObject({ low: 9.5, high: 9.5, tenRuledOut: true, tenRuledOutBy: ['the model saw a clear defect'], text: '9.5 to 9.5.' })
  })

  it('widens the low end with lower confidence and names why', () => {
    const s = buildScores({ front: unmeasured('front', 'short-side'), back: null, condition: cond({ surface: sec('none', ['glare']) }) })
    expect(s.centering.score).toBeNull()
    expect(s.overall).toMatchObject({ low: 8.5, high: 10, confidence: 'low', text: '8.5 or better · 10 not ruled out. From 3 of 4 parts.' })
    expect(s.lowConfidenceReasons).toEqual(['front photo under 800px', 'glare'])
    const angled = buildScores({ front: front(50, 50), back: unmeasured('back', 'angled'), condition: cond() })
    expect(angled.overall.confidence).toBe('low')
    expect(angled.lowConfidenceReasons).toEqual(['back photo angled'])
  })

  it('works from centering alone when the model gave nothing, and says so', () => {
    const s = buildScores({ front: front(50, 50), back: back(50, 50), condition: null })
    expect(s.corners).toMatchObject({ score: null, basis: 'The model gave no condition read.' })
    expect(s.overall.text).toBe('10 or better · 10 not ruled out. From 1 of 4 parts.')
    const nothing = buildScores({ front: null, back: null, condition: null })
    expect(nothing.overall).toMatchObject({ low: null, high: null, text: 'No score: nothing could be measured or read from these photos.' })
  })

  it('says "back not sent" only when no back photo went to the model, whatever its centering read', () => {
    // Back sent but its centering block came back null: the model still saw the back.
    const sentNoBlock = buildScores({ front: front(50, 50), back: null, backSent: true, condition: cond() })
    expect(sentNoBlock.corners.caveats).not.toContain('back not sent')
    expect(sentNoBlock.corners.confidence).toBe('high')
    // Back sent but could not be measured: corners and edges still rest on both photos.
    const sentUnmeasured = buildScores({ front: front(50, 50), back: unmeasured('back', 'no-print-edge'), backSent: true, condition: cond() })
    expect(sentUnmeasured.corners.caveats).toEqual([])
    expect(sentUnmeasured.edges.caveats).toEqual([])
    expect(sentUnmeasured.centering.caveats).toEqual(['back print edge not found', 'back not measured'])
    // No back at all.
    const notSent = buildScores({ front: front(50, 50), back: null, backSent: false, condition: cond() })
    expect(notSent.corners.caveats).toEqual(['back not sent'])
    expect(notSent.corners.confidence).toBe('medium')
    expect(notSent.surface.caveats).toEqual([])
    // Without the flag, the old inference from the centering block still holds.
    expect(buildScores({ front: front(50, 50), back: null, condition: cond() }).corners.caveats).toEqual(['back not sent'])
    expect(buildScores({ front: front(50, 50), back: unmeasured('back', 'not_sent'), condition: cond() }).corners.caveats).toEqual(['back not sent'])
  })

  it('helpers', () => {
    expect(formatScore(9.5)).toBe('9.5')
    expect(formatScore(10)).toBe('10')
    expect(lowestConfidence('high', 'medium', 'high')).toBe('medium')
    expect(lowestConfidence('low', 'high')).toBe('low')
    expect(lowestConfidence()).toBe('high')
  })
})
