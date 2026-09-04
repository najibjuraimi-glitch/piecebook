import type { SealedGuidance, SealedProduct } from '../data/sealed'
import { SealedPrice } from './SealedPrice'

interface Props {
  guidance: SealedGuidance
  /** Cards' seeded EN booster box; the price row is omitted when absent. */
  product?: SealedProduct
}

export function SealedStrip({ guidance, product }: Props) {
  return (
    <section
      aria-label="Sealed"
      className="rounded-2xl border border-line bg-surface px-4 py-3 tablet:grid tablet:grid-cols-[auto_minmax(0,1fr)] tablet:items-baseline tablet:gap-x-6 tablet:px-5"
    >
      <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Sealed</p>
      {/* Stacked EN/JP on phone; one full-width line from tablet up. */}
      <dl className="mt-1.5 space-y-1 tablet:mt-0 tablet:flex tablet:min-w-0 tablet:flex-wrap tablet:gap-x-8 tablet:gap-y-1 tablet:space-y-0">
        <div className="flex gap-3 tablet:min-w-0">
          <dt className="w-6 shrink-0 text-[14px] font-semibold leading-5 text-ink">EN</dt>
          <dd className="tabular text-[14px] leading-5 text-ink tablet:truncate">{guidance.en}</dd>
        </div>
        <div className="flex gap-3 tablet:min-w-0">
          <dt className="w-6 shrink-0 text-[14px] font-semibold leading-5 text-ink">JP</dt>
          <dd className="tabular text-[14px] leading-5 text-muted tablet:truncate">{guidance.jp}</dd>
        </div>
      </dl>
      {product && (
        <SealedPrice
          product={product}
          className="mt-2.5 border-t border-line pt-2.5 tablet:col-start-2 tablet:mt-2 tablet:pt-2"
        />
      )}
    </section>
  )
}
