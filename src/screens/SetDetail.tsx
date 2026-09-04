import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ALL_TAB, getSet, rarityTabs } from '../data/seed'
import { getSealedGuidance, getSealedProduct } from '../data/sealed'
import { getSetIntro, hasIntroContent } from '../data/intros'
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

export function SetDetailScreen() {
  const { setCode } = useParams()
  const set = getSet(setCode)
  const [params, setParams] = useSearchParams()
  const { isOwned, ownedQty } = useCollection()
  const [query, setQuery] = useState('')

  const tabs = useMemo(() => (set ? rarityTabs(set.cards) : []), [set])

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

  if (!set) return <NotFoundScreen message="That set isn’t in the seed." />

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
  const sealed = getSealedGuidance(set.setCode)
  const sealedProduct = getSealedProduct(set.setCode, language)
  const intro = getSetIntro(set.setCode, language)

  return (
    <Screen>
      <BackBar title={set.setCode} subline={set.setName} fallbackTo="/" />

      {sealed && <SealedStrip guidance={sealed} product={sealedProduct} />}

      {hasIntroContent(intro) && <SetIntro intro={intro} />}

      <SearchField value={query} onChange={setQuery} className="mt-5" />

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
