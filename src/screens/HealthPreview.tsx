import { Link } from 'react-router-dom'
import { HEALTH } from '../data/health'
import { formatDate } from '../lib/format'
import { BackBar, Screen } from '../components/Screen'

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/**
 * 9.1 draft: one screen of data health, in words. Written from seed:check
 * and the dated caches. No percent badges, no invented counts.
 */
export function HealthPreviewScreen() {
  const h = HEALTH
  const boxAge = daysBetween(h.boxFeed.newest, h.asOf)
  const boxAgeWords =
    boxAge === 0 ? 'today' : boxAge === 1 ? '1 day old' : `${boxAge} days old`

  return (
    <Screen>
      <BackBar fallbackTo="/" crumbs={[{ label: 'Sets', to: '/' }, { label: 'Data health' }]} />

      <h1 className="text-display text-ink">Data health</h1>
      <p className="mt-2 max-w-[60ch] text-body text-muted">
        What the seed holds this week, as of {formatDate(h.asOf)}. Every figure is counted from the files in the
        repo. Nothing is guessed.
      </p>

      <div className="mt-8 max-w-[64ch] space-y-8">
        <Section title="The seed">
          <p>
            {h.seed.rows.toLocaleString('en-SG')} prints across {h.seed.files} files. Card prices last read{' '}
            {formatDate(h.seed.cardPricesAsOf)}.
          </p>
        </Section>

        <Section title="Box feed">
          <p>
            Newest {h.boxFeed.source} row {formatDate(h.boxFeed.newest)}, {boxAgeWords}. A warning fires after{' '}
            {h.boxFeed.staleAfterDays} silent days.
          </p>
        </Section>

        <Section title="Wiki">
          <p>
            Fetched {formatDate(h.wiki.fetchedAt)}. {h.wiki.asked} names asked, {h.wiki.mapped} mapped, {h.wiki.lines}{' '}
            lines kept, {h.wiki.births} births.
          </p>
        </Section>

        <Section title={h.unpriced.length === 1 ? 'One print has no market price' : `${h.unpriced.length} prints have no market price`}>
          <p>Those say “No market price” on the card. Piecebook does not borrow a figure from a similar print.</p>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {h.unpriced.map((p) => (
              <li key={p.cardNumber}>
                <Link
                  to={`/cards/${encodeURIComponent(p.cardNumber)}`}
                  className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-[15px] text-ink hover:bg-paper/60"
                >
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="tabular shrink-0 text-meta text-muted">
                    {p.setCode} · {p.cardNumber}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Left out on purpose">
          <ul className="list-disc space-y-1.5 pl-5">
            {h.exclusions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Section>

        <Section title="Warnings this week">
          {h.warnings.length === 0 && h.errors === 0 ? (
            <p>None. The last seed:check run finished with 0 errors and 0 warnings.</p>
          ) : (
            <ul className="list-disc space-y-1.5 pl-5">
              {h.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </Section>

        <p className="text-meta text-muted">
          Written by the same checks CI runs.{' '}
          <Link to="/about-prices" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
            How prices work
          </Link>
          .
        </p>
      </div>
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-muted">{title}</h2>
      <div className="mt-2 space-y-3 text-body text-ink">{children}</div>
    </section>
  )
}
