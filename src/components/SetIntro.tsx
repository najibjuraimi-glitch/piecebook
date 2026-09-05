import { Fragment } from 'react'
import type { SetIntro as SetIntroData } from '../data/intros'
import { formatDate } from '../lib/format'

interface Props {
  intro: SetIntroData
}

interface Part {
  text: string
  strong?: boolean
}

/**
 * Short "About this set" block under the BoxCard: Cards' one-line theme,
 * then EN / JP release dates, then Bandai's card-type count.
 * Every line is optional and disappears when the seed does not carry it;
 * nothing is inferred.
 */
export function SetIntro({ intro }: Props) {
  const dates: Part[] = []
  if (intro.enReleased) dates.push({ text: 'EN', strong: true }, { text: formatDate(intro.enReleased) })
  if (intro.jpReleased) dates.push({ text: 'JP', strong: true }, { text: formatDate(intro.jpReleased) })

  // Packs per box and cards per pack are box facts and live on the BoxCard above.
  const packs: Part[] = []
  if (intro.cardTypes) packs.push({ text: `${intro.cardTypes} card types` })

  return (
    <section aria-label="About this set" className="mt-5 px-1">
      <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">About this set</p>
      {intro.introTheme && <p className="mt-1.5 max-w-[60ch] text-body text-ink">{intro.introTheme}</p>}
      {dates.length > 0 && <MetaLine parts={dates} />}
      {packs.length > 0 && <MetaLine parts={packs} />}
    </section>
  )
}

function MetaLine({ parts }: { parts: Part[] }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-meta text-muted">
      {parts.map((part, i) => (
        <Fragment key={`${part.text}-${i}`}>
          {i > 0 && <span aria-hidden="true">·</span>}
          <span className={part.strong ? 'font-semibold text-ink' : 'tabular'}>{part.text}</span>
        </Fragment>
      ))}
    </p>
  )
}
