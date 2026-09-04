import type { RarityBucket } from '../data/seed'
import { BLEED } from './Screen'

interface Props {
  buckets: RarityBucket[]
  active: string
  onChange: (key: string) => void
}

export function RarityTabs({ buckets, active, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Rarity"
      className={`no-scrollbar flex gap-2 overflow-x-auto py-3 ${BLEED}`}
    >
      {buckets.map((b) => {
        const selected = b.key === active
        return (
          <button
            key={b.key}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(b.key)}
            className={`tabular h-9 shrink-0 rounded-full px-4 text-[14px] font-medium transition-colors duration-150 ease-out ${
              selected ? 'bg-ink text-paper' : 'border border-line bg-transparent text-ink hover:bg-white'
            }`}
          >
            {b.label}
          </button>
        )
      })}
    </div>
  )
}
