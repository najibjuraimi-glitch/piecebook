import { Link } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'

/**
 * Learn to play (6.7): five sentences of ours on how a game goes, then links to
 * Bandai's own rules — the manual, the overview sheet, the comprehensive rules
 * and the official channel. Linked, not copied; Bandai's words stay Bandai's.
 * Copy is a Code draft for Design.
 */
export function LearnScreen() {
  return (
    <Screen>
      <BackBar title="Learn to play" subline="Five sentences, then Bandai’s own rules" fallbackTo="/decks" />

      <section className="max-w-[60ch] space-y-4 text-body text-ink">
        <p>Two players each bring a leader and a deck of fifty cards in the leader’s colours, plus ten DON!! cards, the currency that pays for everything.</p>
        <p>
          Each turn you draw a card and gain two DON!!, then spend DON!! to play characters, events and stages or to give your leader and characters more
          power; the player who goes first skips the draw, gains one DON!! and cannot attack on their first turn.
        </p>
        <p>
          Attacks go at the opponent’s leader or their rested characters (cards turned sideways after acting); when a leader takes a hit, the defender
          moves one life card from their life pile into their hand.
        </p>
        <p>
          The defender can answer with a counter (a card’s counter value, played from hand to add power) or a blocker (a character that takes the hit
          instead), and a life card with a Trigger can fire its effect instead of going to the hand.
        </p>
        <p>You win when your opponent’s leader is hit while they have no life cards left, or the moment their deck runs out of cards.</p>
      </section>

      <section aria-label="Official rules" className="mt-8 rounded-2xl border border-line bg-surface p-4">
        <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Bandai’s rules</p>
        <ul className="mt-2 divide-y divide-line">
          {[
            { href: 'https://en.onepiece-cardgame.com/rules/', label: 'Rules page', note: 'Bandai’s site: how to play, tutorial videos and every document below' },
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
                <span aria-hidden="true" className="shrink-0 text-muted">↗</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-meta text-muted">
        Standard is the format most events use; cards from blocks that have rotated out are not legal in it, Extra allows every card. Piecebook
        shows legality as Limitless publishes it. Ready to build? <Link to="/decks" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">Decks</Link>.
      </p>
    </Screen>
  )
}
