import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '../data/csv'
import {
  BOUGHT_HEADERS,
  dismissAlerts,
  freshUnderCostAlerts,
  headerIndex,
  isStale,
  findDateInText,
  mergeSnapshotCsv,
  parseBoughtMatrix,
  parseMoney,
  parseSheetDate,
  readSnapshots,
  SNAPSHOT_HEADER,
  snapshotLine,
  summariseBought,
  valueCopies,
  type PriceQuote,
} from './boughtBook'
import { legalQuote } from './loadBought'

const TODAY = '2026-10-17'

function readText(url: URL): string {
  return new TextDecoder().decode(readFileSync(fileURLToPath(url)))
}

const fixture = parseCsv(readText(new URL('../../data/bought-fixture.csv', import.meta.url)))

function valued(matrix: string[][] = fixture) {
  const parsed = parseBoughtMatrix(matrix)
  return valueCopies(parsed.copies, legalQuote, TODAY)
}

function quote(sgd: number, asOf = '2026-10-16'): PriceQuote {
  return { usd: 1, sgd, source: 'Limitless', url: 'https://onepiece.limitlesstcg.com/cards/en/ST01-007', asOf, detail: 'ungraded TCGplayer market' }
}

describe('parseBoughtMatrix', () => {
  it('keys on header names, not column order', () => {
    const header = [...BOUGHT_HEADERS]
    const reversed = [...header].reverse()
    const { index } = headerIndex(header)
    const row = header.map((name) => {
      if (name === 'Row ID') return 'OPB-0001'
      if (name === 'Code') return 'ST01-007'
      if (name === 'Card') return 'Nami'
      if (name === 'Grade/Raw') return 'Raw'
      if (name === 'All-in SGD') return '2.00'
      if (name === 'Status') return 'Held'
      if (name === 'Market value SGD') return '999'
      return ''
    })
    const flipped = reversed.map((name) => row[index[name]])
    const a = parseBoughtMatrix([header, row]).copies[0]
    const b = parseBoughtMatrix([reversed, flipped]).copies[0]
    expect(b).toEqual(a)
    expect(a.allInSgd).toBe(2)
    expect(a.code).toBe('ST01-007')
  })

  it('skips a blank Row ID and a TOTAL row', () => {
    const parsed = parseBoughtMatrix(fixture)
    expect(parsed.missing).toEqual([])
    expect(parsed.copies.map((c) => c.rowId)).toEqual([
      'OPB-0001',
      'OPB-0002',
      'OPB-0003',
      'OPB-0004',
      'OPB-0005',
      'OPB-0006',
      'OPB-0009',
      'OPB-0010',
      'OPB-0007',
    ])
    expect(parsed.skipped).toBe(2)
    expect(parsed.copies.some((c) => c.cardName === 'Ghost' || c.cardName === 'TOTAL')).toBe(false)
  })

  it('reads sale fields and keeps a manual market off the sale', () => {
    const sold = parseBoughtMatrix(fixture).copies.find((c) => c.rowId === 'OPB-0007')!
    expect(sold.status).toBe('sold')
    expect(sold.soldDate).toBe('2026-09-30')
    expect(sold.soldPrice).toBe(8)
    expect(sold.soldCurrency).toBe('SGD')
    expect(sold.channel).toBe('Carousell')
    expect(sold.feesSgd).toBe(0.4)
    expect(sold.shippingOutSgd).toBe(1)
    expect(sold.netSgd).toBe(6.6)
    expect(sold.realizedSgd).toBe(1.6)
  })

  it('parses dates and money without inventing a blank', () => {
    expect(parseSheetDate('17 Oct 2026')).toBe('2026-10-17')
    expect(parseSheetDate('17/10/2026')).toBe('2026-10-17')
    expect(parseSheetDate('45947')).toBe('2025-10-17')
    expect(parseSheetDate('soon')).toBeNull()
    expect(findDateInText('Cards reading 1 Sep 2026')).toBe('2026-09-01')
    expect(findDateInText('as of 12 Oct 2026')).toBe('2026-10-12')
    expect(findDateInText('Sample copy')).toBeNull()
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('—')).toBeNull()
    expect(parseMoney('S$1,234.50')).toBe(1234.5)
    expect(parseMoney('(1.50)')).toBe(-1.5)
  })
})

