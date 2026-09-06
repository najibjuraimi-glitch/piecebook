import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ALL_TAB, getSet, rarityTabs, type CardSet } from '../data/seed'
import { displayCode, displayName, getRosterSet, isUpcoming, releaseLine, rosterSealedProduct, type RosterSet } from '../data/roster'
import { getSealedGuidance } from '../data/sealed'
import { getSetIntro, hasIntroContent, type SetIntro as SetIntroData } from '../data/intros'
import { DEFAULT_SORT, matchesSearch, parseSort, sortCards, type SortKey } from '../lib/query'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { useDecks } from '../store/decks'
import { GhostButton } from '../components/Buttons'
import { StarButton } from '../components/StarButton'
import { BackBar, BLEED, Screen } from '../components/Screen'
import { BoxCard } from '../components/BoxCard'
import { SetIntro } from '../components/SetIntro'
import { SearchField } from '../components/SearchField'
import { FacetChips, useSearchAttributes } from '../components/FacetChips'
import { matchesFacets, parseQuery, traitList } from '../lib/search'
import { SortControls } from '../components/SortControls'
import { RarityTabs } from '../components/RarityTabs'
import { CardCell, CardGrid } from '../components/CardCell'
import { NotFoundScreen } from './NotFound'

/**
 * Three outcomes for `/sets/:setCode`: a seeded checklist (full depth from
 * PR #5), a roster set whose checklist Cards has not seeded yet (sealed notes
 * and dates only, no search / sort / rarity), or a code on neither list.
 */
export function SetDetailScreen() {
  const { setCode } = useParams()
  const set = getSet(setCode)
  const roster = getRosterSet(setCode)

  if (set) return <SeededSetDetail key={set.setCode} set={set} />
  if (roster && isUpcoming(roster)) return <UpcomingSetDetail key={roster.setCode} roster={roster} />
  if (roster) return <PendingSetDetail roster={roster} />
  return <NotFoundScreen title="Set not found" message="That set isn’t on the roster." />
}

/**
 * An upcoming booster (7.5): on the roster from TCGCSV's presale listing, not
 * yet on Limitless. The code as the title like any set (read from TCGCSV's card
 * numbers; only a code still guessed by sequence stays hidden and the name
 * leads), the name without its "Extra Booster:" prefix, `US release 20 Nov 2026
 * · TCGplayer's date`, the BoxCard with the pre-order market, one sentence about
 * the checklist, and the star. No search, no rarity tabs.
 */
function UpcomingSetDetail({ roster }: { roster: RosterSet }) {
  const product = rosterSealedProduct(roster)
  const watch = useWatchlist()
  const code = displayCode(roster)
  const name = displayName(roster)

  return (
    <Screen>
      <BackBar
        title={code ?? name}
        subline={code ? name : undefined}
        meta={releaseLine(roster) ?? undefined}
        wrapTitle={code === null}
        fallbackTo="/"
        action={<StarButton subject="set" name={name} active={watch.isWatchingSet(roster.setCode)} onToggle={() => watch.toggleSet(roster.setCode)} />}
      />

      <BoxCard set={roster} product={product} presale />

      <p className="mt-6 px-1 text-body text-muted">The checklist appears here the day Limitless, our card source, publishes it.</p>
    </Screen>
  )
}

/** Cards' intro when they wrote one; otherwise the roster's EN date alone. Nothing else is inferred. */
function introFor(roster: RosterSet | undefined, setCode: string, language: string): SetIntroData | undefined {
  const intro = getSetIntro(setCode, language)
  if (hasIntroContent(intro)) return intro
  if (!roster?.enReleased) return undefined
  return {
    setCode: roster.setCode,
    setName: roster.setName,
    language: roster.language,
    enReleased: roster.enReleased,
    jpReleased: null,
    jpName: null,
    cardTypes: null,
    packsPerBox: null,
    cardsPerPack: null,
    introTheme: null,
    sources: [],
    asOf: roster.asOf,
  }
}

