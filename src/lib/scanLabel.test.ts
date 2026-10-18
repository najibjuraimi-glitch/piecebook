import { describe, expect, it } from 'vitest'
import { LABEL_UNDER, bookPrices, manualJpComp, overlayForCard, overlayLabel, preferLiveScan } from './scanLabel'

function label(over: Partial<Parameters<typeof overlayLabel>[0]> = {}) {
  return overlayLabel({
    language: 'EN',
    codeText: 'OP13-002',
    gradeText: 'PSA 10',
    sticker: { amount: 80, currency: 'SGD' },
    enStreetSgd: 100,
    jpCompSgd: null,
    ...over,
  })
}

describe('overlay label colors', () => {
  it('keeps the under-street thresholds in one place', () => {
    expect(LABEL_UNDER).toEqual({ amberPct: 5, greenAbovePct: 10 })
  })

  it('is green further than 10% under, amber from 5% through 10%, and neutral otherwise', () => {
    expect(label({ sticker: { amount: 89.99, currency: 'SGD' } }).tone).toBe('green')
    expect(label({ sticker: { amount: 90, currency: 'SGD' } }).tone).toBe('amber')
    expect(label({ sticker: { amount: 95, currency: 'SGD' } }).tone).toBe('amber')
    expect(label({ sticker: { amount: 95.01, currency: 'SGD' } }).tone).toBe('neutral')
    expect(label({ sticker: { amount: 100, currency: 'SGD' } }).tone).toBe('neutral')
    expect(label({ sticker: { amount: 120, currency: 'SGD' } }).tone).toBe('neutral')
  })

  it('shows the street price alone, in a neutral color, when the sticker was not read', () => {
    const row = label({ sticker: null })
    expect(row.tone).toBe('neutral')
    expect(row.price).toBe('S$100')
    expect(row.sticker).toBeNull()
  })

  it('shows the code and the grade that were read', () => {
    const row = label({ codeText: 'EB04-106', gradeText: 'BGS 9.5' })
    expect(row.code).toBe('EB04-106')
    expect(row.grade).toBe('BGS 9.5')
    expect(row.languageTag).toBe('EN')
  })

  it('colors a JP card only against a JP comp, never an English street price', () => {
    const priced = label({
      language: 'JP',
      enStreetSgd: 200,
      jpCompSgd: 100,
      sticker: { amount: 100, currency: 'SGD' },
    })
    expect(priced.tone).toBe('neutral')
    expect(priced.price).toBe('S$100')
    expect(priced.languageTag).toBe('JP')
    const under = label({
      language: 'JP',
      enStreetSgd: 40,
      jpCompSgd: 100,
      sticker: { amount: 80, currency: 'SGD' },
    })
    expect(under.tone).toBe('green')
    const missing = label({ language: 'JP', enStreetSgd: 200, jpCompSgd: null, sticker: { amount: 10, currency: 'SGD' } })
    expect(missing.tone).toBe('muted')
    expect(missing.price).toBe('no JP comp')
  })

  it('leaves a JP comp in a neutral color when the sticker was not read', () => {
    const row = label({ language: 'JP', enStreetSgd: 200, jpCompSgd: 80, sticker: null })
    expect(row.tone).toBe('neutral')
    expect(row.price).toBe('S$80')
    expect(row.sticker).toBeNull()
  })
})

describe('manual JP comps', () => {
  const rows = bookPrices({
    watch: [
      { code: 'OP13-002', grade: 'PSA 10', marketSgd: 90, language: 'EN' },
      { code: 'OP13-002', grade: 'PSA 10', marketSgd: 40, language: 'JP' },
    ],
    holdings: [{ exactPrint: 'ST13-002', grade: 'Raw', marketValueSgd: 15, language: 'JP' }],
  })

  it('uses the JP row and ignores the English manual price', () => {
    expect(manualJpComp(rows, 'OP13-002', 'PSA 10')).toBe(40)
    expect(manualJpComp(rows, 'ST13-002', 'Raw')).toBe(15)
    expect(manualJpComp(rows, 'OP13-002', 'Raw')).toBeNull()
    expect(manualJpComp(rows, 'OP13-002', '—')).toBeNull()
  })

  it('does not paint a JP card with the English watch price', () => {
    const chip = overlayForCard({
      language: 'JP',
      codeText: 'OP13-002',
      printId: 'OP13-002',
      slab: { grader: 'PSA', grade: '10', cert: null, year: null, setName: null, blackLabel: false },
      sticker: { amount: 20, currency: 'SGD' },
      street: { status: 'fresh', sgd: 500, source: 'Limitless', asOf: '2026-10-18', url: null, stale: false, label: null, detail: null, sources: [], sourcesDisagree: false, evidence: [] },
    }, rows)
    expect(chip.languageTag).toBe('JP')
    expect(chip.code).toBe('OP13-002')
    expect(chip.grade).toBe('PSA 10')
    expect(chip.price).toBe('S$40')
    expect(chip.tone).toBe('green')
  })
})

describe('live scan default', () => {
  it('opens the camera on a phone and the upload form on a desktop', () => {
    expect(preferLiveScan(true, true)).toBe(true)
    expect(preferLiveScan(true, false)).toBe(false)
    expect(preferLiveScan(false, true)).toBe(false)
  })
})
