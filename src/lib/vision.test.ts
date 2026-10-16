import { describe, expect, it } from 'vitest'
import {
  asVisionCheck,
  cardLanguageLabel,
  isNonEnglishCardLanguage,
  normalizeCardLanguage,
} from './vision'

describe('normalizeCardLanguage', () => {
  it('keeps EN JP CN KR FR', () => {
    expect(normalizeCardLanguage('EN')).toBe('EN')
    expect(normalizeCardLanguage('jp')).toBe('JP')
    expect(normalizeCardLanguage('CN')).toBe('CN')
    expect(normalizeCardLanguage('kr')).toBe('KR')
    expect(normalizeCardLanguage('FR')).toBe('FR')
  })

  it('maps common names and prefixes', () => {
    expect(normalizeCardLanguage('English')).toBe('EN')
    expect(normalizeCardLanguage('Japanese')).toBe('JP')
    expect(normalizeCardLanguage('JPN')).toBe('JP')
    expect(normalizeCardLanguage('Chinese')).toBe('CN')
    expect(normalizeCardLanguage('Korean')).toBe('KR')
    expect(normalizeCardLanguage('French')).toBe('FR')
  })

  it('returns null when the text is missing or unknown', () => {
    expect(normalizeCardLanguage(null)).toBeNull()
    expect(normalizeCardLanguage('')).toBeNull()
    expect(normalizeCardLanguage('IT')).toBeNull()
    expect(normalizeCardLanguage(12)).toBeNull()
  })
})

describe('card language helpers', () => {
  it('labels a missing read as not read', () => {
    expect(cardLanguageLabel(null)).toBe('not read')
    expect(cardLanguageLabel('EN')).toBe('EN')
  })

  it('treats only a named non-EN code as non-English', () => {
    expect(isNonEnglishCardLanguage('JP')).toBe(true)
    expect(isNonEnglishCardLanguage('EN')).toBe(false)
    expect(isNonEnglishCardLanguage(null)).toBe(false)
  })
})

describe('asVisionCheck language', () => {
  function payload(language: unknown) {
    return {
      identify: {
        set_code: 'ST14-003',
        name: 'Sanji',
        parallel_guess: 'base',
        language,
        confidence: 0.8,
        read_text: 'Sanji',
      },
      condition: {
        corners: { flags: [], notes: '' },
        edges: { flags: [], notes: '' },
        surface: { flags: [], notes: '' },
        psa10_ruled_out: false,
        reasons: [],
      },
    }
  }

  it('reads identify.language from the Worker payload', () => {
    const check = asVisionCheck(payload('JP'))
    expect(check?.identify.language).toBe('JP')
  })

  it('nulls an unknown language instead of passing it through', () => {
    expect(asVisionCheck(payload('Deutsch'))?.identify.language).toBeNull()
    expect(asVisionCheck(payload(null))?.identify.language).toBeNull()
  })
})
