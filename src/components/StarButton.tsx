interface Props {
  active: boolean
  onToggle: () => void
  /** What is being watched, for the accessible label: "card", "set" or "character". */
  subject: 'card' | 'set' | 'character'
  className?: string
}

/**
 * Quiet 44px toggle for the watchlist. Outline star when off, filled ink when
 * on. Ink only, never the accent: watching is a secondary action, not a CTA.
 */
export function StarButton({ active, onToggle, subject, className = '' }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? `Stop watching this ${subject}` : `Watch this ${subject}`}
      title={active ? 'Watching' : 'Watch'}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-out hover:bg-white active:bg-[#F0ECE4] ${className}`}
    >
      <StarIcon filled={active} className="h-6 w-6" />
    </button>
  )
}

export function StarIcon({ filled, className = 'h-4 w-4' }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8L12 3.6z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}
