import { describe, expect, it } from 'vitest'
import { languageFromLabel, matchScan, parseCaption, resolveScanPrint, type QuoteFor, type ScanSight } from './scanMatch'
import type { PrintRow } from './printResolve'

const prints: PrintRow[] = [
  { cardNumber: 'OP09-004', baseNumber: 'OP09-004', variant: '', rarity: 'SR', language: 'EN' },
  { cardNumber: 'OP09-004p1', baseNumber: 'OP09-004', variant: 'Alternate Art', rarity: 'SR', language: 'EN' },
  { cardNumber: 'OP09-004p2', baseNumber: 'OP09-004', variant: 'Manga Art', rarity: 'SR', language: 'EN' },
  { cardNumber: 'OP09-004p3', baseNumber: 'OP09-004', variant: 'Special Card', rarity: 'SP', language: 'EN' },
  { cardNumber: 'OP01-016', baseNumber: 'OP01-016', variant: '', rarity: 'SR', language: 'EN' },
]

const quotes: Record<string, { sgd: number; asOf: string }> = {
  'OP09-004': { sgd: 100, asOf: '2026-10-18' },
  'OP09-004p2': { sgd: 200, asOf: '2026-10-18' },
  'OP09-004p3': { sgd: 50, asOf: '2026-09-01' },
  'OP01-016': { sgd: 80, asOf: '2026-10-18' },
}

const quoteFor: QuoteFor = (id) => {
  const row = quotes[id]
  if (!row) return null
  return { usd: row.sgd, sgd: row.sgd, source: 'Limitless', url: null, asOf: row.asOf, detail: 'ungraded TCGplayer market' }
}

function sight(over: Partial<ScanSight> = {}): ScanSight {
  return {
    row: 0,
    col: 0,
    box: { x: 0, y: 0, w: 0.2, h: 0.3 },
    code: 'OP09-004p2',
    name: 'Nami',
    language: 'EN',
    labelText: null,
    parallel: 'manga',
    confidence: 0.95,
    sticker: { amount: 50, currency: 'SGD' },
    slab: null,
    condition: { judge: 'estimate', confidence: 'medium', whitening: false, surface: [], leftRight: '52/48', topBottom: '50/50', note: '' },
    ...over,
  }
}

describe('label language', () => {
  it('reads JP from the language word even when the set name says EN', () => {
    expect(languageFromLabel('2025 One Piece JP EN 2nd Anniversary Set')).toBe('JP')
    expect(languageFromLabel('English')).toBe('EN')
    expect(languageFromLabel('One Piece Romance Dawn')).toBeNull()
  })
})

describe('caption', () => {
  it('maps a bundle, a single and a card that is not for sale', () => {
    expect(parseCaption('1288 (Sequential x4)\n150\nX')).toEqual([
      { kind: 'bundle', amount: 1288, currency: 'SGD', count: 4 },
      { kind: 'ask', amount: 150, currency: 'SGD', count: 1 },
      { kind: 'unsold', amount: null, currency: 'SGD', count: 1 },
    ])
  })
})

describe('print matching', () => {
  it('pins one parallel and refuses a bare code when the card has several prints', () => {
    expect(resolveScanPrint('OP09-004', 'manga', prints).printId).toBe('OP09-004p2')
    expect(resolveScanPrint('OP09-004', null, prints).ambiguous).toBe(true)
    expect(resolveScanPrint('OP09-004p2', null, prints).printId).toBe('OP09-004p2')
    expect(resolveScanPrint('OP01-016', 'base', prints).printId).toBe('OP01-016')
  })
})

describe('under street and lot math', () => {
  it('flags a sticker more than 10% under a fresh English street price', () => {
    const scan = matchScan({ sights: [sight()], prints, quoteFor, today: '2026-10-18', targets: [{ id: 'WL-0001', printId: 'OP09-004p2', targetSgd: 60 }] })
    const card = scan.cards[0]
    expect(card).toMatchObject({
      printId: 'OP09-004p2',
      language: 'EN',
      priced: true,
      underStreet: true,
      targetHit: true,
      liked: 'Nami',
      gapPct: 75,
      contributionSgd: 180,
    })
    expect(scan.maxOfferSgd).toBe(180)
    expect(scan.lotStreetSgd).toBe(200)
  })

  it('does not price a Japanese card, a low-confidence id, or a stale quote', () => {
    const scan = matchScan({
      sights: [
        sight({ language: 'JP', labelText: 'One Piece JP', name: 'Nami' }),
        sight({ col: 1, confidence: 0.4, name: 'Luffy' }),
        sight({ col: 2, code: 'OP09-004p3', parallel: 'sp', name: 'Sanji', sticker: { amount: 10, currency: 'SGD' } }),
      ],
      prints,
      quoteFor,
      today: '2026-10-18',
    })
    expect(scan.cards[0]).toMatchObject({ language: 'JP', priced: false, street: { label: 'No price yet', sgd: null }, drag: 'JP is not priced as English' })
    expect(scan.cards[1].lowConfidence).toBe(true)
    expect(scan.cards[1].priced).toBe(false)
    expect(scan.cards[2]).toMatchObject({ street: { status: 'stale', label: 'No price yet' }, priced: false, drag: 'No price yet' })
    expect(scan.lotStreetSgd).toBeNull()
    expect(scan.maxOfferSgd).toBeNull()
  })

  it('uses a caption bundle in grid order and compares it with the singles', () => {
    const scan = matchScan({
      sights: [sight({ name: 'Nami' }), sight({ col: 1, code: 'OP01-016', parallel: 'base', name: 'Luffy', sticker: null })],
      prints,
      quoteFor,
      today: '2026-10-18',
      caption: '200 (Sequential x2)',
      lotAskSgd: 250,
    })
    expect(scan.cards.every((card) => card.bundle?.amount === 200)).toBe(true)
    expect(scan.bundles[0]).toMatchObject({ askSgd: 200, singlesSgd: 280, gapSgd: 80 })
    expect(scan.lotStreetSgd).toBe(280)
    expect(scan.lotGapSgd).toBe(30)
    expect(scan.maxOfferSgd).toBe(252)
    expect(scan.cards.map((card) => card.liked)).toEqual(['Nami', 'Luffy'])
  })

  it('leaves a slab unpriced when the label grade was not read, and links a PSA cert', () => {
    const scan = matchScan({
      sights: [
        sight({
          slab: { grader: 'PSA', grade: null, cert: '123', year: '2025', setName: 'One Piece JP EN 2nd Anniversary Set', blackLabel: false },
          labelText: '2025 One Piece JP EN 2nd Anniversary Set',
          language: 'EN',
        }),
      ],
      prints,
      quoteFor,
      today: '2026-10-18',
    })
    expect(scan.cards[0]).toMatchObject({
      language: 'JP',
      priced: false,
      certUrl: 'https://www.psacard.com/cert/123',
      slab: { blackLabel: false },
    })
  })
})
