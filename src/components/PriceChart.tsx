import { useId, useMemo, useState } from 'react'
import type { PricePoint } from '../data/history'
import { formatDate, formatUsd } from '../lib/format'

interface Props {
  points: PricePoint[]
  className?: string
}

const W = 320
const H = 96
const PAD_X = 4
const PAD_Y = 8
const DAY = 86_400_000

/** Range chips, as on Collectr, but text only. `days` null = everything we have. */
const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 91 },
  { key: '6m', label: '6M', days: 182 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All', days: null },
]

function within(points: PricePoint[], days: number | null): PricePoint[] {
  if (days === null || points.length === 0) return points
  const end = Date.parse(points[points.length - 1].asOf)
  return points.filter((p) => end - Date.parse(p.asOf) <= days * DAY)
}

/**
 * Seed price over time, from dated seed points only. One ink line, end dots,
 * first / last date underneath, low / high on the right, range chips beneath
 * when the history is long enough for them to differ. No axes, no fills, no
 * % change: the figure and the dates carry it. Renders nothing with fewer
 * than two points; the caller says so in words instead.
 */
export function PriceChart({ points, className = '' }: Props) {
  const titleId = useId()
  // Chips whose window would show the same thing as the next wider one are dropped.
  const ranges = useMemo(() => {
    const usable = RANGES.filter((r) => within(points, r.days).length >= 2)
    return usable.filter((r, i) => i === usable.length - 1 || within(points, r.days).length < within(points, usable[i + 1].days).length)
  }, [points])
  const [rangeKey, setRangeKey] = useState<string>('all')
  const active = ranges.find((r) => r.key === rangeKey) ?? ranges[ranges.length - 1]
  const shown = active ? within(points, active.days) : points

  if (shown.length < 2) return null

  const usds = shown.map((p) => p.usd)
  const lo = Math.min(...usds)
  const hi = Math.max(...usds)
  const span = hi - lo || Math.max(hi * 0.1, 0.01)
  const t0 = Date.parse(shown[0].asOf)
  const t1 = Date.parse(shown[shown.length - 1].asOf)
  const tSpan = t1 - t0 || 1

  const x = (p: PricePoint) => PAD_X + ((Date.parse(p.asOf) - t0) / tSpan) * (W - PAD_X * 2)
  const y = (p: PricePoint) => PAD_Y + (1 - (p.usd - lo) / span) * (H - PAD_Y * 2)
  const d = shown.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  const first = shown[0]
  const last = shown[shown.length - 1]
  const dense = shown.length > 24
  const sources = new Set(points.map((p) => p.source))

  return (
    <figure className={className} aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        Seed price from {formatDate(first.asOf)} ({formatUsd(first.usd)}) to {formatDate(last.asOf)} ({formatUsd(last.usd)}),
        {shown.length} dated points, low {formatUsd(lo)}, high {formatUsd(hi)}.
      </figcaption>
      <div className="flex items-stretch gap-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-24 min-w-0 flex-1 text-ink" preserveAspectRatio="none" aria-hidden="true">
          <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} stroke="#E6E1D8" strokeWidth="1" />
          <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {/* Dots on every point while sparse; only the ends once the line is dense. */}
          {(dense ? [first, last] : shown).map((p) => (
            <circle key={p.asOf} cx={x(p)} cy={y(p)} r="3" fill="#F7F5F0" stroke="currentColor" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <dl className="tabular flex shrink-0 flex-col justify-between text-right text-meta text-muted">
          <div>
            <dt className="sr-only">High</dt>
            <dd>{formatUsd(hi)}</dd>
          </div>
          <div>
            <dt className="sr-only">Low</dt>
            <dd>{formatUsd(lo)}</dd>
          </div>
        </dl>
      </div>
      <div className="tabular mt-1.5 flex justify-between text-meta text-muted">
        <span>{formatDate(first.asOf)}</span>
        <span>{formatDate(last.asOf)}</span>
      </div>

      {ranges.length > 1 && (
        <div role="group" aria-label="Range" className="mt-3 flex flex-wrap gap-1">
          {ranges.map((r) => {
            const selected = r.key === active?.key
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setRangeKey(r.key)}
                className={`tabular h-8 min-w-[40px] rounded-full px-3 text-[13px] font-medium transition-colors duration-150 ease-out ${
                  selected ? 'bg-ink text-paper' : 'text-muted hover:bg-white hover:text-ink'
                }`}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      )}

      <p className="mt-3 text-meta text-muted">
        {sources.has('tcgplayer') && sources.has('limitless')
          ? 'Weekly points from TCGPlayer chart data; daily points read from Limitless. Seed, not live.'
          : sources.has('tcgplayer')
            ? 'Weekly points from TCGPlayer chart data. Seed, not live.'
            : 'Daily points read from Limitless. Seed, not live.'}
      </p>
    </figure>
  )
}
