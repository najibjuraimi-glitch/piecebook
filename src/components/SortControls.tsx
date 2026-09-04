import { useId } from 'react'
import { SORT_OPTIONS, type SortKey } from '../lib/query'
import { pluralCards } from '../lib/format'

interface Props {
  sort: SortKey
  onChange: (sort: SortKey) => void
  /** Cards currently shown after search and rarity filtering. */
  count: number
  className?: string
}

/** One quiet row: native sort select on the left, "{n} cards" on the right. */
export function SortControls({ sort, onChange, count, className = '' }: Props) {
  const id = useId()
  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      <div className="relative min-w-0">
        <label htmlFor={id} className="sr-only">
          Sort
        </label>
        <select
          id={id}
          value={sort}
          onChange={(e) => onChange(e.target.value as SortKey)}
          className="h-9 max-w-full appearance-none rounded-full border border-line bg-transparent pl-3.5 pr-8 text-[14px] font-medium text-ink transition-colors duration-150 ease-out hover:bg-white focus:border-ink focus:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
        >
          <path d="M4 6.5l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="tabular shrink-0 text-meta text-muted" aria-live="polite">
        {pluralCards(count)}
      </p>
    </div>
  )
}
