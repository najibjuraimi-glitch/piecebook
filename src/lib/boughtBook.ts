/**
 * One physical copy, keyed by header name when a Bought-tab CSV is imported.
 * Piecebook stores the rows. A caller may supply an English stored quote;
 * a Japanese printing is not a value. Otherwise the copy's own manual market
 * figure is used. Nothing here writes to a spreadsheet.
 */

import { singaporeDay } from './format'
import { exactPrintId } from './printResolve'

export const STALE_AFTER_DAYS = 7

export const BOUGHT_HEADERS = [
  'Date',
  'Card',
  'Code',
  'Grade/Raw',
  'Where/Seller',
  'Paid SGD',
  'GST SGD',
  'Forwarding SGD',
  'All-in SGD',
  'Market value SGD',
  'P/L SGD',
  'Notes',
  'Picture',
  'Row ID',
  'PriceCharting URL',
  'Status',
  'Sold date',
  'Sold price',
  'Currency',
  'Sale FX to SGD',
  'Channel',
  'Fees SGD',
  'Shipping out SGD',
  'Net SGD',
  'Realized P/L SGD',
] as const

const REQUIRED_HEADERS = ['Row ID', 'Code', 'Grade/Raw', 'All-in SGD', 'Status'] as const

export const SNAPSHOT_HEADER =
  'as_of,source,held_copies,listed_copies,sold_copies,cost_sgd,market_sgd,unpriced_held,unrealized_pl_sgd,realized_pl_sgd,overall_pl_sgd,capital_sgd,roi'

export type CopyStatus = 'held' | 'listed' | 'sold'
export type LegalGrade = 'raw' | 'psa9' | 'psa10'
export type BookSource = 'fixture' | 'piecebook'

export interface PriceQuote {
  /** Null on a manual SGD figure: that number is not a USD seed price. */
  usd: number | null
  sgd: number
  source: string
  url: string | null
  asOf: string
  detail: string | null
}

export interface BoughtCopy {
  rowId: string
  date: string | null
  dateLabel: string
  cardName: string
  code: string
  gradeText: string
  grade: LegalGrade | null
  /** EN unless the holding row was saved as JP. */
  language?: 'EN' | 'JP'
  seller: string
  paidSgd: number | null
  gstSgd: number | null
  forwardingSgd: number | null
  allInSgd: number | null
  /** Hand-entered SGD figure. Used only when no English stored quote matches. */
  manualMarketSgd: number | null
  /** Label shown with the manual figure, e.g. "Sheet (Cards)" or "Cards". */
  manualSource: string
  /** ISO day the manual figure was written. Null means undated. */
  manualAsOf: string | null
  notes: string
  /** Click-through only. Never fetched, never used as a price. */
  priceChartingUrl: string | null
  /** Seed print id when the sheet code is not itself one print. Null uses the code. */
  exactPrint?: string | null
  status: CopyStatus
  statusText: string
  soldDate: string | null
  soldDateLabel: string
  soldPrice: number | null
  soldCurrency: string
  saleFx: number | null
  channel: string
  feesSgd: number | null
  shippingOutSgd: number | null
  netSgd: number | null
  realizedSgd: number | null
}

export interface ValuedCopy extends BoughtCopy {
  quote: PriceQuote | null
  stale: boolean
  unrealizedSgd: number | null
  underCost: boolean
}

export interface HoldingGroup {
  key: string
  code: string
  cardName: string
  gradeText: string
  grade: LegalGrade | null
  copies: ValuedCopy[]
  costSgd: number | null
  marketSgd: number | null
  unrealizedSgd: number | null
  unpriced: number
}

export interface BoughtSummary {
  holdings: HoldingGroup[]
  sold: ValuedCopy[]
  heldCopies: number
  listedCopies: number
  soldCopies: number
  costSgd: number | null
  marketSgd: number | null
  unpricedHeld: number
  unrealizedSgd: number | null
  realizedSgd: number | null
  overallSgd: number | null
  capitalSgd: number | null
  /** Overall P/L ÷ the all-in of the copies in that P/L. Null when there is no capital. */
  roi: number | null
}

export type AlertMemory = Record<string, number>

