import { Link } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'

/**
 * Learn to play (6.7 / customer lenses v1): five sentences on how a game goes,
 * two labeled words newcomers brought (DON!!, life), then Bandai's own rules.
 * Linked, not copied. Starter decks are the first fifty we already list.
 */
const LINK = 'text-ink underline decoration-line underline-offset-2 hover:decoration-ink'

export function LearnScreen() {
  return (
    <Screen>
      <BackBar title="Learn to play" subline="Five sentences, then Bandai’s own rules" fallbackTo="/start" />

      <dl className="mb-8 max-w-[60ch] divide-y divide-line rounded-2xl border border-line bg-surface">
        <div className="flex min-h-[52px] items-baseline gap-4 px-4 py-3">
          <dt className="w-[4.5rem] shrink-0 text-[15px] font-medium text-ink">DON!!</dt>
          <dd className="text-body text-ink">The currency that pays for everything. You get ten of these cards.</dd>
        </div>
        <div className="flex min-h-[52px] items-baseline gap-4 px-4 py-3">
          <dt className="w-[4.5rem] shrink-0 text-[15px] font-medium text-ink">Life</dt>
          <dd className="text-body text-ink">Cards in a pile. When your leader is hit, one moves into your hand.</dd>
        </div>
      </dl>

      <section className="max-w-[60ch] space-y-4 text-body text-ink">
        <p>
          Two players each bring a leader and a deck of fifty cards in the leader’s colours, plus ten DON!! cards. The
          leader stays in play and holds your life.
        </p>
        <p>Each turn you draw a card and gain two DON!!. Spend DON!! to play characters, events and stages, or to give your leader and characters more power.</p>
        <p>The player who goes first skips the draw, gains one DON!!, and cannot attack on their first turn.</p>
        <p>
          Attacks go at the opponent’s leader or their rested characters (cards turned sideways after acting). When a
          leader takes a hit, the defender moves one life card from their life pile into their hand.
        </p>
        <p>
          The defender can answer with a counter (a card’s counter value, played from hand to add power) or a blocker (a
          character that takes the hit instead). A life card with a Trigger can fire its effect instead of going to the
          hand.
        </p>
        <p>You win when your opponent’s leader is hit while they have no life cards left, or the moment their deck runs out of cards.</p>
      </section>

      <p className="mt-6 max-w-[60ch] text-body text-ink">
        A first fifty is a starter deck Bandai already sells.{' '}
        <Link to={{ pathname: '/', hash: 'starter-decks' }} className={LINK}>
          36 starter decks
        </Link>
        .
      </p>

      <section aria-label="Official rules" className="mt-8 rounded-2xl border border-line bg-surface p-4">
        <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Bandai’s rules</p>
        <ul className="mt-2 divide-y divide-line">
          {[
            {
              href: 'https://en.onepiece-cardgame.com/beginners/how-to-play.php',
              label: 'How to play',
              note: 'Bandai’s beginners page · video, guide, shop and teaching app',
            },
            {
              href: 'https://en.onepiece-cardgame.com/rules/',
              label: 'Rules page',
              note: 'Overview, manual, comprehensive rules, tournament rules and the playsheet',
            },
            { href: 'https://en.onepiece-cardgame.com/pdf/rule_overview_sheet_en.pdf', label: 'Rule overview sheet', note: 'PDF · one page, the fastest read' },
            { href: 'https://en.onepiece-cardgame.com/pdf/rule_manual.pdf', label: 'Rule manual', note: 'PDF · the full starter rulebook' },
            { href: 'https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf', label: 'Comprehensive rules', note: 'PDF · every edge case, as judges read it' },
            { href: 'https://www.youtube.com/channel/UCT5u6XqA2oaSqxsXKp3zubw', label: 'Official channel', note: 'YouTube · Bandai’s how-to-play videos' },
          ].map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${l.label}, ${l.note}, opens in a new tab`}
                className="flex min-h-[52px] items-center justify-between gap-3 py-2.5 text-ink hover:underline"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium leading-5">{l.label}</span>
                  <span className="block text-meta text-muted">{l.note}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-muted">
                  ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-meta text-muted">
        Standard is the format most events use; cards from blocks that have rotated out are not legal in it, Extra allows every card. Piecebook
        shows legality as Limitless publishes it. Ready to build?{' '}
        <Link to="/decks" className={LINK}>
          Decks
        </Link>
        .
      </p>
    </Screen>
  )
}
