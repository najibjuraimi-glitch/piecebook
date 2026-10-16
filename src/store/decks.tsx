import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { MAX_COPIES, type Deck } from '../lib/deck'
import { readRaw, subscribeUserData, writeRaw } from './userData'

/**
 * Decks live in the browser only, like the collection and the watchlist:
 * `localStorage` key `piecebook.decks.v1`, `{ decks: Deck[] }`. Card numbers
 * are base numbers (a parallel print is the same card). Synced per key like the rest.
 */
const STORAGE_KEY = 'piecebook.decks.v1'

interface DecksState {
  decks: Deck[]
}

const EMPTY: DecksState = { decks: [] }
const BASE_RE = /p\d+$/i

function cleanDeck(raw: unknown): Deck | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const d = raw as Partial<Deck>
  if (typeof d.id !== 'string' || !d.id) return undefined
  const cards: Record<string, number> = {}
  if (d.cards && typeof d.cards === 'object') {
    for (const [n, q] of Object.entries(d.cards as Record<string, unknown>)) {
      const qty = Math.floor(Number(q))
      if (n && Number.isFinite(qty) && qty > 0) cards[n.replace(BASE_RE, '')] = qty
    }
  }
  const now = new Date().toISOString()
  return {
    id: d.id,
    name: typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Untitled deck',
    leader: typeof d.leader === 'string' && d.leader ? d.leader.replace(BASE_RE, '') : null,
    cards,
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : now,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : now,
  }
}

function load(): DecksState {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = readRaw(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<DecksState>
    return { decks: Array.isArray(parsed.decks) ? parsed.decks.map(cleanDeck).filter((d): d is Deck => d !== undefined) : [] }
  } catch {
    return EMPTY
  }
}

function save(state: DecksState) {
  // Storage full or unavailable returns false; state still lives in memory for this session.
  writeRaw(STORAGE_KEY, JSON.stringify(state))
}

export interface DecksApi {
  decks: Deck[]
  getDeck: (id: string) => Deck | undefined
  createDeck: (name?: string) => string
  renameDeck: (id: string, name: string) => void
  deleteDeck: (id: string) => void
  setLeader: (id: string, cardNumber: string | null) => void
  /** Sets copies of a base card number (0 removes it; capped at four plus room to show an over-count from an import). */
  setCardQty: (id: string, cardNumber: string, qty: number) => void
  replaceCards: (id: string, cards: Record<string, number>, leader?: string | null) => void
}

const DecksContext = createContext<DecksApi | null>(null)

const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function DecksProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DecksState>(load)
  // Only a change made here is saved (and stamped for sync); a reload from the cloud or another tab is not.
  const localChange = useRef(false)
  const mutate = useCallback((fn: (s: DecksState) => DecksState) => {
    localChange.current = true
    setState(fn)
  }, [])

  useEffect(() => {
    if (!localChange.current) return
    localChange.current = false
    save(state)
  }, [state])

  useEffect(
    () =>
      subscribeUserData(STORAGE_KEY, () => {
        localChange.current = false
        setState(load())
      }),
    [],
  )

  const update = useCallback(
    (id: string, fn: (d: Deck) => Deck) => {
      mutate((s) => ({ decks: s.decks.map((d) => (d.id === id ? { ...fn(d), updatedAt: new Date().toISOString() } : d)) }))
    },
    [mutate],
  )

  const getDeck = useCallback((id: string) => state.decks.find((d) => d.id === id), [state.decks])

  const createDeck = useCallback(
    (name = 'New deck') => {
      const id = newId()
      const now = new Date().toISOString()
      mutate((s) => ({ decks: [{ id, name, leader: null, cards: {}, createdAt: now, updatedAt: now }, ...s.decks] }))
      return id
    },
    [mutate],
  )

  const renameDeck = useCallback((id: string, name: string) => update(id, (d) => ({ ...d, name: name.trim() || d.name })), [update])
  const deleteDeck = useCallback((id: string) => mutate((s) => ({ decks: s.decks.filter((d) => d.id !== id) })), [mutate])
  const setLeader = useCallback((id: string, cardNumber: string | null) => update(id, (d) => ({ ...d, leader: cardNumber ? cardNumber.replace(BASE_RE, '') : null })), [update])

  const setCardQty = useCallback(
    (id: string, cardNumber: string, qty: number) =>
      update(id, (d) => {
        const n = cardNumber.replace(BASE_RE, '')
        const cards = { ...d.cards }
        const next = Math.max(0, Math.min(Math.floor(qty), MAX_COPIES))
        if (next === 0) delete cards[n]
        else cards[n] = next
        return { ...d, cards }
      }),
    [update],
  )

  const replaceCards = useCallback(
    (id: string, cards: Record<string, number>, leader?: string | null) =>
      update(id, (d) => ({ ...d, cards, ...(leader !== undefined ? { leader } : {}) })),
    [update],
  )

  const api = useMemo<DecksApi>(
    () => ({ decks: state.decks, getDeck, createDeck, renameDeck, deleteDeck, setLeader, setCardQty, replaceCards }),
    [state.decks, getDeck, createDeck, renameDeck, deleteDeck, setLeader, setCardQty, replaceCards],
  )

  return <DecksContext.Provider value={api}>{children}</DecksContext.Provider>
}

export function useDecks(): DecksApi {
  const ctx = useContext(DecksContext)
  if (!ctx) throw new Error('useDecks must be used within DecksProvider')
  return ctx
}
