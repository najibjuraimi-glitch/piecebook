import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { bucketByRarity, getSet } from '../data/seed'
import { getSealedGuidance, getSealedProduct } from '../data/sealed'
import { useCollection } from '../store/collection'
import { BackBar, BLEED, Screen } from '../components/Screen'
import { SealedStrip } from '../components/SealedStrip'
import { RarityTabs } from '../components/RarityTabs'
import { CardCell, CardGrid } from '../components/CardCell'
import { NotFoundScreen } from './NotFound'

export function SetDetailScreen() {
  const { setCode } = useParams()
  const set = getSet(setCode)
  const [params, setParams] = useSearchParams()
  const { isOwned, ownedQty } = useCollection()

  const buckets = useMemo(() => (set ? bucketByRarity(set.cards) : []), [set])

  if (!set) return <NotFoundScreen message="That set isn’t in the seed." />

  const requested = params.get('rarity')
  const active = buckets.find((b) => b.key === requested)?.key ?? buckets[0]?.key ?? ''
  const activeBucket = buckets.find((b) => b.key === active)

  const sealed = getSealedGuidance(set.setCode)
  const sealedProduct = getSealedProduct(set.setCode, set.cards[0]?.language ?? 'EN')

  return (
    <Screen>
      <BackBar title={set.setCode} subline={set.setName} fallbackTo="/" />

      {sealed && <SealedStrip guidance={sealed} product={sealedProduct} />}

      <div className={`sticky top-0 z-20 mt-3 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85 ${BLEED}`}>
        <RarityTabs
          buckets={buckets}
          active={active}
          onChange={(key) => setParams({ rarity: key }, { replace: true })}
        />
      </div>

      {!activeBucket || activeBucket.cards.length === 0 ? (
        <p className="px-1 pt-10 text-center text-body text-muted">No cards in this rarity.</p>
      ) : (
        <CardGrid className="pt-2">
          {activeBucket.cards.map((card) => (
            <li key={card.cardNumber}>
              <CardCell card={card} owned={isOwned(card.cardNumber)} qty={ownedQty(card.cardNumber)} />
            </li>
          ))}
        </CardGrid>
      )}
    </Screen>
  )
}
