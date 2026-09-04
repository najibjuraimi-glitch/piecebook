import { useMemo } from 'react'
import { compareCardNumbers, getCard, type Card } from '../data/seed'
import { useCollection, type CostBasis } from '../store/collection'
import { Screen, ScreenTitle } from '../components/Screen'
import { CardCell, CardGrid } from '../components/CardCell'
import { EmptyState } from '../components/EmptyState'
import { formatMoney, pluralCards } from '../lib/format'

interface OwnedCard {
  card: Card
  qty: number
  ownedAt: string
  cost?: CostBasis
}

export function CollectionScreen() {
  const { owned } = useCollection()

  const items = useMemo<OwnedCard[]>(() => {
    const list: OwnedCard[] = []
    for (const [cardNumber, entry] of Object.entries(owned)) {
      const card = getCard(cardNumber)
      if (card) list.push({ card, qty: entry.qty, ownedAt: entry.ownedAt, cost: entry.cost })
    }
    return list.sort((a, b) => {
      if (a.ownedAt !== b.ownedAt) return b.ownedAt.localeCompare(a.ownedAt)
      if (a.card.setCode !== b.card.setCode) return a.card.setCode.localeCompare(b.card.setCode)
      return compareCardNumbers(a.card.cardNumber, b.card.cardNumber)
    })
  }, [owned])

  return (
    <Screen>
      <ScreenTitle title="Collection" subline={pluralCards(items.length)} />
      {items.length === 0 ? (
        <EmptyState message="No owned cards yet." ctaLabel="Browse sets" ctaTo="/" />
      ) : (
        <CardGrid>
          {items.map(({ card, qty, cost }) => (
            <li key={card.cardNumber}>
              {/* Paid line only when a cost exists; cells without one stay as they are. No nag. */}
              <CardCell card={card} owned qty={qty} paid={cost ? formatMoney(cost.amount, cost.currency) : undefined} />
            </li>
          ))}
        </CardGrid>
      )}
    </Screen>
  )
}
