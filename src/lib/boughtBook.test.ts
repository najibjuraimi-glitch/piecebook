import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '../data/csv'
import {
  BOUGHT_HEADERS,
  dismissAlerts,
  freshUnderCostAlerts,
  headerIndex,
  calendarDate,
  httpsUrl,
  isStale,
  legalGrade,
  findDateInText,
  printCode,
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
    expect(calendarDate('2026-10-16')).toBe('2026-10-16')
    expect(calendarDate('2026-13-45')).toBeNull()
    expect(calendarDate('2026-02-30')).toBeNull()
    expect(httpsUrl('https://www.pricecharting.com/a')).toBe('https://www.pricecharting.com/a')
    expect(httpsUrl('http://www.pricecharting.com/a')).toBeNull()
    expect(isStale('2026-02-30', '2026-10-16')).toBe(true)
    expect(isStale('2026-13-45', '2026-10-16')).toBe(true)
    expect(isStale('', '2026-10-16')).toBe(false)
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
    expect(enel.quote).toMatchObject({
      source: 'Sheet (Cards)',
      sgd: 350,
      asOf: '2026-09-01',
      usd: null,
      detail: null,
      url: 'https://www.pricecharting.com/game/one-piece/enel',
    })
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

  it('prices the card number inside a sheet code and groups on the sheet text', () => {
    const header = ['Row ID', 'Code', 'Grade/Raw', 'All-in SGD', 'Status', 'Card', 'Market value SGD']
    const copies = valued([
      header,
      ['OPB-0301', 'OP09-004 SP', 'Raw', '10', 'Held', 'Shanks', ''],
      ['OPB-0302', 'OP09-004 SP', 'PSA 10 (cert 149322006)', '20', 'Held', 'Shanks', '400'],
      ['OPB-0303', 'OP09-004 SP', 'PSA 10 (cert 149322006)', '21', 'Held', 'Shanks', '400'],
      ['OPB-0304', 'OP09-004 SP', 'PSA 10 (cert 999)', '22', 'Held', 'Shanks', '400'],
      ['OPB-0305', 'OP09-004', 'PSA 10', '5', 'Held', 'Shanks', ''],
    ])
    const raw = copies.find((c) => c.rowId === 'OPB-0301')!
    expect(printCode('OP09-004 SP')).toBe('OP09-004')
    expect(printCode('op05-100p2')).toBe('OP05-100p2')
    expect(printCode('OP09-004P3')).toBe('OP09-004p3')
    expect(legalGrade('PSA 10 (cert 149322006)')).toBe('psa10')
    expect(raw.code).toBe('OP09-004 SP')
    expect(raw.gradeText).toBe('Raw')
    expect(raw.grade).toBe('raw')
    expect(raw.quote).toBeNull()
    expect(legalQuote('OP09-004 SP', 'raw')).toBeNull()
    expect(legalQuote('OP09-004', 'raw')).not.toBeNull()

    const slab = copies.find((c) => c.rowId === 'OPB-0302')!
    expect(slab.code).toBe('OP09-004 SP')
    expect(slab.gradeText).toBe('PSA 10 (cert 149322006)')
    expect(slab.grade).toBe('psa10')
    expect(slab.quote).toMatchObject({ source: 'Sheet (Cards)', sgd: 400, usd: null })
    expect(slab.quote!.detail ?? '').not.toMatch(/japanese/i)

    const groups = summariseBought(copies).holdings
    const sameCert = groups.find((g) => g.copies.some((c) => c.rowId === 'OPB-0302'))!
    expect(sameCert.code).toBe('OP09-004 SP')
    expect(sameCert.gradeText).toBe('PSA 10 (cert 149322006)')
    expect(sameCert.copies.map((c) => c.rowId).sort()).toEqual(['OPB-0302', 'OPB-0303'])
    expect(groups.find((g) => g.copies.some((c) => c.rowId === 'OPB-0304'))!.copies).toHaveLength(1)
    expect(groups.find((g) => g.copies.some((c) => c.rowId === 'OPB-0301'))!.gradeText).toBe('Raw')
    expect(groups.find((g) => g.copies.some((c) => c.rowId === 'OPB-0305'))!.code).toBe('OP09-004')
    expect(copies.find((c) => c.rowId === 'OPB-0305')!.quote).toBeNull()
  })

  it('prices the cutover variant codes from the manual figure, not the base print', () => {
    const header = ['Row ID', 'Code', 'Grade/Raw', 'All-in SGD', 'Status', 'Card', 'Market value SGD', 'PriceCharting URL']
    const copies = valued([
      header,
      ['OPB-0003', 'OP13-028 SP', 'Raw', '400', 'Held', 'Shanks', '500', 'https://www.pricecharting.com/a'],
      ['OPB-0004', 'OP12-030 SP', 'Raw', '400', 'Held', 'Mihawk', '510', 'https://www.pricecharting.com/b'],
      ['OPB-0005', 'OP09-004 manga', 'Raw', '400', 'Held', 'Shanks', '520', 'https://www.pricecharting.com/c'],
      ['OPB-0009', 'EB02-010 alt art', 'Raw', '400', 'Held', 'Luffy', '530', 'https://www.pricecharting.com/d'],
    ])
    const manuals = { 'OPB-0003': 500, 'OPB-0004': 510, 'OPB-0005': 520, 'OPB-0009': 530 }
    const bases = ['OP13-028', 'OP12-030', 'OP09-004', 'EB02-010']
    copies.forEach((copy, i) => {
      const base = legalQuote(bases[i], 'raw')
      expect(base).not.toBeNull()
      expect(copy.quote).toMatchObject({
        source: 'Sheet (Cards)',
        sgd: manuals[copy.rowId as keyof typeof manuals],
        usd: null,
        url: `https://www.pricecharting.com/${'abcd'[i]}`,
      })
      expect(copy.quote!.sgd).not.toBe(base!.sgd)
      expect(copy.underCost).toBe(false)
    })
    const named = valued([
      ['Row ID', 'Code', 'Grade/Raw', 'All-in SGD', 'Status', 'Card', 'Market value SGD', 'Exact print'],
      ['OPB-0401', 'OP13-028 SP', 'Raw', '400', 'Held', 'Shanks', '500', 'OP13-028'],
    ])[0]
    expect(named.quote).toEqual(legalQuote('OP13-028', 'raw'))
    expect(named.quote!.sgd).not.toBe(500)
  })

  it('uses an exact print when the sheet code is a variant, and the manual figure when it is not one print', () => {
    const header = ['Row ID', 'Code', 'Grade/Raw', 'All-in SGD', 'Status', 'Card', 'Market value SGD', 'Exact print']
    const copies = valued([
      header,
      ['OPB-0401', 'OP09-004 SP', 'Raw', '10', 'Held', 'Shanks', '12', 'OP09-004'],
      ['OPB-0402', 'OP09-004 parallel', 'Raw', '10', 'Held', 'Shanks', '8', ''],
    ])
    expect(copies[0].quote).toEqual(legalQuote('OP09-004', 'raw'))
    expect(copies[0].quote!.sgd).not.toBe(legalQuote('OP09-004p3', 'raw')!.sgd)
    expect(copies[1].quote).toMatchObject({ source: 'Sheet (Cards)', sgd: 8, usd: null })
    expect(copies[1].quote!.sgd).not.toBe(legalQuote('OP09-004', 'raw')!.sgd)
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
