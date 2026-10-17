import { useEffect, useRef } from 'react'
import { BUILD_SHA } from '../lib/buildInfo'
import { drawCenteringOverlay, hasPixelGeometry, type CenteringMeasure } from '../lib/centering'
import { formatScore, type Confidence, type GradeScores as Scores, type PartScore } from '../lib/gradeScore'

/**
 * TAG-style scores: centering, corners, edges, surface out of 10 and an
 * overall range, each with a confidence level. Every line is an AI estimate,
 * never a grade. A 10 is never confirmed; the range top reads "10 not ruled out".
 */
export function GradeScores({ scores }: { scores: Scores }) {
  const o = scores.overall
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3" aria-label="Scores, AI estimate">
      <p className="text-meta font-medium text-muted">{scores.label}</p>
      <p className={`tabular mt-1 text-[17px] font-medium leading-6 ${o.tenRuledOut ? 'text-ink' : 'text-ink'}`}>Overall {o.text}</p>
      <p className="mt-0.5 text-meta text-muted">
        {confidenceWord(o.confidence)}
        {o.tenRuledOut ? ` · a 10 is ruled out by ${o.tenRuledOutBy.join(' and ')}` : ''}
      </p>
      {scores.resolutionWarning && (
        <p className="mt-2 text-body text-ink" role="status">
          {scores.resolutionWarning}
        </p>
      )}
      <dl className="mt-3 divide-y divide-line">
        <PartRow label="Centering" part={scores.centering} />
        <PartRow label="Corners" part={scores.corners} />
        <PartRow label="Edges" part={scores.edges} />
        <PartRow label="Surface" part={scores.surface} />
      </dl>
      {scores.lowConfidenceReasons.length > 0 && (
        <p className="mt-3 text-meta text-ink">Low confidence because: {scores.lowConfidenceReasons.join(', ')}.</p>
      )}
      <p className="mt-3 text-meta text-muted">
        Centering follows {scores.standards.centering}. Corners, edges and surface follow the model’s severity per part. Photos can rule a 10 out. Nothing here confirms one.
      </p>
      <p className="mt-2 text-[11px] text-muted" data-testid="build-tag">
        build {BUILD_SHA}
      </p>
    </div>
  )
}

function partHeadline(part: PartScore): string {
  if (part.score == null) return 'No score'
  if (part.score >= 10 && part.confidence === 'high') return '10 not ruled out'
  return formatScore(part.score)
}

function PartRow({ label, part }: { label: string; part: PartScore }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <dt className="w-20 shrink-0 text-meta font-medium text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">
        <p className="tabular text-body text-ink">
          <span className="font-medium">{partHeadline(part)}</span>
          {part.score != null && part.low != null && part.high != null && part.low !== part.high
            ? ` · ${formatScore(part.low)} ${part.high >= 10 && part.confidence === 'high' ? 'or better' : `to ${formatScore(part.high)}`}`
            : ''}
          {` · ${confidenceWord(part.confidence)}`}
        </p>
        <p className="mt-0.5 text-meta text-muted">
          {part.basis}
          {part.caveats.length ? ` ${capitalise(part.caveats.join(', '))}.` : ''}
        </p>
      </dd>
    </div>
  )
}

export function confidenceWord(c: Confidence): string {
  return `${c} confidence`
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** The photo with the detected card outline and print edge drawn on it, with the border shares. */
export function CenteringCanvas({ bitmap, measure, side }: { bitmap: ImageBitmap; measure: CenteringMeasure; side: 'front' | 'back' }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !hasPixelGeometry(measure)) return
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawCenteringOverlay(ctx, bitmap, bitmap.width, bitmap.height, measure)
  }, [bitmap, measure])
  return <canvas ref={ref} className="mt-2 max-h-72 w-full rounded-xl object-contain" aria-label={`${side} centering overlay`} />
}