describe('legal values', () => {
  const copies = valued()
  const summary = summariseBought(copies)

  it('uses an English stored price, then the manual figure, and never a Japanese PSA 10', () => {
    const nami = copies.find((c) => c.rowId === 'OPB-0001')!
    const enel = copies.find((c) => c.rowId === 'OPB-0003')!
    const enelRaw = copies.find((c) => c.rowId === 'OPB-0010')!
    const parallel = copies.find((c) => c.rowId === 'OPB-0005')!
    const psa9 = copies.find((c) => c.rowId === 'OPB-0006')!
    const bgs = copies.find((c) => c.rowId === 'OPB-0009')!
    expect(nami.manualMarketSgd).toBe(999)
    expect(nami.quote).toMatchObject({ source: 'Limitless', sgd: 0.9, asOf: '2026-09-05' })
    expect(nami.quote!.sgd).not.toBe(999)
    expect(enel.quote).toMatchObject({ source: 'Sheet (Cards)', sgd: 350, asOf: '2026-09-01', usd: null, detail: null })
    expect(enel.quote!.detail ?? '').not.toMatch(/japanese/i)
    expect(enel.stale).toBe(true)
    expect(enelRaw.quote).toMatchObject({ source: 'Limitless', sgd: 171.72 })
    expect(enelRaw.quote!.sgd).not.toBe(350)
    expect(parallel.quote).toBeNull()
    expect(psa9.quote).toMatchObject({ source: 'Sheet (Cards)', sgd: 40, asOf: '2026-10-12' })
    expect(psa9.stale).toBe(false)
    expect(bgs.quote).toBeNull()
    expect(isStale(nami.quote!.asOf, TODAY)).toBe(true)
    expect(isStale('2026-10-10', TODAY)).toBe(false)
    expect(isStale('2026-10-09', TODAY)).toBe(true)
    expect(nami.priceChartingUrl).toBe('https://www.pricecharting.com/game/one-piece/nami')
  })

  it('marks a manual figure with no date as undated and stale', () => {
    const header = fixture[0]
    const row = header.map((name) => {
      if (name === 'Row ID') return 'OPB-0100'
      if (name === 'Code') return 'OP05-001'
      if (name === 'Card') return 'Sabo'
      if (name === 'Grade/Raw') return 'BGS 10'
      if (name === 'All-in SGD') return '20'
      if (name === 'Market value SGD') return '12'
      if (name === 'Notes') return 'No date here'
      if (name === 'Status') return 'Held'
      return ''
    })
    const copy = valued([header, row])[0]
    expect(copy.quote).toMatchObject({ source: 'Sheet (Cards)', sgd: 12, asOf: '', detail: 'Undated' })
    expect(copy.stale).toBe(true)
  })

  it('groups the same code and grade text, and keeps PSA 10 apart from raw', () => {
    const nami = summary.holdings.find((g) => g.code === 'ST01-007')!
    expect(nami.copies.map((c) => c.rowId)).toEqual(['OPB-0001', 'OPB-0002'])
    expect(nami.copies.map((c) => c.allInSgd)).toEqual([2, 0.5])
    expect(nami.costSgd).toBe(2.5)
    expect(nami.marketSgd).toBe(1.8)
    const enel = summary.holdings.filter((g) => g.code === 'OP05-100p2')
    expect(enel.map((g) => g.gradeText).sort()).toEqual(['PSA 10', 'Raw'])
    expect(summary.sold.map((c) => c.rowId)).toEqual(['OPB-0007'])

    const header = ['Row ID', 'Code', 'Grade/Raw', 'All-in SGD', 'Status', 'Card']
    const split = valued([
      header,
      ['OPB-0201', 'ST01-007', 'PSA 10', '10', 'Held', 'Nami'],
      ['OPB-0202', 'ST01-007', 'PSA10', '11', 'Held', 'Nami'],
      ['OPB-0203', 'ST01-007', 'Raw', '1', 'Held', 'Nami'],
    ])
    const groups = summariseBought(split).holdings
    expect(groups).toHaveLength(3)
    expect(groups.map((g) => g.gradeText).sort()).toEqual(['PSA 10', 'PSA10', 'Raw'])
  })

  it('totals cost, value, P/L and ROI in SGD', () => {
    expect(summary.heldCopies).toBe(7)
    expect(summary.listedCopies).toBe(1)
    expect(summary.soldCopies).toBe(1)
    expect(summary.costSgd).toBe(707.5)
    expect(summary.marketSgd).toBe(626.84)
    expect(summary.unpricedHeld).toBe(2)
    expect(summary.unrealizedSgd).toBe(19.34)
    expect(summary.realizedSgd).toBe(1.6)
    expect(summary.overallSgd).toBe(20.94)
    expect(summary.capitalSgd).toBe(612.5)
    expect(summary.roi).toBe(0.034188)
  })

  it('ignores sheet P/L, and an English price beats the manual column', () => {
    const header = fixture[0]
    const market = header.indexOf('Market value SGD')
    const pl = header.indexOf('P/L SGD')
    const url = header.indexOf('PriceCharting URL')
    const id = header.indexOf('Row ID')
    const tweaked = fixture.map((row) => {
      const next = [...row]
      if (next[id] === 'OPB-0001') next[market] = '1'
      next[pl] = '1'
      if (next[url]) next[url] = 'https://www.pricecharting.com/other'
      return next
    })
    const again = summariseBought(valued(tweaked))
    expect(again.marketSgd).toBe(summary.marketSgd)
    expect(again.realizedSgd).toBe(summary.realizedSgd)
    const moved = fixture.map((row) => {
      const next = [...row]
      if (next[id] === 'OPB-0003') next[market] = '10'
      return next
    })
    expect(summariseBought(valued(moved)).marketSgd).not.toBe(summary.marketSgd)
  })
})

