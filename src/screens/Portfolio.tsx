import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../config/api'
import { CardArt } from '../components/CardArt'
import { DataLink } from '../components/DataLink'
import { EmptyState } from '../components/EmptyState'
import { Screen, ScreenTitle } from '../components/Screen'
import { StatBlock } from '../components/StatBlock'
import { alertsFor, readAlertMemory, rememberAlerts } from '../lib/boughtAlerts'
import { NO_PRICE_YET } from '../lib/cardPrices'
import { formatDate, formatSgd, formatSignedPercent, formatSignedSgd, formatUsd, todayIso } from '../lib/format'
import { rateLine } from '../lib/fx'
import { bookFromMatrix, cardFor, fixtureBook, portfolioSnapshots, type LoadedBook } from '../lib/loadBought'
import type { HoldingGroup, ValuedCopy } from '../lib/boughtBook'

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

function Group({ group }: { group: HoldingGroup }) {
  const card = cardFor(group.code)
  const count = group.copies.length
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
                  {group.unrealizedSgd != null
                    ? formatSignedSgd(group.unrealizedSgd)
                    : group.costSgd == null
                      ? DASH
                      : `${formatSgd(group.costSgd)} all‑in`}
                </p>
        </div>
      </div>
      {group.copies[0]?.quote && (
        <p className="mt-2 text-meta text-muted">
          {group.copies[0].quote.url ? (
            <a href={group.copies[0].quote.url} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-line underline-offset-2">
              {group.copies[0].quote.source}
            </a>
          ) : (
            group.copies[0].quote.source
          )}
          {group.copies[0].quote.detail ? ` · ${group.copies[0].quote.detail}` : ''} · {formatDate(group.copies[0].quote.asOf)}
          {group.copies[0].stale ? ' · Stale, older than 7 days' : ''}
        </p>
      )}
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
            {parts(copy) && <p className="mt-0.5 text-meta text-muted">{parts(copy)}</p>}
            {copy.notes && <p className="mt-0.5 text-meta text-muted">{copy.notes}</p>}
          </li>
        ))}
      </ul>
    </li>
  )
}

function SoldRow({ copy }: { copy: ValuedCopy }) {
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
    </li>
  )
}

/**
 * Portfolio is the Bought sheet: one row per physical copy, valued only from
 * legal seed prices. The sample fixture shows until a signed-in read succeeds.
 */
export function PortfolioScreen() {
  const today = todayIso()
  const sample = useMemo(() => fixtureBook(today), [today])
  const history = useMemo(() => portfolioSnapshots(), [])
  const [book, setBook] = useState<LoadedBook>(sample)
  const [readNote, setReadNote] = useState<string | null>(null)
  const [memory, setMemory] = useState(readAlertMemory)

  useEffect(() => {
    const ac = new AbortController()
    fetch(`${API_BASE}/bought`, { credentials: 'include', signal: ac.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { source?: string; matrix?: string[][]; reason?: string } | null) => {
        if (!data || data.source !== 'sheet' || !Array.isArray(data.matrix)) {
          if (data?.reason === 'read_failed') setReadNote('The Bought sheet could not be read. Showing the sample book.')
          return
        }
        const next = bookFromMatrix(data.matrix, today, 'sheet')
        if (next.missing.length) {
          setReadNote(`The sheet is missing ${next.missing.join(', ')}. Showing the sample book.`)
          return
        }
        setBook(next)
        setReadNote(null)
      })
      .catch(() => {
        // No worker, no key, or the public site. The fixture stays.
      })
    return () => ac.abort()
  }, [today])

  const { summary } = book
  const alerts = useMemo(() => alertsFor(book.copies, memory), [book.copies, memory])
  const ownedCount = summary.heldCopies + summary.listedCopies
  const latest = history.length ? history[history.length - 1] : null

  const dismiss = () => setMemory(rememberAlerts(memory, alerts))

  return (
    <Screen>
      <ScreenTitle title="Portfolio" subline={book.source === 'fixture' ? 'Sample book' : 'Bought sheet'} />

      {book.source === 'fixture' && (
        <p className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-meta text-ink">
          Sample book, not your cards. It stays until the Bought tab can be read. Setup is in{' '}
          <span className="font-medium">docs/BOUGHT-SHEET.md</span>.
        </p>
      )}
      {readNote && <p className="mb-4 text-meta text-ink">{readNote}</p>}

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
            className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold text-ink"
          >
            Dismiss
          </button>
        </section>
      )}

      {ownedCount === 0 && summary.soldCopies === 0 ? (
        <EmptyState message={book.source === 'fixture' ? 'The sample book is empty.' : 'No copies on the Bought tab.'} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3 tablet:gap-4">
            <StatBlock
              label="Cost basis"
              value={money(summary.costSgd)}
              subline="All‑in from the sheet, in S$. Not converted."
            />
            <StatBlock
              label="Market value"
              value={summary.marketSgd == null ? NO_PRICE_YET : formatSgd(summary.marketSgd)}
              subline={
                summary.unpricedHeld
                  ? `${summary.unpricedHeld} ${summary.unpricedHeld === 1 ? 'copy has' : 'copies have'} no price yet.`
                  : 'Legal prices only, in S$.'
              }
            />
            <StatBlock
              label="Unrealized P/L"
              value={signed(summary.unrealizedSgd)}
              tone={toneOf(summary.unrealizedSgd)}
              subline="Priced holdings only. The sheet’s P/L column is not used."
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
              {summary.unpricedHeld ? ` ${summary.unpricedHeld} with no legal price are left out.` : ''}
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
                  <Group key={group.key} group={group} />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">
              Sold · {summary.soldCopies} {summary.soldCopies === 1 ? 'sale' : 'sales'}
            </h2>
            {summary.sold.length === 0 ? (
              <p className="mt-3 px-1 text-body text-muted">No sales on the sheet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {summary.sold.map((copy, i) => (
                  <SoldRow key={`${copy.rowId}-${i}`} copy={copy} />
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
