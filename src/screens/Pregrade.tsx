import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'
import { SearchField } from '../components/SearchField'
import { EmptyState } from '../components/EmptyState'
import { resolveCardNumber } from '../lib/search'
import { formatDate, formatUsMarketUsd } from '../lib/format'
import { removePrediction, usePredictions } from '../store/predictions'
import { GhostButton } from '../components/Buttons'

const VERDICT_LABEL = { go: 'Go', borderline: 'Borderline', 'no-go': 'No-go' } as const

export function PregradeScreen() {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const rows = usePredictions()
  const match = useMemo(() => resolveCardNumber(q), [q])
  const unknown = q.trim().length >= 3 && !match

  return (
    <Screen>
      <BackBar fallbackTo="/" crumbs={[{ label: 'Sets', to: '/' }, { label: 'Pre-grade' }]} />
      <h1 className="text-display text-ink">Pre-grade</h1>
      <p className="mt-2 max-w-[60ch] text-body text-muted">
        Photos can rule out a PSA 10. They never confirm one. Piecebook never buys, bids or offers.
      </p>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (match) navigate(`/pregrade/${encodeURIComponent(match.cardNumber)}`)
        }}
      >
        <SearchField value={q} onChange={setQ} placeholder="Piecebook card number, e.g. ST01-007" />
        {match && (
          <Link
            to={`/pregrade/${encodeURIComponent(match.cardNumber)}`}
            className="mt-3 flex min-h-[48px] items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 text-ink transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-medium leading-5">
                {match.name} · {match.cardNumber}
              </span>
              <span className="block text-meta text-muted">
                {match.setCode}
                {match.marketUsd != null && match.asOf
                  ? ` · seed ${formatUsMarketUsd(match.marketUsd)} as of ${formatDate(match.asOf)} — not a sold`
                  : ' · no seed market'}
              </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-muted">
              ›
            </span>
          </Link>
        )}
        {unknown && <p className="mt-3 text-meta text-muted">That number is not in the seed.</p>}
      </form>

      <section className="mt-10" aria-labelledby="pregrade-log">
        <h2 id="pregrade-log" className="text-title text-ink">
          Prediction log
        </h2>
        <p className="mt-1 text-meta text-muted">On this browser only. A submitted row locks; grade entry is later.</p>
        {rows.length === 0 ? (
          <EmptyState message="No predictions yet. Open a card number to start a worksheet." />
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <Link
                  to={`/pregrade/${encodeURIComponent(r.cardNumber)}?p=${encodeURIComponent(r.id)}`}
                  className="min-w-0 flex-1 rounded-lg py-1 text-ink hover:underline"
                >
                  <p className="text-[15px] font-medium leading-5">
                    {r.cardName} · {r.cardNumber}
                  </p>
                  <p className="tabular mt-0.5 text-meta text-muted">
                    {r.verdict ? VERDICT_LABEL[r.verdict] : 'Draft'}
                    {r.status === 'submitted' ? ' · submitted' : ' · draft'}
                    {r.updatedAt ? ` · ${formatDate(r.updatedAt.slice(0, 10))}` : ''}
                  </p>
                </Link>
                {r.status !== 'submitted' && (
                  <GhostButton className="!h-11 !min-h-0 !w-auto shrink-0 px-3 text-[14px]" onClick={() => removePrediction(r.id)}>
                    Remove
                  </GhostButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Screen>
  )
}