export interface UnderCostAlert {
  type: 'underAllIn'
  rowId: string
  code: string
  cardName: string
  gradeText: string
  status: CopyStatus
  legalSgd: number
  allInSgd: number
  previousLowSgd: number | null
  url: string | null
  source: string | null
  asOf: string | null
  stale: boolean
  dismissed?: boolean
  firedAt?: string | null
}

export interface SnapshotView {
  asOf: string
  source: string
  heldCopies: number
  listedCopies: number
  soldCopies: number
  costSgd: number | null
  marketSgd: number | null
  unpricedHeld: number
  unrealizedSgd: number | null
  realizedSgd: number | null
  overallSgd: number | null
  capitalSgd: number | null
  roi: number | null
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function daysBetween(earlierIso: string, laterIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(earlierIso) || !/^\d{4}-\d{2}-\d{2}$/.test(laterIso)) return null
  const a = Date.parse(`${earlierIso}T00:00:00Z`)
  const b = Date.parse(`${laterIso}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/** yyyy-mm-dd that is a real calendar day. `2026-13-45` and `2026-02-30` are not. */
export function calendarDate(raw: string): string | null {
  const t = raw.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return t
}

/** A stored price date is stale when it is more than 7 calendar days before today, or it is not a real day. The price stays visible. A blank date is not stale here; the caller marks a missing date. */
export function isStale(asOf: string | null, today: string): boolean {
  if (!asOf) return false
  if (!calendarDate(asOf)) return true
  const days = daysBetween(asOf, today)
  if (days == null) return true
  return days > STALE_AFTER_DAYS
}

export function parseMoney(raw: string): number | null {
  const t = raw.trim()
  if (!t || t === '—' || t === '-' || t === '–' || t === '−') return null
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-') || t.startsWith('−') || t.startsWith('–')
  const n = t.replace(/[()]/g, '').replace(/[−–-]/g, '').replace(/[^0-9.]/g, '')
  if (!n || n === '.' || n.split('.').length > 2) return null
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  return neg ? -v : v
}

/**
 * Dates as the sheet shows them: ISO, "17 Oct 2026", or D/M/YYYY (Singapore).
 * A Sheets serial (around 44000 for the 2020s) is the cell's own date, not a guess.
 * Anything else stays a label and is not treated as a day.
 */
export function parseSheetDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const mon = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/)
  if (mon) {
    const mm = MONTHS[mon[2].slice(0, 3).toLowerCase()]
    const d = Number(mon[1])
    if (!mm || d < 1 || d > 31) return null
    return `${mon[3]}-${mm}-${String(d).padStart(2, '0')}`
  }
  const slash = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const d = Number(slash[1])
    const m = Number(slash[2])
    if (d < 1 || d > 31 || m < 1 || m > 12) return null
    return `${slash[3]}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = Number(t)
    if (n >= 20_000 && n <= 80_000) {
      const ms = Math.round((n - 25569) * 86_400_000)
      return new Date(ms).toISOString().slice(0, 10)
    }
  }
  return null
}

/**
 * The first real date written inside a note: ISO, "1 Sep 2026", or D/M/YYYY.
 * A bare number is not a date. No match means the manual figure is undated.
 */
export function findDateInText(raw: string): string | null {
  if (!raw) return null
  const iso = raw.match(/(?:^|[^0-9])(\d{4}-\d{2}-\d{2})(?![0-9])/)
  if (iso && parseSheetDate(iso[1])) return iso[1]
  const mon = raw.match(/(?:^|[^0-9A-Za-z])(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})(?![0-9A-Za-z])/)
  if (mon) {
    const d = parseSheetDate(mon[1])
    if (d) return d
  }
  const slash = raw.match(/(?:^|[^0-9])(\d{1,2}\/\d{1,2}\/\d{4})(?![0-9])/)
  if (slash) {
    const d = parseSheetDate(slash[1])
    if (d) return d
  }
  return null
}

/** An https link. `http` is rejected. A blank or other scheme is not a link. */
export function httpsUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t || /\s/.test(t)) return null
  if (!/^https:\/\//i.test(t)) return null
  return t
}

/** The calendar day in Asia/Singapore for a UTC timestamp. Same day the phone sends. */
export function singaporeToday(now: number): string {
  return singaporeDay(now)
}

