import React, { useEffect, useMemo, useState } from 'react'
import { loadAllAttributes, type CardAttributes } from '../data/attributes'
import {
  addFacet,
  CATEGORIES,
  COLOURS,
  COSTS,
  cycleOwnership,
  facetLabel,
  hasFacet,
  parseQuery,
  removeFacet,
  sameFacet,
  toggleFacet,
  traitList,
  type Facet,
  type ParsedQuery,
} from '../lib/search'

const chipKey = (f: Facet) => `${f.kind}:${facetLabel(f).toLowerCase()}`

/**
 * Every set's attributes, loaded once the search is first used (2.3: facets
 * need the whole game in memory, as the deck builder does) and kept for the
 * screen's life. Null until then.
 */
export function useSearchAttributes(enabled: boolean): Map<string, CardAttributes> | null {
  const [all, setAll] = useState<Map<string, CardAttributes> | null>(null)
  useEffect(() => {
    if (!enabled || all) return
    let live = true
    loadAllAttributes().then((m) => {
      if (live) setAll(m)
    })
    return () => {
      live = false
    }
  }, [enabled, all])
  return all
}

interface Props {
  query: string
  onChange: (query: string) => void
  attrs: Map<string, CardAttributes> | null
  className?: string
}

type Opener = 'colour' | 'category' | 'cost' | 'trait'

/**
 * The facet line under a search field (2.3). The query is the only state: a
 * value chosen appends its word, a lit chip tapped cuts the word out, and a word
 * typed by hand lights the same chip. One line, wrapping rather than scrolling:
 * first whatever is lit, in the order the query says it (colours, types, cost,
 * traits, keywords, Owned or Missing alike), then Owned when it is not, then the
 * four openers Colour, Type, Cost and Trait, each unfolding its values as a row
 * beneath. Owned cycles Owned → Missing → off. Nothing shows until the field has text.
 */
