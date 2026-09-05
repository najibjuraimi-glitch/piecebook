import { useEffect, useState } from 'react'
import type { Card } from './seed'
import { csvToObjects } from './csv'

/**
 * What a print is and does, from `data/card-attributes/{code}.csv` (written by
 * `npm run seed:refresh` from the same Limitless blocks as the seed): category,
 * colour, cost / life, power, counter, attribute, traits, effect and trigger
 * text, illustrator, regulation block and Standard / Extra legality. Text is as
 * printed; Piecebook adds nothing. Loaded lazily per set, like price history.
 */
export interface CardAttributes {
  cardNumber: string
  category: 'Leader' | 'Character' | 'Event' | 'Stage' | ''
  /** "Red", or "Red/Green" for dual-colour leaders. */
  color: string
  cost: number | null
  life: number | null
  power: number | null
  counter: number | null
  attribute: string
  /** Traits as printed, slash-separated: "Minks/Land of Wano/Whitebeard Pirates". */
  types: string[]
  effect: string
  trigger: string
  artist: string
  block: number | null
  standard: 'legal' | 'not legal' | null
  extra: 'legal' | 'not legal' | null
}

const FILES = import.meta.glob('../../data/card-attributes/*.csv', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

const cache = new Map<string, Promise<Map<string, CardAttributes>>>()

function num(v: string): number | null {
  const n = Number(v)
  return v !== '' && Number.isFinite(n) ? n : null
}

function legality(v: string): 'legal' | 'not legal' | null {
  return v === 'legal' || v === 'not legal' ? v : null
}

function loadSet(setCode: string): Promise<Map<string, CardAttributes>> {
  const hit = cache.get(setCode)
  if (hit) return hit
  const key = `/${setCode.replace(/-/g, '').toLowerCase()}.csv`
  const path = Object.keys(FILES).find((p) => p.toLowerCase().endsWith(key))
  const promise = (path ? FILES[path]() : Promise.resolve('')).then((text) => {
    const map = new Map<string, CardAttributes>()
    for (const r of csvToObjects(text)) {
      if (!r.card_number) continue
      map.set(r.card_number, {
        cardNumber: r.card_number,
        category: (['Leader', 'Character', 'Event', 'Stage'].includes(r.category) ? r.category : '') as CardAttributes['category'],
        color: r.color ?? '',
        cost: num(r.cost),
        life: num(r.life),
        power: num(r.power),
        counter: num(r.counter),
        attribute: r.attribute ?? '',
        types: r.types ? r.types.split('/').map((t) => t.trim()).filter(Boolean) : [],
        effect: r.effect ?? '',
        trigger: r.trigger ?? '',
        artist: r.artist ?? '',
        block: num(r.block),
        standard: legality(r.standard),
        extra: legality(r.extra),
      })
    }
    return map
  })
  cache.set(setCode, promise)
  return promise
}

export async function attributesFor(card: Card): Promise<CardAttributes | undefined> {
  return (await loadSet(card.setCode)).get(card.cardNumber)
}

export function useCardAttributes(card: Card): CardAttributes | undefined {
  const [state, setState] = useState<{ key: string; attrs: CardAttributes | undefined } | null>(null)
  useEffect(() => {
    let live = true
    attributesFor(card).then((attrs) => {
      if (live) setState({ key: card.cardNumber, attrs })
    })
    return () => {
      live = false
    }
  }, [card])
  return state?.key === card.cardNumber ? state.attrs : undefined
}
