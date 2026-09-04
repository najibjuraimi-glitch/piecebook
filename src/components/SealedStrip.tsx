import type { SealedGuidance } from '../data/sealed'

export function SealedStrip({ guidance }: { guidance: SealedGuidance }) {
  return (
    <section
      aria-label="Sealed"
      className="rounded-2xl border border-line bg-surface px-4 py-3 tablet:flex tablet:items-baseline tablet:gap-x-6 tablet:px-5"
    >
      <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted tablet:shrink-0">Sealed</p>
      {/* Stacked EN/JP on phone; one full-width line from tablet up. */}
      <dl className="mt-1.5 space-y-1 tablet:mt-0 tablet:flex tablet:min-w-0 tablet:flex-1 tablet:flex-wrap tablet:gap-x-8 tablet:gap-y-1 tablet:space-y-0">
        <div className="flex gap-3 tablet:min-w-0">
          <dt className="w-6 shrink-0 text-[14px] font-semibold leading-5 text-ink">EN</dt>
          <dd className="tabular text-[14px] leading-5 text-ink tablet:truncate">{guidance.en}</dd>
        </div>
        <div className="flex gap-3 tablet:min-w-0">
          <dt className="w-6 shrink-0 text-[14px] font-semibold leading-5 text-ink">JP</dt>
          <dd className="tabular text-[14px] leading-5 text-muted tablet:truncate">{guidance.jp}</dd>
        </div>
      </dl>
    </section>
  )
}
