import { useRef } from 'react'

export interface ViewTab {
  id: string
  label: string
}

interface Props {
  tabs: ViewTab[]
  active: string
  onChange: (id: string) => void
  /** Names the tab list for assistive tech, e.g. "Sets view". */
  label: string
  className?: string
}

/**
 * Two (or more) text tabs that switch a view of the same screen (7.2): active in
 * ink, the rest muted, nothing else. A real tablist: arrow keys move between
 * tabs and select, Home / End jump, the active tab alone sits in the tab order.
 * The view lives in the URL, so nothing is remembered and every visitor sees
 * the same first screen.
 */
export function ViewTabs({ tabs, active, onChange, label, className = '' }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (from: number, to: number) => {
    const next = tabs[(to + tabs.length) % tabs.length]
    if (!next || next.id === tabs[from]?.id) return
    onChange(next.id)
    refs.current[(to + tabs.length) % tabs.length]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={`flex items-center ${className}`}>
      {tabs.map((tab, i) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(i, i + 1)
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(i, i - 1)
              else if (e.key === 'Home') move(i, 0)
              else if (e.key === 'End') move(i, tabs.length - 1)
              else return
              e.preventDefault()
            }}
            className={`flex h-11 items-center px-2 text-[15px] font-medium transition-colors duration-150 ease-out ${
              selected ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            <span className={`border-b-2 pb-0.5 ${selected ? 'border-ink' : 'border-transparent'}`}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
