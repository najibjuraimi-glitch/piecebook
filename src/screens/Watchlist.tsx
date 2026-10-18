import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PrintsPanel } from '../components/PrintsPanel'
import { Screen, ScreenTitle } from '../components/Screen'
import { dismissAlerts, getAlerts } from '../lib/alertsClient'
import { NO_PRICE_YET } from '../lib/cardPrices'
import { formatDate, formatSgd } from '../lib/format'
import { getWatchlist } from '../lib/watchlistClient'
import type { ValuedWatchItem, WatchHit } from '../lib/watchlist'

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

export function priceLine(item: ValuedWatchItem): string {
  if (item.priceSgd == null || !item.source) return NO_PRICE_YET
  const when = item.asOf ? formatDate(item.asOf) : ''
  return [formatSgd(item.priceSgd), item.source, when].filter(Boolean).join(' · ')
}

export function WatchlistScreen() {
  const [revision, setRevision] = useState<number | null>(null)
  const [items, setItems] = useState<ValuedWatchItem[] | null>(null)
  const [hits, setHits] = useState<WatchHit[]>([])
  const [alertsRevision, setAlertsRevision] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = (signal?: AbortSignal) => {
    getWatchlist(signal)
      .then((res) => {
        if (!res.ok || !res.data || !Array.isArray(res.data.items)) {
          setItems([])
          if (res.status === 0 || !res.ok) setNote('Sign in to keep a watchlist.')
          return
        }
        setRevision(res.data.revision)
        setItems(res.data.items)
        setNote(null)
      })
      .catch((err: unknown) => {
        if (isAbort(err)) return
        setItems([])
        setNote('Sign in to keep a watchlist.')
      })
    getAlerts(signal)
      .then((res) => {
        if (!res.ok || !res.data) return
        setHits(res.data.watchlist)
        setAlertsRevision(res.data.revision)
      })
      .catch(() => {})
  }

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    return () => ac.abort()
  }, [])

  const dismiss = async () => {
    if (alertsRevision == null || hits.length === 0) return
    const res = await dismissAlerts({ revision: alertsRevision, underAllIn: [], watchlist: hits.map((hit) => hit.id) })
    if (!res.ok || !res.data) return
    setHits(res.data.watchlist)
    setAlertsRevision(res.data.revision)
  }

  return (
    <Screen>
      <ScreenTitle
        title="Watchlist"
        subline="English price against your target, in S$"
        aside={
          <Link to="/bid" className="text-meta font-medium text-ink underline decoration-line underline-offset-2">
            All-in
          </Link>
        }
      />
      {note && <p className="mb-4 text-meta text-ink">{note}</p>}
      {revision != null && (
        <Link
          to="/watchlist/new"
          className="mb-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold text-ink"
        >
          Add a target
        </Link>
      )}
      {hits.length > 0 && (
        <section className="mb-4 rounded-2xl border border-good/30 bg-[#E7F6EE] px-4 py-3" role="status">
          <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-good">At or under target</h2>
          <ul className="mt-2 space-y-1">
            {hits.map((hit) => (
              <li key={hit.id} className="text-[15px] leading-6 text-ink">
                {hit.code} · {hit.grade} · {formatSgd(hit.priceSgd)} against {formatSgd(hit.targetSgd)}
                {hit.stale ? ' · Stale, older than 7 days' : ''}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void dismiss()}
            className="mt-3 inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold text-ink"
          >
            Dismiss
          </button>
        </section>
      )}
      {items == null ? (
        <p className="text-body text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState message={revision == null ? 'Sign in to add a target.' : 'No targets yet.'} />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-3">
              <Link to={`/watchlist/${encodeURIComponent(item.id)}`} className="block">
                <p className="text-[15px] font-medium text-ink">
                  {item.code} · {item.grade} · {item.language === 'JP' ? 'JP' : 'EN'}
                </p>
                <p className="tabular mt-1 text-meta text-ink">{priceLine(item)}</p>
                <p className="mt-1 text-meta text-muted">
                  {item.targetSgd == null ? 'No target' : `Target ${formatSgd(item.targetSgd)}`}
                  {item.hit ? ' · At or under target' : ''}
                  {item.stale ? ' · Stale, older than 7 days' : ''}
                  {item.added ? ` · Added ${formatDate(item.added)}` : ''}
                </p>
                {item.notes ? <p className="mt-1 text-meta text-muted">{item.notes}</p> : null}
              </Link>
              <PrintsPanel code={item.code} grade={item.grade === 'PSA 10' ? 'psa10' : item.grade === 'PSA 9' ? 'psa9' : 'raw'} codeIsPin />
              <Link to={`/bid?item=${encodeURIComponent(item.id)}`} className="mt-1 inline-flex min-h-11 items-center text-meta font-medium text-ink underline decoration-line underline-offset-2">
                Max bid
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
