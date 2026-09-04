import type { SealedGuidance } from '../data/sealed'

export function SealedStrip({ guidance }: { guidance: SealedGuidance }) {
  return (
    <section
      aria-label="Sealed"
      className="rounded-2xl border border-line bg-surface px-4 py-3"
    >
      <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Sealed</p>
      <dl className="mt-1.5 space-y-1">
        <div className="flex gap-3">
          <dt className="w-6 shrink-0 text-[14px] font-semibold leading-5 text-ink">EN</dt>
          <dd className="tabular text-[14px] leading-5 text-ink">{guidance.en}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-6 shrink-0 text-[14px] font-semibold leading-5 text-ink">JP</dt>
          <dd className="tabular text-[14px] leading-5 text-muted">{guidance.jp}</dd>
        </div>
      </dl>
    </section>
  )
}
