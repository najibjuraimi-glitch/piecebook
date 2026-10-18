import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CardArt } from '../components/CardArt'
import { PrintsPanel } from '../components/PrintsPanel'
import { DataLink } from '../components/DataLink'
import { EmptyState } from '../components/EmptyState'
import { Screen, ScreenTitle } from '../components/Screen'
import { StatBlock } from '../components/StatBlock'
import { dismissAlerts, getAlerts } from '../lib/alertsClient'
import { alertsFor, readAlertMemory, rememberAlerts } from '../lib/boughtAlerts'
import { printCode, snapshotView, type HoldingGroup, type UnderCostAlert, type ValuedCopy } from '../lib/boughtBook'
import { NO_PRICE_YET } from '../lib/cardPrices'
import { formatDate, formatSgd, formatSignedPercent, formatSignedSgd, formatUsd, todayIso } from '../lib/format'
import { rateLine } from '../lib/fx'
import { getHoldings, postHolding } from '../lib/holdingsClient'
import { bookFromHoldings, cardFor, fixtureBook, portfolioSnapshots, type LoadedBook } from '../lib/loadBought'

const DASH = '—'

function toneOf(n: number | null): 'ink' | 'good' | 'bad' {
  if (n == null || n === 0) return 'ink'
  return n > 0 ? 'good' : 'bad'
}

function signed(n: number | null): string {
  return n == null ? DASH : formatSignedSgd(n)
}

function money(n: number | null): string {
  return n == null ? DASH : formatSgd(n)
}

function soldPrice(copy: ValuedCopy): string {
  if (copy.soldPrice == null) return DASH
  if (copy.soldCurrency === 'USD') return formatUsd(copy.soldPrice)
  if (copy.soldCurrency === 'SGD') return formatSgd(copy.soldPrice)
  if (!copy.soldCurrency) return copy.soldPrice.toFixed(2)
  return `${copy.soldPrice.toFixed(2)} ${copy.soldCurrency}`
}

function parts(copy: ValuedCopy): string | null {
  const bits: string[] = []
  if (copy.paidSgd) bits.push(`Paid ${formatSgd(copy.paidSgd)}`)
  if (copy.gstSgd) bits.push(`GST ${formatSgd(copy.gstSgd)}`)
  if (copy.forwardingSgd) bits.push(`Forwarding ${formatSgd(copy.forwardingSgd)}`)
  return bits.length ? bits.join(' · ') : null
}

function quoteBits(copy: ValuedCopy): string {
  const q = copy.quote
  if (!q) return ''
  const bits = [q.detail, q.asOf ? formatDate(q.asOf) : ''].filter(Boolean)
  if (copy.stale) bits.push(q.asOf ? 'Stale, older than 7 days' : 'Stale')
  return bits.join(' · ')
}

function QuoteLine({ copy }: { copy: ValuedCopy }) {
  const q = copy.quote
  if (!q) return null
  const rest = quoteBits(copy)
  return (
    <p className="mt-2 text-meta text-muted">
      {q.url ? (
        <a href={q.url} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-line underline-offset-2">
          {q.source}
        </a>
      ) : (
        q.source
      )}
      {rest ? ` · ${rest}` : ''}
    </p>
  )
}

function pinOf(copy: ValuedCopy): string | null {
  const exact = copy.exactPrint?.trim()
  return exact || null
}

function pinsDiffer(group: HoldingGroup): boolean {
  const pins = new Set(group.copies.map(pinOf))
  return pins.size > 1
}

function sharedPin(group: HoldingGroup): string | null {
  if (pinsDiffer(group) || group.copies.length === 0) return null
  return pinOf(group.copies[0])
}

function sharedQuote(group: HoldingGroup): ValuedCopy | 'mixed' | null {
  const priced = group.copies.filter((c) => c.quote)
  if (priced.length === 0) return null
  if (priced.length !== group.copies.length) return 'mixed'
  const first = priced[0]
  const q = first.quote!
  const same = priced.every(
    (c) => c.quote!.source === q.source && c.quote!.sgd === q.sgd && c.quote!.asOf === q.asOf && c.quote!.detail === q.detail && c.stale === first.stale,
  )
  return same ? first : 'mixed'
}

