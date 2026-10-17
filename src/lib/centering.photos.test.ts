import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decode as decodeJpeg } from 'jpeg-js'
import sources from './fixtures/ebay/SOURCES.json'
import { centeringLabel, measurePhoto, type EdgeName, type PixelImage } from './centering'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const SIDES: EdgeName[] = ['left', 'right', 'top', 'bottom']

function loadJpeg(path: string): PixelImage {
  const raw = decodeJpeg(readFileSync(path), { useTArray: true })
  return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) }
}

/**
 * A side resolves only when the note is an agreed width. Anything else, including
 * a candidate that lost the vote, stays unmeasured and must not become a ratio.
 */
function resolvedPx(note: string | undefined, unresolved: boolean): number | null {
  if (unresolved || !note) return null
  const match = note.match(/^(\d+)px on \d+\/\d+ rows, spread \d+px$/)
  return match ? Number(match[1]) : null
}

describe('raw listing photos and the owner crops', () => {
  it('measures public eBay fronts without a border past 12% of the photo', () => {
    expect(sources.length).toBeGreaterThanOrEqual(15)
    let sides = 0
    let cards = 0
    for (const item of sources) {
      expect(item.page).toMatch(/^https:\/\/www\.ebay\.com\/itm\//)
      expect(item.image).toMatch(/^https:\/\/i\.ebayimg\.com\//)
      const image = loadJpeg(join(dir, 'ebay', item.file))
      const result = measurePhoto(image, 'front')
      expect(result.ok, `${item.itemId} ${result.ok ? '' : result.message}`).toBe(true)
      if (!result.ok) continue
      const unresolved = new Set(result.measure.unresolvedSides ?? [])
      if (result.measure.resolved) {
        cards += 1
        expect(result.measure.unresolvedSides ?? []).toEqual([])
      } else {
        expect(result.measure.cannotBeTen).toBe(false)
        expect(centeringLabel(result.measure)).toMatch(/not measured/)
        expect(centeringLabel(result.measure)).not.toMatch(/\d+\/\d+/)
      }
      for (const side of SIDES) {
        const note = result.measure.edgeNotes?.[side] ?? ''
        expect(note, item.itemId).toMatch(/px on \d+\/\d+ rows|wider than 10% of the card|no step in the outer/)
        const px = resolvedPx(note, unresolved.has(side))
        if (px == null) {
          expect(unresolved.has(side), `${item.itemId} ${side}: ${note}`).toBe(true)
          continue
        }
        sides += 1
        const dim = side === 'left' || side === 'right' ? image.width : image.height
        expect(px, `${item.itemId} ${side}`).toBeLessThanOrEqual(dim * 0.12)
      }
    }
    // The same 18 fronts resolved 9 of 72 sides before the narrow print band.
    // The floor sits under the current count so a return to that search fails,
    // without freezing every foil edge.
    expect(sides).toBeGreaterThanOrEqual(44)
    expect(cards).toBeGreaterThanOrEqual(5)
  }, 60_000)

  it('keeps the owner screenshot crops unmeasured rather than inventing a wide border', () => {
    for (const [file, side] of [
      ['mihawk-front.jpg', 'front'],
      ['navy-back.jpg', 'back'],
    ] as const) {
      const image = loadJpeg(join(dir, 'owner', file))
      const result = measurePhoto(image, side)
      expect(result.ok, file).toBe(true)
      if (!result.ok) continue
      const unresolved = new Set(result.measure.unresolvedSides ?? [])
      for (const edge of SIDES) {
        const note = result.measure.edgeNotes?.[edge] ?? ''
        expect(note.length, `${file} ${edge}`).toBeGreaterThan(0)
        expect(note).toMatch(/px on \d+\/\d+ rows|wider than 10% of the card|no step in the outer/)
        const px = resolvedPx(note, unresolved.has(edge))
        if (px == null) continue
        const dim = edge === 'left' || edge === 'right' ? image.width : image.height
        expect(px, `${file} ${edge}`).toBeLessThanOrEqual(dim * 0.1)
      }
      if (!result.measure.resolved) {
        expect(result.measure.cannotBeTen).toBe(false)
        expect(centeringLabel(result.measure)).toMatch(/not measured/)
        expect(centeringLabel(result.measure)).not.toMatch(/\d+\/\d+/)
      }
    }
  }, 30_000)
})