/** The card number inside a sheet code. `OP09-004 SP` is `OP09-004`. A parallel id stays. Capital P is the same as p. */
const PRINT_CODE = /[A-Za-z]{1,4}\d{0,3}-\d{3}(?:[pP]\d+)?/

export function printCode(raw: string): string {
  const found = raw.match(PRINT_CODE)
  if (!found) return raw.trim()
  return found[0].toUpperCase().replace(/P(\d+)$/, 'p$1')
}

/** Raw, PSA 9 or PSA 10 only. Words after a parenthesis are a cert note, not the grade. */
export function legalGrade(text: string): LegalGrade | null {
  const s = text.split('(')[0].trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return null
  if (/^psa\s*10\b/.test(s)) return 'psa10'
  if (/^psa\s*9\b/.test(s)) return 'psa9'
  if (/^(raw|ungraded|near mint|nm)\b/.test(s)) return 'raw'
  return null
}

export function copyStatus(text: string): CopyStatus {
  const s = text.trim().toLowerCase()
  if (s === 'sold') return 'sold'
  if (s === 'listed') return 'listed'
  return 'held'
}

export function headerIndex(header: string[]): { index: Record<string, number>; missing: string[] } {
  const index: Record<string, number> = {}
  header.forEach((h, i) => {
    const name = String(h ?? '').trim()
    if (name && index[name] === undefined) index[name] = i
  })
  const missing = REQUIRED_HEADERS.filter((name) => index[name] === undefined)
  return { index, missing }
}

function cell(row: string[], index: Record<string, number>, name: string): string {
  const i = index[name]
  if (i === undefined) return ''
  return String(row[i] ?? '').trim()
}

function isTotal(value: string): boolean {
  return value.trim().toUpperCase() === 'TOTAL'
}

export function parseBoughtMatrix(matrix: string[][]): { copies: BoughtCopy[]; missing: string[]; skipped: number } {
  if (matrix.length === 0) return { copies: [], missing: [...REQUIRED_HEADERS], skipped: 0 }
  const { index, missing } = headerIndex(matrix[0].map((h) => String(h ?? '')))
  if (missing.length) return { copies: [], missing, skipped: 0 }
  const copies: BoughtCopy[] = []
  let skipped = 0
  for (const raw of matrix.slice(1)) {
    const row = raw.map((c) => String(c ?? ''))
    if (row.every((c) => !c.trim())) {
      skipped++
      continue
    }
    const rowId = cell(row, index, 'Row ID')
    const cardName = cell(row, index, 'Card')
    const code = cell(row, index, 'Code')
    if (!rowId || isTotal(rowId) || isTotal(cardName) || isTotal(code)) {
      skipped++
      continue
    }
    const gradeText = cell(row, index, 'Grade/Raw')
    const statusText = cell(row, index, 'Status')
    const status = copyStatus(statusText)
    const dateLabel = cell(row, index, 'Date')
    const soldDateLabel = cell(row, index, 'Sold date')
    const notes = cell(row, index, 'Notes')
    const marketRaw = parseMoney(cell(row, index, 'Market value SGD'))
    const manualMarketSgd = marketRaw != null && marketRaw >= 0 ? marketRaw : null
    // "Market source" wins when it is filled. "Source" is the same field.
    // Neither column, with a figure present, stays "Sheet (Cards)".
    const namedSource = cell(row, index, 'Market source')
    const sourceCol = namedSource || cell(row, index, 'Source')
    const asOfCell = cell(row, index, 'Market as of')
    const manualAsOf = parseSheetDate(asOfCell) || findDateInText(asOfCell) || findDateInText(notes)
    const sheetRealized = parseMoney(cell(row, index, 'Realized P/L SGD'))
    const netSgd = parseMoney(cell(row, index, 'Net SGD'))
    const allInSgd = parseMoney(cell(row, index, 'All-in SGD'))
    const realizedSgd =
      status === 'sold'
        ? sheetRealized != null
          ? sheetRealized
          : netSgd != null && allInSgd != null
            ? round2(netSgd - allInSgd)
            : null
        : null
    copies.push({
      rowId,
      date: parseSheetDate(dateLabel),
      dateLabel,
      cardName,
      code,
      gradeText,
      grade: legalGrade(gradeText),
      seller: cell(row, index, 'Where/Seller'),
      paidSgd: parseMoney(cell(row, index, 'Paid SGD')),
      gstSgd: parseMoney(cell(row, index, 'GST SGD')),
      forwardingSgd: parseMoney(cell(row, index, 'Forwarding SGD')),
      allInSgd,
      manualMarketSgd,
      manualSource: sourceCol || (manualMarketSgd != null ? 'Sheet (Cards)' : ''),
      manualAsOf: manualMarketSgd != null ? manualAsOf : null,
      notes,
      priceChartingUrl: httpsUrl(cell(row, index, 'PriceCharting URL')),
      exactPrint: index['Exact print'] === undefined ? null : cell(row, index, 'Exact print').trim() || null,
      status,
      statusText,
      soldDate: parseSheetDate(soldDateLabel),
      soldDateLabel,
      soldPrice: parseMoney(cell(row, index, 'Sold price')),
      soldCurrency: cell(row, index, 'Currency').toUpperCase(),
      saleFx: parseMoney(cell(row, index, 'Sale FX to SGD')),
      channel: cell(row, index, 'Channel'),
      feesSgd: parseMoney(cell(row, index, 'Fees SGD')),
      shippingOutSgd: parseMoney(cell(row, index, 'Shipping out SGD')),
      netSgd,
      realizedSgd,
    })
  }
  return { copies, missing: [], skipped }
}

