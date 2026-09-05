import type { CardAttributes } from '../data/attributes'

/**
 * What the card does, as printed: category · colour · cost or life · power ·
 * counter · attribute on one line, traits beneath, then the effect and any
 * trigger text, then regulation block and legality. Every part is omitted when
 * the data has nothing for it; nothing is worded by us except the legality line.
 */
export function PlayBlock({ attrs, className = '' }: { attrs: CardAttributes; className?: string }) {
  const stats = statsLine(attrs)
  const traits = attrs.types.join(' / ')
  const legality = legalityLine(attrs)
  if (!stats.length && !traits && !attrs.effect && !attrs.trigger && !legality) return null

  return (
    <section className={`rounded-2xl border border-line bg-surface px-5 py-4 ${className}`} aria-label="Play">
      <p className="text-meta font-medium text-muted">Play</p>

      {stats.length > 0 && (
        <p className="tabular mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-body font-medium text-ink">
          {stats.map((s, i) => (
            <span key={s} className="flex items-baseline gap-x-2">
              {i > 0 && (
                <span aria-hidden="true" className="font-normal text-muted">
                  ·
                </span>
              )}
              {s}
            </span>
          ))}
        </p>
      )}

      {traits && <p className="mt-0.5 text-meta text-muted">{traits}</p>}

      {(attrs.effect || attrs.trigger) && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {attrs.effect && <p className="text-body text-ink">{withKeywords(attrs.effect)}</p>}
          {attrs.trigger && <p className="text-body text-ink">{withKeywords(attrs.trigger)}</p>}
        </div>
      )}

      {legality && <p className={`tabular text-meta text-muted ${attrs.effect || attrs.trigger ? 'mt-3' : 'mt-2'}`}>{legality}</p>}
    </section>
  )
}

function statsLine(a: CardAttributes): string[] {
  const parts: (string | null)[] = [
    a.category || null,
    a.color || null,
    a.life !== null ? `Life ${a.life}` : null,
    a.cost !== null ? `Cost ${a.cost}` : null,
    a.power !== null ? `Power ${a.power}` : null,
    a.counter !== null ? `Counter +${a.counter}` : null,
    a.attribute || null,
  ]
  return parts.filter((p): p is string => p !== null)
}

/** "Block 3 · Legal in Standard and Extra", only from what Limitless publishes. */
function legalityLine(a: CardAttributes): string | null {
  const parts: string[] = []
  if (a.block !== null) parts.push(`Block ${a.block}`)
  if (a.standard === 'legal' && a.extra === 'legal') parts.push('Legal in Standard and Extra')
  else if (a.standard === 'legal') parts.push('Legal in Standard')
  else if (a.standard === 'not legal' && a.extra === 'legal') parts.push('Not legal in Standard · Legal in Extra')
  else if (a.standard === 'not legal') parts.push('Not legal in Standard')
  else if (a.extra === 'legal') parts.push('Legal in Extra')
  return parts.length ? parts.join(' · ') : null
}

/** Bracketed keywords as printed ([On Play], [DON!! x1], [Blocker]) get a little weight so the text scans; the words are unchanged. */
function withKeywords(text: string) {
  return text.split(/(\[[^\]]+\])/g).map((part, i) =>
    /^\[[^\]]+\]$/.test(part) ? (
      <span key={i} className="font-medium">
        {part}
      </span>
    ) : (
      part
    ),
  )
}
