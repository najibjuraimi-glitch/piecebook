import { Link, useNavigate } from 'react-router-dom'
import { getCard } from '../data/seed'
import { useAllAttributes } from '../data/attributes'
import { useDecks } from '../store/decks'
import { checkDeck, DECK_SIZE } from '../lib/deck'
import { Screen, ScreenTitle } from '../components/Screen'
import { CardArt } from '../components/CardArt'
import { ChevronRight } from '../components/SetTile'
import { PrimaryButton } from '../components/Buttons'

/**
 * Decks home: every deck the player has built, newest first, as quiet rows —
 * leader art, name, then colour · count · legality in words. One primary
 * action, New deck. Local-only, like the collection.
 */
export function DecksScreen() {
  const { decks, createDeck } = useDecks()
  const attrs = useAllAttributes()
  const navigate = useNavigate()
  const start = () => navigate(`/decks/${createDeck()}`)

  return (
    <Screen>
      <ScreenTitle title="Decks" subline={decks.length === 0 ? 'Build a leader and fifty cards' : `${decks.length} ${decks.length === 1 ? 'deck' : 'decks'}`} />

      {decks.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-5 py-8 text-center tablet:py-10">
          <p className="text-title text-ink">No decks yet</p>
          <p className="mx-auto mt-2 max-w-[36ch] text-body text-muted">Pick a leader or paste a list, add fifty cards, and see what you already own.</p>
          <PrimaryButton className="mx-auto mt-6 max-w-[280px]" onClick={start}>
            New deck
          </PrimaryButton>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {decks.map((deck) => {
              const leader = deck.leader ? getCard(deck.leader) : undefined
              const check = checkDeck(deck, attrs)
              const meta = [
                check.colours.length ? check.colours.join(' / ') : leader ? null : 'No leader',
                `${check.count} of ${DECK_SIZE}`,
              ].filter(Boolean)
              return (
                <li key={deck.id}>
                  <Link
                    to={`/decks/${deck.id}`}
                    className="flex min-h-[72px] items-center gap-3 px-3 py-3 transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
                  >
                    <div className="w-12 shrink-0">
                      {leader ? (
                        <CardArt card={leader} className="rounded-md" />
                      ) : (
                        <div className="flex aspect-[5/7] items-center justify-center rounded-md bg-[#EFEBE3] text-[11px] font-medium text-muted">—</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium leading-5 text-ink">{deck.name}</p>
                      <p className="tabular truncate text-meta text-muted">{meta.join(' · ')}</p>
                    </div>
                    <ChevronRight />
                  </Link>
                </li>
              )
            })}
          </ul>
          <PrimaryButton className="mt-6 tablet:max-w-[280px]" onClick={start}>
            New deck
          </PrimaryButton>
        </>
      )}
    </Screen>
  )
}
