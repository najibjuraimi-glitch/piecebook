import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ALL_TAB, getSet, rarityTabs, type CardSet } from '../data/seed'
import { getRosterSet, rosterSealedProduct, type RosterSet } from '../data/roster'
import { getSealedGuidance, getSealedProduct } from '../data/sealed'
import { getSetIntro, hasIntroContent, type SetIntro as SetIntroData } from '../data/intros'
import { DEFAULT_SORT, matchesSearch, parseSort, sortCards, type SortKey } from '../lib/query'
import { useCollection } from '../store/collection'
import { BackBar, BLEED, Screen } from '../components/Screen'
import { SealedStrip } from '../components/SealedStrip'
import { SetIntro } from '../components/SetIntro'
import { SearchField } from '../components/SearchField'
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
  if (roster) return <PendingSetDetail roster={roster} />
  return <NotFoundScreen title="Set not found" message="That set isn’t on the roster." />
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

  return (
    <Screen>
      <BackBar title={roster.setCode} subline={roster.setName} fallbackTo="/" />

      <SealedStrip guidance={guidance} product={product} />

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
  const [query, setQuery] = useState('')

  const tabs = useMemo(() => rarityTabs(set.cards), [set])

  const requested = params.get('rarity')
  const active = tabs.find((t) => t.key === requested)?.key ?? ALL_TAB
  const sort = parseSort(params.get('sort'))

  // Search ∩ rarity ∩ sort. Search runs over the whole set so the count under
  // the sort select reflects what the grid actually shows for the active tab.
  const visible = useMemo(() => {
    const bucket = tabs.find((t) => t.key === active)
    if (!bucket) return []
    return sortCards(bucket.cards.filter((c) => matchesSearch(c, query)), sort)
  }, [tabs, active, query, sort])

  const update = (patch: { rarity?: string; sort?: SortKey }) => {
    const next = new URLSearchParams(params)
    if (patch.rarity !== undefined) {
      if (patch.rarity === ALL_TAB) next.delete('rarity')
      else next.set('rarity', patch.rarity)
    }
    if (patch.sort !== undefined) {
      if (patch.sort === DEFAULT_SORT) next.delete('sort')
      else next.set('sort', patch.sort)
    }
    setParams(next, { replace: true })
  }

  const language = set.cards[0]?.language ?? 'EN'
  const roster = getRosterSet(set.setCode)
  const sealed = getSealedGuidance(set.setCode)
  // Box price: Cards' sealed-seed row when present, else the roster's US market row.
  const sealedProduct = getSealedProduct(set.setCode, language) ?? (roster ? rosterSealedProduct(roster) : undefined)
  const intro = introFor(roster, set.setCode, language)

  return (
    <Screen>
      <BackBar title={set.setCode} subline={set.setName} fallbackTo="/" />

      <SealedStrip guidance={sealed} product={sealedProduct} />

      {intro && <SetIntro intro={intro} />}

      <SearchField value={query} onChange={setQuery} className="mt-5 tablet:max-w-[560px]" />

      <SortControls sort={sort} onChange={(s) => update({ sort: s })} count={visible.length} className="mt-3 px-1" />

      <div className={`sticky top-0 z-20 mt-1 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85 ${BLEED}`}>
        <RarityTabs buckets={tabs} active={active} onChange={(key) => update({ rarity: key })} />
      </div>

      {visible.length === 0 ? (
        <p className="px-1 pt-10 text-center text-body text-muted">No cards match.</p>
      ) : (
        <CardGrid className="pt-2">
          {visible.map((card) => (
            <li key={card.cardNumber}>
              <CardCell card={card} owned={isOwned(card.cardNumber)} qty={ownedQty(card.cardNumber)} />
            </li>
          ))}
        </CardGrid>
      )}
    </Screen>
  )
}