function PendingSetDetail({ roster }: { roster: RosterSet }) {
  const guidance = getSealedGuidance(roster.setCode)
  const product = rosterSealedProduct(roster)
  const shownIntro = introFor(roster, roster.setCode, roster.language)
  const watch = useWatchlist()

  return (
    <Screen>
      <BackBar
        title={roster.setCode}
        subline={displayName(roster)}
        fallbackTo="/"
        action={
          <StarButton subject="set" name={displayName(roster)} active={watch.isWatchingSet(roster.setCode)} onToggle={() => watch.toggleSet(roster.setCode)} />
        }
      />

      <BoxCard set={roster} product={product} intro={shownIntro} guidance={guidance} />

      {shownIntro && <SetIntro intro={shownIntro} />}

      <section
        aria-label="Checklist"
        className="mt-6 rounded-2xl border border-line bg-surface px-5 py-8 text-center tablet:py-10"
      >
        <p className="text-title text-ink">Checklist not seeded yet</p>
        <p className="mx-auto mt-2 max-w-[36ch] text-body text-muted">
          Card list for this set is coming. Sealed notes above still apply.
        </p>
      </section>
    </Screen>
  )
}

function SeededSetDetail({ set }: { set: CardSet }) {
  const [params, setParams] = useSearchParams()
  const { isOwned, ownedQty } = useCollection()
  const watch = useWatchlist()
  // Search text lives in the URL as `?q=`, so "All 151 in OP-09" from global search
  // lands prefilled and the address stays truthful once the collector edits it.
  const query = params.get('q') ?? ''
  // The same facets as global search (2.3): typed words become chips, the rest matches names.
  const attrs = useSearchAttributes(query.trim() !== '')
  const parsed = useMemo(() => parseQuery(query, traitList(attrs)), [query, attrs])
  const loading = parsed.needsAttributes && !attrs

  const roster = getRosterSet(set.setCode)
  const isDeck = roster?.product === 'starter_deck'
  const tabs = useMemo(() => rarityTabs(set.cards, { byRarityOnly: isDeck }), [set, isDeck])

  const requested = params.get('rarity')
  const active = tabs.find((t) => t.key === requested)?.key ?? ALL_TAB
  const sort = parseSort(params.get('sort'))

  // Search ∩ rarity ∩ sort. Search runs over the whole set so the count under
  // the sort select reflects what the grid actually shows for the active tab.
  const visible = useMemo(() => {
    const bucket = tabs.find((t) => t.key === active)
    if (!bucket) return []
    const sorted = sortCards(bucket.cards.filter((c) => matchesSearch(c, parsed.text) && matchesFacets(c, parsed, attrs, isOwned)), sort)
    // On a deck page the leader leads, whatever the sort.
    return isDeck ? [...sorted.filter((c) => c.rarity === 'L'), ...sorted.filter((c) => c.rarity !== 'L')] : sorted
  }, [tabs, active, parsed, attrs, isOwned, sort, isDeck])

  const update = (patch: { rarity?: string; sort?: SortKey; q?: string }) => {
    const next = new URLSearchParams(params)
    if (patch.rarity !== undefined) {
      if (patch.rarity === ALL_TAB) next.delete('rarity')
      else next.set('rarity', patch.rarity)
    }
    if (patch.sort !== undefined) {
      if (patch.sort === DEFAULT_SORT) next.delete('sort')
      else next.set('sort', patch.sort)
    }
    if (patch.q !== undefined) {
      if (patch.q.trim()) next.set('q', patch.q)
      else next.delete('q')
    }
    setParams(next, { replace: true })
  }

  const language = set.cards[0]?.language ?? 'EN'
  const ownedInSet = set.cards.filter((c) => isOwned(c.cardNumber)).length
  const sealed = getSealedGuidance(set.setCode, language)
  const sealedProduct = roster ? rosterSealedProduct(roster) : undefined
  const intro = introFor(roster, set.setCode, language)

  return (
    <Screen>
      <BackBar
        title={set.setCode}
        subline={set.setName}
        meta={ownedInSet > 0 ? `You own ${ownedInSet} of ${set.cards.length}${isDeck ? ' different cards' : ''}` : undefined}
        fallbackTo="/"
        action={<StarButton subject="set" name={set.setName} active={watch.isWatchingSet(set.setCode)} onToggle={() => watch.toggleSet(set.setCode)} />}
      />

      {roster && <BoxCard set={roster} product={sealedProduct} intro={intro} guidance={sealed} />}
      {roster && isDeck && <StarterDeckActions set={set} roster={roster} />}

      {intro && <SetIntro intro={intro} />}

      <SearchField value={query} onChange={(q) => update({ q })} className="mt-5 tablet:max-w-[560px]" />
      <FacetChips query={query} onChange={(q) => update({ q })} attrs={attrs} className="mt-2" />
      {loading && <p className="mt-2 px-1 text-meta text-muted">Loading…</p>}

      <SortControls sort={sort} onChange={(s) => update({ sort: s })} count={visible.length} className="mt-3 px-1" />

      <div className={`sticky top-0 z-20 mt-1 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85 ${BLEED}`}>
        <RarityTabs buckets={tabs} active={active} onChange={(key) => update({ rarity: key })} />
      </div>

      {loading ? null : visible.length === 0 ? (
        <p className="px-1 pt-10 text-center text-body text-muted">No cards match.</p>
      ) : (
        <CardGrid className="pt-2">
          {visible.map((card) => (
            <li key={card.cardNumber}>
              <CardCell
                card={card}
                owned={isOwned(card.cardNumber)}
                qty={ownedQty(card.cardNumber)}
                watching={watch.isWatchingCard(card.cardNumber)}
              />
            </li>
          ))}
        </CardGrid>
      )}
    </Screen>
  )
}

