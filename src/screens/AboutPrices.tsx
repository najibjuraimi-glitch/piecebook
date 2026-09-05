import React from 'react'
import { Link } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'

/**
 * "How prices work": provenance as a feature. Plain sentences, no marketing.
 * Copy is a Code draft for Design to sign (ClickUp 1.5); facts match
 * docs/seed-sources.md and are updated with it.
 */
export function AboutPricesScreen() {
  return (
    <Screen>
      <BackBar fallbackTo="/" crumbs={[{ label: 'Sets', to: '/' }, { label: 'How prices work' }]} />

      <h1 className="text-display text-ink">How prices work</h1>
      <p className="mt-2 max-w-[60ch] text-body text-muted">
        Every price in Piecebook is a <em>seed</em> price: a figure read on a stated date from a named source, never a live
        quote and never a guess. Where a number came from is always one line away.
      </p>

      <div className="mt-8 max-w-[64ch] space-y-8">
        <Section title="Card prices">
          <p>
            A card's <strong>Market (seed)</strong> is the TCGPlayer market price for that print as shown on Limitless, read
            once a day by our seed refresh. The <em>as of</em> date beside it is the day it was read. Prices are in US
            dollars because that is the currency of the source; Piecebook does not convert.
          </p>
          <p>
            Some prints have no price at all. Those say <strong>No seed price</strong> rather than borrow a number from a
            similar card.
          </p>
        </Section>

        <Section title="Price history">
          <p>
            The line under a card's price is drawn only from dated points. Two kinds exist and the chart says which:
            <strong> daily points</strong> read from Limitless since 4 September 2026, and <strong>weekly points</strong>
            from TCGPlayer's own price-history chart for the year before that, imported once on 5 September 2026.
          </p>
          <p>
            <em>Since</em> figures compare the newest point with the last point at least thirty days older. Range chips
            narrow the window; they never change the numbers.
          </p>
        </Section>

        <Section title="Booster box prices">
          <p>
            The US figure for every English booster box is TCGPlayer's market price, pulled once a day by the same refresh
            that prices the cards, from TCGCSV, a public daily mirror of TCGPlayer's own data. It carries the date it was
            read. Where a clean, verified Singapore asking price was found, it is shown too, with its own date. A set with
            no English box, such as EB-04, shows none.
          </p>
        </Section>

        <Section title="What Piecebook never does">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Invent a price, a card, a set name or a date to fill a gap.</li>
            <li>Convert currencies. Costs you log stay in the currency you paid.</li>
            <li>Show live quotes, sold listings or seller offers.</li>
            <li>Carry marketplace or affiliate links. No one is paid when you buy.</li>
          </ul>
        </Section>

        <Section title="Your data">
          <p>
            Owned cards, quantities, cost basis and your watchlist live only in this browser. Nothing is sent anywhere, and
            there are no accounts. Clearing site data removes them.
          </p>
        </Section>

        <p className="text-meta text-muted">
          Sources and method in detail:{' '}
          <a
            href="https://github.com/najibjuraimi-glitch/piecebook/blob/main/docs/seed-sources.md"
            className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
          >
            docs/seed-sources.md
          </a>
          . Back to <Link to="/" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">Sets</Link>.
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
