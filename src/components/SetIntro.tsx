import { Fragment } from 'react'
import type { SetIntro as SetIntroData } from '../data/intros'
import { formatDate } from '../lib/format'

interface Props {
  intro: SetIntroData
  /** Prints in the seeded checklist (base cards and their alternate arts); omitted on deck pages, where the header already counts them. */
  prints?: number
  className?: string
}

interface Part {
  text: string
  strong?: boolean
}

/**
 * The set, in words, directly under its name (7.1): the story line in ink with
 * no eyebrow, then the release dates JP first and EN second, then Bandai's card
 * count against the prints we hold (`121 cards · 154 prints with alternate
 * arts`). Every line is optional and disappears when the seed does not carry
 * it; nothing is inferred. Story lines live on the set page only.
 */
export function SetIntro({ intro, prints, className = '' }: Props) {
  const dates: Part[] = []
  if (intro.jpReleased) dates.push({ text: 'JP', strong: true }, { text: formatDate(intro.jpReleased) })
  if (intro.enReleased) dates.push({ text: 'EN', strong: true }, { text: formatDate(intro.enReleased) })

  // Bandai's "card types" figure as printed (`126+1`), then the prints in the seed. Packs per box
  // and cards per pack are box facts and live on the BoxCard.
  const counts: Part[] = []
  if (intro.cardTypes) counts.push({ text: `${intro.cardTypes} cards` })
  if (prints) counts.push({ text: `${prints} prints with alternate arts` })

  if (!intro.introTheme && dates.length === 0 && counts.length === 0) return null

  return (
    <section aria-label="About this set" className={`px-1 ${className}`}>
      {intro.introTheme && <p className="max-w-[60ch] text-body text-ink">{intro.introTheme}</p>}
      {dates.length > 0 && <MetaLine parts={dates} ink className={intro.introTheme ? 'mt-2' : ''} />}
      {counts.length > 0 && <MetaLine parts={counts} className="mt-0.5" />}
    </section>
  )
}

/** Dates qualify the set, so they read in ink; the counts are secondary and stay muted. */
function MetaLine({ parts, ink = false, className = '' }: { parts: Part[]; ink?: boolean; className?: string }) {
  return (
    <p className={`tabular flex flex-wrap items-baseline gap-x-2 text-meta ${ink ? 'text-ink' : 'text-muted'} ${className}`}>
      {parts.map((part, i) => (
        <Fragment key={`${part.text}-${i}`}>
          {/* A dot between clauses, never between a label and its own date. */}
          {i > 0 && (part.strong || !parts[i - 1].strong) && <span aria-hidden="true">·</span>}
          <span className={part.strong ? 'font-semibold' : ''}>{part.text}</span>
        </Fragment>
      ))}
    </p>
  )
}
