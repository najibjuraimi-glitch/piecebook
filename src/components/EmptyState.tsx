import { Link } from 'react-router-dom'

interface Props {
  message: string
  ctaLabel?: string
  ctaTo?: string
}

/** Short sentence + one quiet CTA. Ghost, not accent: the accent is reserved for Mark owned. */
export function EmptyState({ message, ctaLabel, ctaTo }: Props) {
  return (
    <div className="flex flex-col items-center gap-5 px-4 pb-12 pt-16 text-center">
      <p className="max-w-[280px] text-body text-muted">{message}</p>
      {ctaLabel && ctaTo && (
        <Link
          to={ctaTo}
          className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-line bg-transparent px-6 text-body font-semibold text-ink transition-colors duration-150 ease-out hover:bg-white active:bg-[#F0ECE4]"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
