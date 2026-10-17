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
  mergeSnapshotCsv,
  omitIgnoredValueColumns,
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
      'OPB-0007',
    ])
    expect(parsed.skipped).toBe(2)
    expect(parsed.copies.some((c) => c.cardName === 'Ghost' || c.cardName === 'TOTAL')).toBe(false)
  })

  it('reads sale fields and ignores the sheet market column', () => {
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
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('—')).toBeNull()
    expect(parseMoney('S$1,234.50')).toBe(1234.5)
    expect(parseMoney('(1.50)')).toBe(-1.5)
  })
})

describe('legal values', () => {
  const copies = valued()
  const summary = summariseBought(copies)

  it('prices raw and Japanese PSA 10 from the seed, and nothing else', () => {
    const nami = copies.find((c) => c.rowId === 'OPB-0001')!
    const enel = copies.find((c) => c.rowId === 'OPB-0003')!
    const parallel = copies.find((c) => c.rowId === 'OPB-0005')!
    const psa9 = copies.find((c) => c.rowId === 'OPB-0006')!
    const bgs = copies.find((c) => c.rowId === 'OPB-0009')!
    expect(nami.quote).toMatchObject({ source: 'Limitless', sgd: 0.9, asOf: '2026-09-05' })
    expect(enel.quote).toMatchObject({
      source: 'OP Box Index',
      sgd: 333.55,
      asOf: '2026-09-14',
      detail: 'Japanese printing · sold median',
    })
    expect(enel.quote!.sgd).not.toBe(171.74)
    expect(parallel.quote).toBeNull()
    expect(psa9.quote).toBeNull()
    expect(bgs.quote).toBeNull()
    expect(isStale(nami.quote!.asOf, TODAY)).toBe(true)
    expect(isStale('2026-10-10', TODAY)).toBe(false)
    expect(isStale('2026-10-09', TODAY)).toBe(true)
  })

  it('groups the same print and grade as ×N and keeps each all-in', () => {
    const nami = summary.holdings.find((g) => g.code === 'ST01-007')!
    expect(nami.copies.map((c) => c.rowId)).toEqual(['OPB-0001', 'OPB-0002'])
    expect(nami.copies.map((c) => c.allInSgd)).toEqual([2, 0.5])
    expect(nami.costSgd).toBe(2.5)
    expect(nami.marketSgd).toBe(1.8)
    expect(summary.holdings.find((g) => g.code === 'OP05-100p2')!.copies).toHaveLength(1)
    expect(summary.sold.map((c) => c.rowId)).toEqual(['OPB-0007'])
  })

  it('totals cost, legal value, P/L and ROI in SGD', () => {
    expect(summary.heldCopies).toBe(6)
    expect(summary.listedCopies).toBe(1)
    expect(summary.soldCopies).toBe(1)
    expect(summary.costSgd).toBe(557.5)
    expect(summary.marketSgd).toBe(398.67)
    expect(summary.unpricedHeld).toBe(3)
    expect(summary.unrealizedSgd).toBe(-43.83)
    expect(summary.realizedSgd).toBe(1.6)
    expect(summary.overallSgd).toBe(-42.23)
    expect(summary.capitalSgd).toBe(447.5)
    expect(summary.roi).toBe(-0.094369)
  })

  it('does not change when the sheet market, P/L or PriceCharting URL changes', () => {
    const header = fixture[0]
    const market = header.indexOf('Market value SGD')
    const pl = header.indexOf('P/L SGD')
    const url = header.indexOf('PriceCharting URL')
    const tweaked = fixture.map((row, i) => {
      if (i === 0) return row
      const next = [...row]
      next[market] = '1'
      next[pl] = '1'
      next[url] = 'https://www.pricecharting.com/other'
      return next
    })
    expect(summariseBought(valued(tweaked))).toEqual(summary)
    const stripped = omitIgnoredValueColumns(fixture)
    expect(stripped[0]).not.toContain('Market value SGD')
    expect(stripped[0]).not.toContain('PriceCharting URL')
    expect(parseBoughtMatrix(stripped).copies[0].allInSgd).toBe(2)
  })
})

describe('under-cost alerts', () => {
  const copies = valued()

  it('fires once, and again only on a new low', () => {
    const first = freshUnderCostAlerts(copies, {})
    expect(first.map((a) => a.rowId).sort()).toEqual(['OPB-0001', 'OPB-0003'])
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
    const older = snapshotLine(summariseBought(valued()), '2026-10-16', 'sheet').replace('sheet', 'sheet')
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