describe('under-cost alerts', () => {
  const copies = valued()

  it('fires once, and again only on a new low', () => {
    const first = freshUnderCostAlerts(copies, {})
    expect(first.map((a) => a.rowId).sort()).toEqual(['OPB-0001', 'OPB-0003'])
    expect(first.find((a) => a.rowId === 'OPB-0003')!.legalSgd).toBe(350)
    const memory = dismissAlerts({}, first)
    expect(freshUnderCostAlerts(copies, memory)).toEqual([])

    const cheaper = copies.map((c) =>
      c.rowId === 'OPB-0001' && c.quote ? { ...c, quote: quote(0.4), underCost: true, unrealizedSgd: -1.6 } : c,
    )
    const again = freshUnderCostAlerts(cheaper, memory)
    expect(again.map((a) => a.rowId)).toEqual(['OPB-0001'])
    expect(again[0].previousLowSgd).toBe(0.9)
    const after = dismissAlerts(memory, again)
    const rebound = cheaper.map((c) =>
      c.rowId === 'OPB-0001' && c.quote ? { ...c, quote: quote(0.7), underCost: true } : c,
    )
    expect(freshUnderCostAlerts(rebound, after)).toEqual([])
    expect(freshUnderCostAlerts(copies.filter((c) => c.rowId === 'OPB-0005'), {})).toEqual([])
  })
})

describe('daily snapshot', () => {
  it('replaces the same day and keeps older days', () => {
    const line = snapshotLine(summariseBought(valued()), '2026-10-17', 'fixture')
    const older = snapshotLine(summariseBought(valued()), '2026-10-16', 'piecebook')
    let csv = mergeSnapshotCsv('', older)
    csv = mergeSnapshotCsv(csv, line)
    csv = mergeSnapshotCsv(csv, line.replace('2026-10-17', '2026-10-17'))
    const rows = readSnapshots(csv)
    expect(rows.map((r) => r.asOf)).toEqual(['2026-10-16', '2026-10-17'])
    expect(csv.split('\n').filter((r) => r.startsWith('2026-10-17')).length).toBe(1)
    expect(csv.startsWith(SNAPSHOT_HEADER)).toBe(true)
    const committed = readText(new URL('../../data/portfolio-history.csv', import.meta.url))
    expect(committed).toBe(mergeSnapshotCsv('', line))
  })
})
