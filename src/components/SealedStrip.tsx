import type { SealedGuidance } from '../data/sealed'

export function SealedStrip({ guidance }: { guidance: SealedGuidance }) {
  return (
    <section
      aria-label="Sealed"
      className="rounded-2xl border border-line bg-surface px-4 py-3.5"
    >
      <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Sealed</p>
      <dl className="mt-2 space-y-2">
        <div className="flex gap-3">
          <dt className="w-6 shrink-0 pt-px text-meta font-semibold text-ink">EN</dt>
          <dd className="text-[15px] leading-[22px] text-ink">{guidance.en}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-6 shrink-0 pt-px text-meta font-semibold text-ink">JP</dt>
          <dd className="text-[15px] leading-[22px] text-muted">{guidance.jp}</dd>
        </div>
      </dl>
    </section>
  )
}
