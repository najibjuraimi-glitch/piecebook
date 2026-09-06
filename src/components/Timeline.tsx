import { Fragment, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getSet } from '../data/seed'
import { useCollection } from '../store/collection'
import { dateClauses, groupByYear, timelineRows, type TimelineRow } from '../lib/timeline'
import { countdownPhrase } from '../lib/fandom'
import { todayIso } from '../lib/format'
import { OnThisDay } from './OnThisDay'

/**
 * The release timeline (7.2): every booster, extra booster and premium booster
 * in English release order, under year rules, with a hairline Today rule
 * between what is out and what is coming, with On This Day birthdays under
 * the rule (7.9). Each row is one link to the set:
 * code and name, `12 of 154` at the right edge only where the collector has
 * started the set, both dates in ink with the gap between them (or
 * `US date 30 Oct 2026 · in 54 days` where the day is TCGplayer's), the JP
 * title beneath. No prices, no stories; those live on the set page.
 */
export function Timeline({ className = '' }: { className?: string }) {
  const rows = useMemo(() => timelineRows(), [])
  const years = useMemo(() => groupByYear(rows), [rows])
  const firstUpcoming = rows.find((r) => r.upcoming)

  return (
    // One column of rows reads best at a paragraph's width, so it does not stretch with the tile grid on wide screens.
    <div className={`tablet:max-w-[640px] ${className}`}>
      <nav aria-label="Jump to a year" className="flex flex-wrap items-center gap-x-1">
        {years.map((y) => (
          <a
            key={y.year}
            href={`#year-${y.year}`}
            className="flex h-11 items-center rounded-full"
          >
            <span className="tabular flex h-8 items-center rounded-full border border-line px-2.5 text-[13px] font-medium text-muted transition-colors duration-150 ease-out hover:bg-white hover:text-ink">
              {y.year}
            </span>
          </a>
        ))}
      </nav>

      <div className="mt-3">
        {years.map((y) => {
          // The Today rule sits between the last released row and the first upcoming one, wherever that falls.
          const released = y.rows.filter((r) => !r.upcoming)
          const coming = y.rows.filter((r) => r.upcoming)
          const todayHere = coming[0] === firstUpcoming
          return (
            <section key={y.year} aria-labelledby={`year-${y.year}`}>
              {todayHere && released.length === 0 && <TodayRule />}
              <YearRule year={y.year} />
              <RowList rows={released} firstUpcoming={firstUpcoming} />
              {todayHere && released.length > 0 && <TodayRule />}
              <RowList rows={coming} firstUpcoming={firstUpcoming} />
            </section>
          )
        })}
      </div>
    </div>
  )
}

function RowList({ rows, firstUpcoming }: { rows: TimelineRow[]; firstUpcoming: TimelineRow | undefined }) {
  if (rows.length === 0) return null
  return (
    <ol className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.set.setCode} id={row === firstUpcoming ? 'coming-soon' : undefined} className="scroll-mt-4">
          <Row row={row} />
        </li>
      ))}
    </ol>
  )
}

/** A year as a heading on a hairline. */
function YearRule({ year }: { year: string }) {
  return (
    <h2 id={`year-${year}`} className="tabular flex items-center gap-3 pb-1 pt-6 text-meta font-semibold text-ink scroll-mt-4 first:pt-2">
      {year}
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </h2>
  )
}

/** The hairline between released and upcoming sets, named so the eye knows which side it is on. */
function TodayRule() {
  return (
    <div className="py-3">
      <div role="separator" aria-label="Today" className="flex items-center gap-3 text-meta font-semibold text-ink">
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
        Today
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>
      <OnThisDay iso={todayIso()} className="mt-3" />
    </div>
  )
}

function Row({ row }: { row: TimelineRow }) {
  const { isOwned } = useCollection()
  const catalog = row.set.cardSeedStatus === 'ready' ? getSet(row.set.setCode) : undefined
  const owned = catalog ? catalog.cards.filter((c) => isOwned(c.cardNumber)).length : 0
  const clauses = dateClauses(row)
  if (row.upcoming) {
    const count = countdownPhrase(row.enReleased, todayIso(), { namedDay: !row.usDate })
    if (count) clauses.push(count)
  }
  return (
    <Link
      to={`/sets/${encodeURIComponent(row.set.setCode)}`}
      className="-mx-1 block min-h-[44px] rounded-lg px-1 py-3 transition-colors duration-150 ease-out hover:bg-white active:bg-white"
    >
      <p className="flex items-baseline justify-between gap-3 text-[15px] font-medium leading-5 text-ink">
        <span className="min-w-0">
          {row.code && <span className="tabular">{row.code} · </span>}
          {row.name}
        </span>
        {/* Only where the set has been started: the personal fact, quietly, at the edge. */}
        {owned > 0 && catalog && (
          <span className="tabular shrink-0 text-meta font-normal text-muted">
            {owned} of {catalog.cards.length}
          </span>
        )}
      </p>
      {clauses.length > 0 && (
        <p className="tabular mt-0.5 text-meta text-ink">
          {clauses.map((c, i) => (
            <Fragment key={c}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <span className="whitespace-nowrap">{c}</span>
            </Fragment>
          ))}
        </p>
      )}
      {row.jpName && (
        <p lang="ja" className="mt-0.5 text-meta text-muted">
          {row.jpName}
        </p>
      )}
    </Link>
  )
}