/**
 * A starter deck's own actions (6.5): open it in Decks with its leader and one of
 * each card (Bandai publishes the deck's total and rarities, not copies per card,
 * so the player sets the copies from the box), mark every card in it owned, and a
 * door to Learn to play for the newcomer who just bought it.
 */
function StarterDeckActions({ set, roster }: { set: CardSet; roster: RosterSet }) {
  const { createDeck, replaceCards } = useDecks()
  const { markOwned, isOwned } = useCollection()
  const navigate = useNavigate()
  const [marked, setMarked] = useState(false)
  const leader = set.cards.find((c) => c.rarity === 'L')
  const others = [...new Set(set.cards.filter((c) => c.rarity !== 'L').map((c) => c.baseNumber))]
  const unowned = set.cards.filter((c) => !isOwned(c.cardNumber)).length

  const openInDecks = () => {
    const id = createDeck(`${roster.setCode} ${roster.setName}`)
    replaceCards(id, Object.fromEntries(others.map((n) => [n, 1])), leader ? leader.baseNumber : null)
    navigate(`/decks/${id}`)
  }
  const ownAll = () => {
    for (const c of set.cards) if (!isOwned(c.cardNumber)) markOwned(c.cardNumber)
    setMarked(true)
  }

  return (
    <section aria-label="This deck" className="mt-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        <GhostButton className="tablet:max-w-[260px]" onClick={openInDecks}>
          Open in Decks
        </GhostButton>
        <GhostButton className="tablet:max-w-[260px]" onClick={ownAll} disabled={unowned === 0}>
          {unowned === 0 ? (marked ? 'Marked all owned' : 'All owned') : 'I have this deck'}
        </GhostButton>
      </div>
      <p className="mt-2 text-meta text-muted">
        Bandai publishes the deck’s total and rarities, not how many of each card it holds, so both start with one of each: set the copies from your
        box. {set.cards.length} different cards.{' '}
        <Link to="/learn" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
          New to the game? Learn to play
        </Link>
        .
      </p>
    </section>
  )
}