/** An English stored quote. A Japanese printing, or a manual SGD figure, is not one. */
export function isEnglishStoredQuote(quote: PriceQuote | null): quote is PriceQuote {
  if (!quote) return false
  if (quote.usd == null || !Number.isFinite(quote.usd) || quote.usd < 0) return false
  if (!Number.isFinite(quote.sgd) || !quote.asOf || !quote.source) return false
  if ((quote.detail || '').toLowerCase().includes('japanese')) return false
  return true
}

function manualQuote(copy: BoughtCopy): PriceQuote | null {
  if (copy.manualMarketSgd == null || !Number.isFinite(copy.manualMarketSgd) || copy.manualMarketSgd < 0) return null
  const asOf = copy.manualAsOf && /^\d{4}-\d{2}-\d{2}$/.test(copy.manualAsOf) ? copy.manualAsOf : ''
  return {
    usd: null,
    sgd: round2(copy.manualMarketSgd),
    source: copy.manualSource.trim() || 'Manual',
    url: copy.priceChartingUrl ?? null,
    asOf,
    detail: asOf ? null : 'Undated',
  }
}

export function valueCopy(copy: BoughtCopy, stored: PriceQuote | null, today: string): ValuedCopy {
  const usable = isEnglishStoredQuote(stored) ? stored : manualQuote(copy)
  const stale = usable ? (usable.asOf ? isStale(usable.asOf, today) : true) : false
  const unrealizedSgd =
    copy.status !== 'sold' && usable && copy.allInSgd != null ? round2(usable.sgd - copy.allInSgd) : null
  const underCost =
    copy.status !== 'sold' && usable != null && copy.allInSgd != null && usable.sgd < copy.allInSgd
  return { ...copy, quote: usable, stale, unrealizedSgd, underCost }
}

export function valueCopies(
  copies: BoughtCopy[],
  quoteFor: (code: string, grade: LegalGrade | null) => PriceQuote | null,
  today: string,
): ValuedCopy[] {
  return copies.map((copy) => {
    const id = exactPrintId(copy.exactPrint)
    return valueCopy(copy, id ? quoteFor(id, copy.grade) : null, today)
  })
}

function sum(nums: (number | null | undefined)[]): number | null {
  const xs = nums.filter((n): n is number => n != null && Number.isFinite(n))
  if (xs.length === 0) return null
  return round2(xs.reduce((a, b) => a + b, 0))
}

/** Same code and the same Grade/Raw text. PSA 10 and Raw stay on separate lines. */
function groupKey(copy: ValuedCopy): string {
  return `${copy.code.trim().toUpperCase()}|${copy.gradeText.trim()}`
}