export function FacetChips({ query, onChange, attrs, className = '' }: Props) {
  const traits = useMemo(() => traitList(attrs), [attrs])
  const parsed = useMemo(() => parseQuery(query, traits), [query, traits])
  const [open, setOpen] = useState<Opener | null>(null)

  if (!query.trim()) return null

  const lit: Facet[] = []
  for (const h of parsed.hits) if (!lit.some((f) => sameFacet(f, h.facet))) lit.push(h.facet)
  const ownershipLit = parsed.owned || parsed.missing

  const choose = (facet: Facet) => {
    onChange(toggleFacet(parsed, facet))
    setOpen(null)
  }
  const unlight = (facet: Facet) => {
    if (facet.kind === 'owned' || facet.kind === 'missing') onChange(cycleOwnership(parsed))
    else onChange(removeFacet(parsed, facet))
  }
  const toggleOpen = (which: Opener) => setOpen((o) => (o === which ? null : which))

  return (
    <div className={className}>
      <div role="group" aria-label="Narrow the search" className="flex flex-wrap items-center gap-x-1">
        {lit.map((f) => (
          <Chip key={chipKey(f)} on onClick={() => unlight(f)}>
            {facetLabel(f)}
          </Chip>
        ))}
        {!ownershipLit && (
          <Chip on={false} onClick={() => onChange(cycleOwnership(parsed))}>
            Owned
          </Chip>
        )}
        <Chip on={false} expanded={open === 'colour'} onClick={() => toggleOpen('colour')}>
          Colour
        </Chip>
        <Chip on={false} expanded={open === 'category'} onClick={() => toggleOpen('category')}>
          Type
        </Chip>
        <Chip on={false} expanded={open === 'cost'} onClick={() => toggleOpen('cost')}>
          Cost
        </Chip>
        <Chip on={false} expanded={open === 'trait'} onClick={() => toggleOpen('trait')}>
          Trait
        </Chip>
      </div>

      {open === 'colour' && (
        <ValueRow label="Colour">
          {COLOURS.map((c) => (
            <Chip key={c} on={hasFacet(parsed, { kind: 'colour', value: c })} onClick={() => choose({ kind: 'colour', value: c })}>
              {c}
            </Chip>
          ))}
        </ValueRow>
      )}

      {open === 'category' && (
        <ValueRow label="Type">
          {CATEGORIES.map((c) => (
            <Chip key={c} on={hasFacet(parsed, { kind: 'category', value: c })} onClick={() => choose({ kind: 'category', value: c })}>
              {c}
            </Chip>
          ))}
        </ValueRow>
      )}

      {open === 'cost' && (
        <ValueRow label="Cost">
          {COSTS.map((n) => (
            <Chip key={n} small on={parsed.cost === n} onClick={() => choose({ kind: 'cost', value: n })}>
              {n}
            </Chip>
          ))}
        </ValueRow>
      )}

      {open === 'trait' && (
        <TraitPicker
          traits={traits}
          parsed={parsed}
          loading={!attrs}
          onPick={(t) => {
            onChange(addFacet(parsed, { kind: 'trait', value: t }))
            setOpen(null)
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

/** The values an opener unfolds, on their own line beneath; wraps, never scrolls. */
function ValueRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-x-1">
      {children}
    </div>
  )
}

/** Filled ink when on, hairline when off, as in the builder; the target is 44px tall around a 32px pill. */
function Chip({
  on,
  small = false,
  expanded,
  onClick,
  children,
}: {
  on: boolean
  small?: boolean
  expanded?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={expanded === undefined ? on : undefined}
      aria-expanded={expanded}
      onClick={onClick}
      className="flex h-11 shrink-0 items-center rounded-full"
    >
      <span
        className={`flex items-center gap-1 rounded-full border font-medium transition-colors duration-150 ease-out ${
          small ? 'tabular h-8 min-w-[2.25rem] justify-center px-2.5 text-[13px]' : 'h-8 px-2.5 text-[13px]'
        } ${on ? 'border-ink bg-ink text-white' : expanded ? 'border-ink bg-white text-ink' : 'border-line bg-transparent text-muted hover:bg-white hover:text-ink'}`}
      >
        {children}
        {expanded !== undefined && (
          <svg viewBox="0 0 12 12" className={`-mr-0.5 h-2.5 w-2.5 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} fill="none" aria-hidden="true">
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  )
}

/** The traits Limitless records, narrowed as you type; Enter takes the first, Escape closes. */
function TraitPicker({
  traits,
  parsed,
  loading,
  onPick,
  onClose,
}: {
  traits: string[]
  parsed: ParsedQuery
  loading: boolean
  onPick: (trait: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const q = text.trim().toLowerCase()
  const matches = traits.filter((t) => !parsed.traits.includes(t) && (!q || t.toLowerCase().includes(q)))

  return (
    <div className="mt-1 rounded-2xl border border-line bg-surface p-2 tablet:max-w-[560px]">
      <input
        autoFocus
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && matches[0]) {
            e.preventDefault()
            onPick(matches[0])
          }
        }}
        aria-label="Trait"
        placeholder="Type a trait, e.g. Straw Hat Crew"
        autoComplete="off"
        spellCheck={false}
        className="h-11 w-full rounded-xl border border-line bg-paper px-3 text-body text-ink placeholder:text-muted/80 focus:border-ink focus:outline-none"
      />
      {loading ? (
        <p className="px-3 py-3 text-meta text-muted">Loading…</p>
      ) : matches.length === 0 ? (
        <p className="px-3 py-3 text-meta text-muted">No trait called “{text.trim()}”.</p>
      ) : (
        <ul className="mt-1 max-h-60 divide-y divide-line overflow-y-auto">
          {matches.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => onPick(t)}
                className="flex h-11 w-full items-center px-3 text-left text-[15px] text-ink transition-colors duration-150 ease-out hover:bg-paper"
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-3 pb-1 pt-2 text-meta text-muted">{loading ? '' : `${traits.length} traits Limitless records.`}</p>
    </div>
  )
}
