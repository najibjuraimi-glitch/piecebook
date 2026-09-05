import { useId } from 'react'
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

/**
 * Seed price over time, from dated seed points only. One ink line, end dots,
 * first / last date underneath, low / high on the right. No axes, no fills,
 * no % change: the figure and the dates carry it. Renders nothing with fewer
 * than two points; the caller says so in words instead.
 */
export function PriceChart({ points, className = '' }: Props) {
  const titleId = useId()
  if (points.length < 2) return null

  const usds = points.map((p) => p.usd)
  const lo = Math.min(...usds)
  const hi = Math.max(...usds)
  const span = hi - lo || Math.max(hi * 0.1, 0.01)
  const t0 = Date.parse(points[0].asOf)
  const t1 = Date.parse(points[points.length - 1].asOf)
  const tSpan = t1 - t0 || 1

  const x = (p: PricePoint) => PAD_X + ((Date.parse(p.asOf) - t0) / tSpan) * (W - PAD_X * 2)
  const y = (p: PricePoint) => PAD_Y + (1 - (p.usd - lo) / span) * (H - PAD_Y * 2)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <figure className={className} aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        Seed price from {formatDate(first.asOf)} ({formatUsd(first.usd)}) to {formatDate(last.asOf)} ({formatUsd(last.usd)}),
        {points.length} dated points, low {formatUsd(lo)}, high {formatUsd(hi)}.
      </figcaption>
      <div className="flex items-stretch gap-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-24 min-w-0 flex-1 text-ink" preserveAspectRatio="none" aria-hidden="true">
          <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} stroke="#E6E1D8" strokeWidth="1" />
          <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {points.map((p) => (
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
    </figure>
  )
}
