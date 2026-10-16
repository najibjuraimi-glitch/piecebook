import { describe, expect, it } from 'vitest'
import { centeringFromBorders, unmeasured } from './centeringSummary'
import { PHOTO_GUIDE_SHORT, PHOTO_TIPS, flagsOf, photoTip, tipsForOutcome } from './photoGuide'

describe('photo guide copy', () => {
  it('covers every tip the collectors asked for, in plain words', () => {
    const text = PHOTO_TIPS.map((t) => `${t.short} ${t.text}`).join(' ')
    for (const phrase of [
      'plain surface',
      'white paper',
      'dark mat',
      'palm',
      'straight down',
      'four edges',
      'margin',
      'Don’t hold the card',
      'soft, even light',
      'LED light box',
      'lamp',
      'foil',
      'tilted',
      'glare',
      'fills most of the frame',
      'original file',
      'chat app',
      '800px',
      'full-art',
      'may not measure front centering',
    ]) {
      expect(text).toContain(phrase)
    }
    expect(PHOTO_GUIDE_SHORT).toMatch(/Flat .* straight down .* soft light .* original file/)
    expect(new Set(PHOTO_TIPS.map((t) => t.id)).size).toBe(PHOTO_TIPS.length)
    expect(photoTip('light').short).toBe('Soft, even light; no lamp in the foil')
  })
})

describe('tipsForOutcome', () => {
  const ok = centeringFromBorders('front', 52, 48, 50, 50)

  it('points nowhere when both sides measured and the model saw clear photos', () => {
    expect(tipsForOutcome({ front: ok, back: centeringFromBorders('back', 50, 50, 50, 50), flags: ['whitening'] })).toEqual([])
    expect(tipsForOutcome({ front: null, back: null })).toEqual([])
  })

  it('a small photo → the original file and filling the frame', () => {
    expect(tipsForOutcome({ front: unmeasured('front', 'short-side'), back: null })).toEqual(['fill', 'original'])
  })

  it('an angled or hand-held card → flat surface, straight down, hands out', () => {
    expect(tipsForOutcome({ front: ok, back: unmeasured('back', 'angled') })).toEqual(['surface', 'straight', 'hands'])
    expect(tipsForOutcome({ front: unmeasured('front', 'no-card'), back: null })).toEqual(['surface', 'hands'])
    expect(tipsForOutcome({ front: unmeasured('front', 'cut-off'), back: null })).toEqual(['straight'])
  })

  it('glare from the model → light and the tilted check shot', () => {
    expect(tipsForOutcome({ front: ok, back: null, flags: ['glare', 'scratch'] })).toEqual(['light', 'tilt'])
    expect(tipsForOutcome({ front: ok, back: null, flags: ['blur'] })).toEqual(['fill', 'original'])
  })

  it('a front with no print border → the honest full-art note; a back with none → hands and surface', () => {
    expect(tipsForOutcome({ front: unmeasured('front', 'no-print-edge'), back: null })).toEqual(['fullart'])
    expect(tipsForOutcome({ front: ok, back: unmeasured('back', 'no-print-edge') })).toEqual(['surface', 'hands'])
  })

  it('combines without repeating, in guide order', () => {
    const tips = tipsForOutcome({ front: unmeasured('front', 'angled'), back: unmeasured('back', 'short-side'), flags: ['glare'] })
    expect(tips).toEqual(['surface', 'straight', 'hands', 'light', 'tilt', 'fill', 'original'])
  })

  it('flagsOf gathers every part and tolerates no condition', () => {
    expect(flagsOf(null)).toEqual([])
    expect(flagsOf({ corners: { flags: ['ding'] }, edges: { flags: [] }, surface: { flags: ['glare'] } })).toEqual(['ding', 'glare'])
  })
})
