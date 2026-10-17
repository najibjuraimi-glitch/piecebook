import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decode as decodeJpeg } from 'jpeg-js'
import sources from './fixtures/listings/SOURCES.json'
import { measurePhoto } from './centering'
import { photoCentering, summariseCentering, withFullArtFront } from './centeringSummary'
import { isBorderlessCardNumber } from './frontBorder'

const dir = dirname(fileURLToPath(import.meta.url))

describe('listing fixtures', () => {
  it('records the five listing URLs and measures the one photo that could be fetched', () => {
    expect(sources.map((s) => s.page)).toEqual([
      'https://www.carousell.sg/p/monkey-d-luffy-one-piece-english-op13-wanted-sp-1420119669',
      'https://www.carousell.sg/p/one-piece-card-game-trafalgar-law-sp-english-1428435525',
      'https://www.carousell.sg/p/one-piece-ccg-shanks-sp-sr-alternative-art-st16-004-english-1445446649',
      'https://www.ebay.com/itm/298725185525',
      'https://www.ebay.com/itm/860034714691',
    ])
    const boa = sources.find((s) => s.itemId === '860034714691')
    expect(boa?.fetched).toBe(true)
    expect(isBorderlessCardNumber('OP01-078p2')).toBe(true)
    const raw = decodeJpeg(readFileSync(join(dir, 'fixtures/listings', boa!.file!)), { useTArray: true })
    const image = { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) }
    const result = measurePhoto(image, 'front')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('angled')
    expect(result.message).toMatch(/angled about 20°/)
    const read = withFullArtFront(photoCentering(result, 'front'), true)
    const summary = summariseCentering(read, null)
    expect(read && !read.measured && read.reason).toBe('full-art')
    expect(read && !read.measured ? read.photoProblem : '').toBe('front photo angled')
    expect(summary.verdict).toBe('Centering was not measured.')
    expect(summary.note).toContain('Front centering not applicable (full art)')
    expect(summary.note).toMatch(/angled about 20°/)
    expect(summary.cannotBeTen).toBe(false)
  })
})