export function summariseBought(copies: ValuedCopy[]): BoughtSummary {
  const owned = copies.filter((c) => c.status !== 'sold')
  const sold = copies
    .filter((c) => c.status === 'sold')
    .slice()
    .sort((a, b) => {
      const ad = a.soldDate ?? ''
      const bd = b.soldDate ?? ''
      if (ad !== bd) return bd.localeCompare(ad)
      return a.rowId.localeCompare(b.rowId)
    })

  const byKey = new Map<string, ValuedCopy[]>()
  for (const copy of owned) {
    const key = groupKey(copy)
    const list = byKey.get(key)
    if (list) list.push(copy)
    else byKey.set(key, [copy])
  }
  const holdings: HoldingGroup[] = [...byKey.entries()].map(([key, group]) => {
    const copiesInGroup = group.slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.rowId.localeCompare(b.rowId))
    const first = copiesInGroup[0]
    return {
      key,
      code: first.code,
      cardName: first.cardName,
      gradeText: first.gradeText,
      grade: first.grade,
      copies: copiesInGroup,
      costSgd: sum(copiesInGroup.map((c) => c.allInSgd)),
      marketSgd: sum(copiesInGroup.map((c) => c.quote?.sgd ?? null)),
      unrealizedSgd: sum(copiesInGroup.map((c) => c.unrealizedSgd)),
      unpriced: copiesInGroup.filter((c) => c.quote == null).length,
    }
  })
  holdings.sort((a, b) => {
    if (a.marketSgd == null && b.marketSgd == null) return a.cardName.localeCompare(b.cardName) || a.code.localeCompare(b.code)
    if (a.marketSgd == null) return 1
    if (b.marketSgd == null) return -1
    if (a.marketSgd !== b.marketSgd) return b.marketSgd - a.marketSgd
    return a.cardName.localeCompare(b.cardName)
  })

  const pricedOwned = owned.filter((c) => c.unrealizedSgd != null)
  const realizedSold = sold.filter((c) => c.realizedSgd != null)
  const unrealizedSgd = sum(pricedOwned.map((c) => c.unrealizedSgd))
  const realizedSgd = sum(realizedSold.map((c) => c.realizedSgd))
  const overallSgd = unrealizedSgd == null && realizedSgd == null ? null : round2((unrealizedSgd ?? 0) + (realizedSgd ?? 0))
  const capitalSgd = sum([
    ...pricedOwned.map((c) => c.allInSgd),
    ...realizedSold.map((c) => c.allInSgd),
  ])
  const roi = overallSgd != null && capitalSgd != null && capitalSgd !== 0 ? Math.round((overallSgd / capitalSgd) * 1e6) / 1e6 : null

  return {
    holdings,
    sold,
    heldCopies: owned.filter((c) => c.status === 'held').length,
    listedCopies: owned.filter((c) => c.status === 'listed').length,
    soldCopies: sold.length,
    costSgd: sum(owned.map((c) => c.allInSgd)),
    marketSgd: sum(owned.map((c) => c.quote?.sgd ?? null)),
    unpricedHeld: owned.filter((c) => c.quote == null).length,
    unrealizedSgd,
    realizedSgd,
    overallSgd,
    capitalSgd,
    roi,
  }
}

/**
 * Fire when a held or listed copy's legal price is under its all-in.
 * The same price does not fire again. A strictly lower legal price does.
 */
export function underCostAlertList(copies: ValuedCopy[], memory: AlertMemory, includeDismissed = false): UnderCostAlert[] {
  const alerts: UnderCostAlert[] = []
  for (const copy of copies) {
    if (!copy.underCost || !copy.quote || copy.allInSgd == null) continue
    const prev = memory[copy.rowId]
    const dismissed = prev != null && copy.quote.sgd >= prev
    if (dismissed && !includeDismissed) continue
    alerts.push({
      type: 'underAllIn',
      rowId: copy.rowId,
      code: copy.code,
      cardName: copy.cardName,
      gradeText: copy.gradeText,
      status: copy.status,
      legalSgd: copy.quote.sgd,
      allInSgd: copy.allInSgd,
      previousLowSgd: prev ?? null,
      url: copy.quote.url,
      source: copy.quote.source,
      asOf: copy.quote.asOf || null,
      stale: copy.stale,
      dismissed,
    })
  }
  return alerts
}