function Group({ group, editable }: { group: HoldingGroup; editable: boolean }) {
  const card = cardFor(printCode(group.code))
  const count = group.copies.length
  const shared = sharedQuote(group)
  const under = group.copies.some((c) => c.underCost)
  const title = (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[15px] font-medium leading-5 text-ink">{group.cardName || group.code || 'Card'}</p>
      <p className="tabular truncate text-meta text-muted">
        {group.code || 'No code'}
        {group.gradeText ? ` · ${group.gradeText}` : ''}
        {count > 1 ? ` · ×${count}` : ''}
      </p>
    </div>
  )
  return (
    <li className="px-3 py-3">
      <div className="flex items-center gap-3">
        {card ? (
          <Link to={`/cards/${encodeURIComponent(card.cardNumber)}`} className="w-10 shrink-0" aria-label={`${card.name} ${card.cardNumber}`}>
            <CardArt card={card} className="rounded-md" />
          </Link>
        ) : (
          <div className="aspect-[5/7] w-10 shrink-0 rounded-md bg-[#EFEBE3]" aria-hidden="true" />
        )}
        {card ? (
          <Link to={`/cards/${encodeURIComponent(card.cardNumber)}`} className="min-w-0 flex-1">
            {title}
          </Link>
        ) : (
          title
        )}
        <div className="shrink-0 text-right">
          <p className="tabular text-[15px] font-semibold text-ink">{group.marketSgd == null ? NO_PRICE_YET : formatSgd(group.marketSgd)}</p>
          <p className={`tabular text-meta ${toneOf(group.unrealizedSgd) === 'good' ? 'text-good' : toneOf(group.unrealizedSgd) === 'bad' ? 'text-bad' : 'text-muted'}`}>
            {group.unrealizedSgd != null ? formatSignedSgd(group.unrealizedSgd) : group.costSgd == null ? DASH : `${formatSgd(group.costSgd)} all‑in`}
          </p>
        </div>
      </div>
      {shared === 'mixed' ? <p className="mt-2 text-meta text-muted">Mixed values</p> : shared ? <QuoteLine copy={shared} /> : null}
      {under && <p className="mt-1 text-meta text-bad">Under cost</p>}
      <PrintsPanel
        code={group.code}
        grade={group.grade}
        exactPrint={sharedPin(group)}
        mixed={pinsDiffer(group)}
      />
      <details className="mt-2">
        <summary className="flex min-h-12 cursor-pointer list-none items-center text-meta font-medium text-ink">
          {count === 1 ? 'Row ID' : 'Row IDs'}
          <span className="tabular ml-2 font-normal text-muted">×{count}</span>
        </summary>
        <ul className="mt-2 space-y-2">
          {group.copies.map((copy, i) => (
            <li key={`${copy.rowId}-${i}`} className="rounded-xl bg-paper px-3 py-2">
              <p className="text-meta text-ink">
                <span className="tabular font-medium">{copy.rowId}</span>
                {copy.date ? ` · ${formatDate(copy.date)}` : copy.dateLabel ? ` · ${copy.dateLabel}` : ''}
                {copy.seller ? ` · ${copy.seller}` : ''}
                {copy.status === 'listed' ? ' · Listed' : ''}
              </p>
              <p className="tabular mt-0.5 text-meta text-muted">
                {copy.gradeText ? `${copy.gradeText} · ` : ''}
                {copy.allInSgd == null ? 'No all-in' : `${formatSgd(copy.allInSgd)} all‑in`}
                {copy.quote ? ` · ${formatSgd(copy.quote.sgd)}` : ` · ${NO_PRICE_YET}`}
                {copy.unrealizedSgd != null ? ` · ${formatSignedSgd(copy.unrealizedSgd)}` : ''}
                {copy.underCost ? ' · Under cost' : ''}
              </p>
              {shared === 'mixed' && <QuoteLine copy={copy} />}
              {parts(copy) && <p className="mt-0.5 text-meta text-muted">{parts(copy)}</p>}
              {copy.notes && <p className="mt-0.5 text-meta text-muted">{copy.notes}</p>}
              {copy.priceChartingUrl && (
                <p className="mt-0.5 text-meta">
                  <a href={copy.priceChartingUrl} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-line underline-offset-2">
                    PriceCharting
                  </a>
                </p>
              )}
              {editable && (
                <p className="mt-2 flex gap-4 text-meta">
                  <Link to={`/portfolio/${encodeURIComponent(copy.rowId)}`} className="font-medium text-ink underline decoration-line underline-offset-2">
                    Edit
                  </Link>
                  <Link to={`/portfolio/${encodeURIComponent(copy.rowId)}/sold`} className="font-medium text-ink underline decoration-line underline-offset-2">
                    Mark sold
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}

function SoldRow({ copy, editable }: { copy: ValuedCopy; editable: boolean }) {
  return (
    <li className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium leading-5 text-ink">{copy.cardName || copy.code}</p>
          <p className="tabular truncate text-meta text-muted">
            {copy.code}
            {copy.gradeText ? ` · ${copy.gradeText}` : ''}
            {copy.rowId ? ` · ${copy.rowId}` : ''}
          </p>
        </div>
        <p className={`tabular shrink-0 text-[15px] font-semibold ${toneOf(copy.realizedSgd) === 'good' ? 'text-good' : toneOf(copy.realizedSgd) === 'bad' ? 'text-bad' : 'text-ink'}`}>
          {signed(copy.realizedSgd)}
        </p>
      </div>
      <p className="mt-1 text-meta text-muted">
        {copy.soldDate ? formatDate(copy.soldDate) : copy.soldDateLabel || 'No sold date'}
        {copy.channel ? ` · ${copy.channel}` : ''}
      </p>
      <p className="tabular mt-1 text-meta text-ink">
        {soldPrice(copy)}
        {copy.saleFx != null ? ` · FX ${copy.saleFx}` : ''}
        {` · Fees ${money(copy.feesSgd)}`}
        {` · Shipping ${money(copy.shippingOutSgd)}`}
      </p>
      <p className="tabular text-meta text-muted">Net {money(copy.netSgd)} · Realized {signed(copy.realizedSgd)}</p>
      <PrintsPanel code={copy.code} grade={copy.grade} exactPrint={copy.exactPrint} />
      {editable && (
        <p className="mt-2">
          <Link to={`/portfolio/${encodeURIComponent(copy.rowId)}/sold`} className="text-meta font-medium text-ink underline decoration-line underline-offset-2">
            Edit sale
          </Link>
        </p>
      )}
    </li>
  )
}

/**
 * Portfolio is Piecebook's own book. The sample fixture shows until a
 * signed-in read of /holdings succeeds. English stored prices win; a manual
 * figure is the fallback. A Japanese printing is not used.
 */
export function PortfolioScreen() {
  const today = todayIso()
  const sample = useMemo(() => fixtureBook(today), [today])
  const sampleHistory = useMemo(() => portfolioSnapshots(), [])
  const [book, setBook] = useState<LoadedBook>(sample)
  const [history, setHistory] = useState(sampleHistory)
  const [readNote, setReadNote] = useState<string | null>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [pendingCsv, setPendingCsv] = useState<string | null>(null)
  const [memory, setMemory] = useState(readAlertMemory)
  const [serverAlerts, setServerAlerts] = useState<UnderCostAlert[]>([])
  const [alertsRevision, setAlertsRevision] = useState<number | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    getHoldings(ac.signal)
      .then((res) => {
        if (!res.ok || !res.data || !Array.isArray(res.data.copies)) {
          if (res.status >= 500) setReadNote('Your book could not be read. Showing the sample.')
          return
        }
        setBook(bookFromHoldings(res.data.copies, today, res.data.revision))
        if (Array.isArray(res.data.history)) setHistory(res.data.history)
        setReadNote(null)
      })
      .catch(() => {
        // No worker, signed out, or the public site. The fixture stays.
      })
    return () => ac.abort()
  }, [today])

  useEffect(() => {
    if (book.source !== 'piecebook' || book.revision == null) return
    const ac = new AbortController()
    postHolding('/holdings/snapshot', snapshotView(book.summary, today, 'piecebook'), ac.signal)
      .then((res) => {
        if (res.ok && res.data && Array.isArray(res.data.history)) setHistory(res.data.history)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [book.source, book.revision, book.summary, today])

  useEffect(() => {
    if (book.source !== 'piecebook') return
    const ac = new AbortController()
    getAlerts(ac.signal)
      .then((res) => {
        if (!res.ok || !res.data || !Array.isArray(res.data.underAllIn)) return
        setServerAlerts(res.data.underAllIn)
        setAlertsRevision(res.data.revision)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [book.source, book.revision])

  const { summary } = book
  const fixtureAlerts = useMemo(() => (book.source === 'fixture' ? alertsFor(book.copies, memory) : []), [book.source, book.copies, memory])
  const alerts = book.source === 'fixture' ? fixtureAlerts : serverAlerts
  const ownedCount = summary.heldCopies + summary.listedCopies
  const latest = history.length ? history[history.length - 1] : null
  const editable = book.source === 'piecebook'

  const dismiss = () => {
    if (book.source !== 'piecebook') {
      setMemory(rememberAlerts(memory, alerts))
      return
    }
    if (alertsRevision == null) return
    void dismissAlerts({ revision: alertsRevision, underAllIn: alerts.map((alert) => alert.rowId), watchlist: [] }).then((res) => {
      if (!res.ok || !res.data) return
      setServerAlerts(res.data.underAllIn)
      setAlertsRevision(res.data.revision)
    })
  }

  const runImport = async (csv: string, replace: boolean) => {
    if (book.revision == null) return
    const res = await postHolding('/holdings/import', { revision: book.revision, csv, replace })
    if (res.status === 409 && res.error === 'already_imported') {
      setPendingCsv(csv)
      setImportNote('This book already has copies. Replace them with this file only if that is the one-time import.')
      return
    }
    if (!res.ok) {
      setImportNote('That file could not be imported.')
      return
    }
    setPendingCsv(null)
    setImportNote(null)
    const again = await getHoldings()
    if (again.ok && again.data) {
      setBook(bookFromHoldings(again.data.copies, today, again.data.revision))
      if (Array.isArray(again.data.history)) setHistory(again.data.history)
    }
  }

  return (
    <Screen>
      <ScreenTitle
        title="Portfolio"
        subline={book.source === 'fixture' ? 'Sample book' : 'Your book'}
        aside={
          <span className="flex gap-3">
            <Link to="/bid" className="text-meta font-medium text-ink underline decoration-line underline-offset-2">
              All-in
            </Link>
            <Link to="/watchlist" className="text-meta font-medium text-ink underline decoration-line underline-offset-2">
              Watchlist
            </Link>
          </span>
        }
      />

      {book.source === 'fixture' && (
        <p className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-meta text-ink">
          Sample book, not your cards. It stays until you are signed in. Your copies are stored in Piecebook. Setup is in{' '}
          <span className="font-medium">docs/BOUGHT-SHEET.md</span>.
        </p>
      )}
      {readNote && <p className="mb-4 text-meta text-ink">{readNote}</p>}
      {editable && (
        <div className="mb-4 flex gap-3">
          <Link
            to="/portfolio/new"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold text-ink"
          >
            Add a copy
          </Link>
          <label className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold text-ink">
            Import CSV
            <input
              type="file"
              accept="text/csv,.csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                file.text().then((csv) => runImport(csv, false)).catch(() => setImportNote('That file could not be read.'))
              }}
            />
          </label>
        </div>
      )}
      {importNote && <p className="mb-4 text-meta text-ink">{importNote}</p>}
      {pendingCsv && (
        <button
          type="button"
          onClick={() => runImport(pendingCsv, true)}
          className="mb-4 inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold text-ink"
        >
          Replace the book with this file
        </button>
      )}

      {alerts.length > 0 && (
        <section className="mb-4 rounded-2xl border border-bad/30 bg-[#FDECEC] px-4 py-3" role="status">
          <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-bad">Under all-in</h2>
          <ul className="mt-2 space-y-1">
            {alerts.map((alert) => (
              <li key={alert.rowId} className="text-[15px] leading-6 text-ink">
                {alert.cardName || alert.code} · {alert.code}
                {alert.gradeText ? ` · ${alert.gradeText}` : ''} · {formatSgd(alert.legalSgd)} against {formatSgd(alert.allInSgd)} all‑in
                {alert.previousLowSgd != null ? ` · New low, was ${formatSgd(alert.previousLowSgd)}` : ''}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={dismiss}
            className="mt-3 inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold text-ink"
          >
            Dismiss
          </button>
        </section>
      )}

      {ownedCount === 0 && summary.soldCopies === 0 ? (
        <EmptyState message={book.source === 'fixture' ? 'The sample book is empty.' : 'No copies yet. Add one, or import a Bought CSV.'} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3 tablet:gap-4">
            <StatBlock label="Cost basis" value={money(summary.costSgd)} subline="All‑in, in S$. Not converted." />
            <StatBlock
              label="Market value"
              value={summary.marketSgd == null ? NO_PRICE_YET : formatSgd(summary.marketSgd)}
              subline={
                summary.unpricedHeld
                  ? `${summary.unpricedHeld} ${summary.unpricedHeld === 1 ? 'copy has' : 'copies have'} no price yet.`
                  : 'English stored price, or your manual figure.'
              }
            />
            <StatBlock
              label="Unrealized P/L"
              value={signed(summary.unrealizedSgd)}
              tone={toneOf(summary.unrealizedSgd)}
              subline="Priced holdings only."
            />
          </div>

          <section className="mt-3 rounded-2xl border border-line bg-surface px-5 py-5">
            <p className="text-meta font-medium text-muted">Overall</p>
            <p className={`tabular mt-1 text-[32px] font-semibold leading-[38px] tracking-[-0.02em] ${toneOf(summary.overallSgd) === 'good' ? 'text-good' : toneOf(summary.overallSgd) === 'bad' ? 'text-bad' : 'text-ink'}`}>
              {signed(summary.overallSgd)}
            </p>
            <p className={`tabular mt-1 text-[22px] font-semibold leading-7 ${toneOf(summary.roi) === 'good' ? 'text-good' : toneOf(summary.roi) === 'bad' ? 'text-bad' : 'text-ink'}`}>
              {summary.roi == null ? DASH : formatSignedPercent(summary.roi * 100)} ROI
            </p>
            <p className="mt-2 text-meta text-muted">
              Realized {signed(summary.realizedSgd)}
              {summary.soldCopies ? ` on ${summary.soldCopies} ${summary.soldCopies === 1 ? 'sale' : 'sales'}` : ''}. Unrealized plus realized, over the all-in of those copies.
              {summary.unpricedHeld ? ` ${summary.unpricedHeld} with no price are left out.` : ''}
            </p>
          </section>

          <section className="mt-8">
            <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">
              Holdings · {ownedCount} {ownedCount === 1 ? 'copy' : 'copies'}
            </h2>
            {summary.holdings.length === 0 ? (
              <p className="mt-3 px-1 text-body text-muted">Nothing held or listed.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {summary.holdings.map((group) => (
                  <Group key={group.key} group={group} editable={editable} />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">
              Sold · {summary.soldCopies} {summary.soldCopies === 1 ? 'sale' : 'sales'}
            </h2>
            {summary.sold.length === 0 ? (
              <p className="mt-3 px-1 text-body text-muted">No sales yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {summary.sold.map((copy, i) => (
                  <SoldRow key={`${copy.rowId}-${i}`} copy={copy} editable={editable} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="mt-8 px-1 text-meta text-muted">
        {latest
          ? `Daily snapshot · ${history.length} ${history.length === 1 ? 'day' : 'days'} · ${formatDate(latest.asOf)}${latest.source === 'fixture' ? ' · sample totals' : ''}. One row per day; older days stay.`
          : 'Daily snapshot has not been written yet.'}{' '}
        {rateLine()}.{' '}
        <Link to="/about-prices" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
          How prices work
        </Link>
      </p>
      <DataLink className="mt-4" />
    </Screen>
  )
}
