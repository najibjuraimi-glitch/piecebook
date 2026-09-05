import React, { useEffect, useMemo, useState } from 'react'
import { loadAllAttributes, type CardAttributes } from '../data/attributes'
import {
  addFacet,
  CATEGORIES,
  COLOURS,
  COSTS,
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

/**
 * The facet row under a search field (2.3). The query is the only state: a chip
 * tapped on appends its word, tapped off cuts the word out, and a word typed by
 * hand lights the same chip. Colours and types, then Cost (a second row of
 * numbers), Trait (a search-as-you-type list), any typed keyword or trait as a
 * lit chip, then Owned. Nothing shows until the field has text.
 */
export function FacetChips({ query, onChange, attrs, className = '' }: Props) {
  const traits = useMemo(() => traitList(attrs), [attrs])
  const parsed = useMemo(() => parseQuery(query, traits), [query, traits])
  const [costOpen, setCostOpen] = useState(false)
  const [traitOpen, setTraitOpen] = useState(false)

  if (!query.trim()) return null

  const toggle = (facet: Facet) => onChange(toggleFacet(parsed, facet))
  const costOn = parsed.cost !== null
  const costRow = costOpen || costOn

  // Keywords and traits have no fixed chip; the ones read from the query light up here.
  const extras: Facet[] = []
  for (const h of parsed.hits) {
    if ((h.facet.kind === 'keyword' || h.facet.kind === 'trait') && !extras.some((f) => sameFacet(f, h.facet))) extras.push(h.facet)
  }

  return (
    <div className={className}>
      <div
        role="group"
        aria-label="Narrow the search"
        className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-0.5 tablet:mx-0 tablet:flex-wrap tablet:overflow-visible tablet:px-0"
      >
        {COLOURS.map((c) => (
          <Chip key={c} on={hasFacet(parsed, { kind: 'colour', value: c })} onClick={() => toggle({ kind: 'colour', value: c })}>
            {c}
          </Chip>
        ))}
        <Divider />
        {CATEGORIES.map((c) => (
          <Chip key={c} on={hasFacet(parsed, { kind: 'category', value: c })} onClick={() => toggle({ kind: 'category', value: c })}>
            {c}
          </Chip>
        ))}
        <Divider />
        <Chip
          on={costOn}
          expanded={costRow}
          onClick={() => {
            if (costOn) {
              onChange(removeFacet(parsed, { kind: 'cost', value: parsed.cost as number }))
              setCostOpen(false)
            } else setCostOpen((v) => !v)
          }}
        >
          {costOn ? `Cost ${parsed.cost}` : 'Cost'}
        </Chip>
        <Chip on={false} expanded={traitOpen} onClick={() => setTraitOpen((v) => !v)}>
          Trait
        </Chip>
        {extras.map((f) => (
          <Chip key={`${f.kind}-${facetLabel(f)}`} on onClick={() => onChange(removeFacet(parsed, f))}>
            {facetLabel(f)}
          </Chip>
        ))}
        <Divider />
        <Chip on={parsed.owned} onClick={() => toggle({ kind: 'owned' })}>
          Owned
        </Chip>
      </div>

      {costRow && (
        <div role="group" aria-label="Cost" className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-0.5 tablet:mx-0 tablet:flex-wrap tablet:overflow-visible tablet:px-0">
          {COSTS.map((n) => (
            <Chip key={n} small on={parsed.cost === n} onClick={() => toggle({ kind: 'cost', value: n })}>
              {n}
            </Chip>
          ))}
        </div>
      )}

      {traitOpen && (
        <TraitPicker
          traits={traits}
          parsed={parsed}
          loading={!attrs}
          onPick={(t) => {
            onChange(addFacet(parsed, { kind: 'trait', value: t }))
            setTraitOpen(false)
          }}
          onClose={() => setTraitOpen(false)}
        />
      )}
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
          small ? 'tabular h-8 min-w-[2.25rem] justify-center px-2.5 text-[13px]' : 'h-8 px-3 text-[13px]'
        } ${on ? 'border-ink bg-ink text-white' : 'border-line bg-transparent text-muted hover:bg-white hover:text-ink'}`}
      >
        {children}
        {expanded !== undefined && (
          <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} fill="none" aria-hidden="true">
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  )
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-line" />
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
    <div className="mt-2 rounded-2xl border border-line bg-surface p-2 tablet:max-w-[560px]">
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