export function freshUnderCostAlerts(copies: ValuedCopy[], memory: AlertMemory): UnderCostAlert[] {
  return underCostAlertList(copies, memory, false)
}

export function dismissAlerts(memory: AlertMemory, alerts: UnderCostAlert[]): AlertMemory {
  const next: AlertMemory = { ...memory }
  for (const alert of alerts) {
    const prev = next[alert.rowId]
    next[alert.rowId] = prev == null ? alert.legalSgd : Math.min(prev, alert.legalSgd)
  }
  return next
}

function moneyCell(n: number | null): string {
  return n == null ? '' : n.toFixed(2)
}

export function snapshotView(summary: BoughtSummary, asOf: string, source: BookSource): SnapshotView {
  return {
    asOf,
    source,
    heldCopies: summary.heldCopies,
    listedCopies: summary.listedCopies,
    soldCopies: summary.soldCopies,
    costSgd: summary.costSgd,
    marketSgd: summary.marketSgd,
    unpricedHeld: summary.unpricedHeld,
    unrealizedSgd: summary.unrealizedSgd,
    realizedSgd: summary.realizedSgd,
    overallSgd: summary.overallSgd,
    capitalSgd: summary.capitalSgd,
    roi: summary.roi,
  }
}

export function snapshotLine(summary: BoughtSummary, asOf: string, source: BookSource): string {
  const roi = summary.roi == null ? '' : summary.roi.toFixed(6)
  return [
    asOf,
    source,
    summary.heldCopies,
    summary.listedCopies,
    summary.soldCopies,
    moneyCell(summary.costSgd),
    moneyCell(summary.marketSgd),
    summary.unpricedHeld,
    moneyCell(summary.unrealizedSgd),
    moneyCell(summary.realizedSgd),
    moneyCell(summary.overallSgd),
    moneyCell(summary.capitalSgd),
    roi,
  ].join(',')
}

/**
 * One row per UTC day. A later read on the same day replaces that day.
 * Every older day stays. Rows are never deleted.
 */
export function mergeSnapshotCsv(csv: string, line: string): string {
  const asOf = line.split(',')[0]
  const text = csv.replace(/\r\n/g, '\n').replace(/\n+$/, '')
  const rows = text ? text.split('\n').filter((r) => r.trim()) : []
  const header = rows[0]?.startsWith('as_of,') ? rows[0] : SNAPSHOT_HEADER
  const body = rows[0]?.startsWith('as_of,') ? rows.slice(1) : rows
  const kept = body.filter((r) => r.split(',')[0] !== asOf)
  kept.push(line)
  kept.sort((a, b) => a.split(',')[0].localeCompare(b.split(',')[0]))
  return [header, ...kept].join('\n') + '\n'
}

function numCell(raw: string): number | null {
  if (raw == null || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function readSnapshots(csv: string): SnapshotView[] {
  const text = csv.replace(/\r\n/g, '\n').trim()
  if (!text) return []
  const [header, ...rows] = text.split('\n')
  if (!header.startsWith('as_of,')) return []
  const names = header.split(',')
  const at = (cells: string[], name: string) => cells[names.indexOf(name)] ?? ''
  return rows.filter((r) => r.trim()).map((r) => {
    const cells = r.split(',')
    return {
      asOf: at(cells, 'as_of'),
      source: at(cells, 'source'),
      heldCopies: Number(at(cells, 'held_copies')) || 0,
      listedCopies: Number(at(cells, 'listed_copies')) || 0,
      soldCopies: Number(at(cells, 'sold_copies')) || 0,
      costSgd: numCell(at(cells, 'cost_sgd')),
      marketSgd: numCell(at(cells, 'market_sgd')),
      unpricedHeld: Number(at(cells, 'unpriced_held')) || 0,
      unrealizedSgd: numCell(at(cells, 'unrealized_pl_sgd')),
      realizedSgd: numCell(at(cells, 'realized_pl_sgd')),
      overallSgd: numCell(at(cells, 'overall_pl_sgd')),
      capitalSgd: numCell(at(cells, 'capital_sgd')),
      roi: numCell(at(cells, 'roi')),
    }
  })
}
