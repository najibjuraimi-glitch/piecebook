import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { readRaw, subscribeUserData, writeRaw } from './userData'

/**
 * Watchlist: cards, sets and characters (card names, 7.4) the collector wants
 * to keep an eye on, independent of ownership. Local-only, like the collection,
 * under its own storage key so clearing or migrating one never touches the other.
 */
const STORAGE_KEY = 'piecebook.watchlist.v1'

interface WatchEntry {
  /** ISO timestamp when starred; newest first on the Watching list. */
  at: string
}

interface WatchlistState {
  cards: Record<string, WatchEntry>
  sets: Record<string, WatchEntry>
  /** Keyed by card name exactly as the seed spells it ("Shanks", "Kid & Killer"). */
  characters: Record<string, WatchEntry>
}

const EMPTY: WatchlistState = { cards: {}, sets: {}, characters: {} }

function cleanMap(v: unknown): Record<string, WatchEntry> {
  const out: Record<string, WatchEntry> = {}
  if (!v || typeof v !== 'object') return out
  for (const [key, entry] of Object.entries(v as Record<string, unknown>)) {
    if (!key) continue
    const at = entry && typeof entry === 'object' && typeof (entry as WatchEntry).at === 'string' ? (entry as WatchEntry).at : null
    if (at) out[key] = { at }
  }
  return out
}

function load(): WatchlistState {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = readRaw(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<WatchlistState>
    // Data stored before 7.4 has no `characters`; cleanMap turns the missing key into an empty map.
    return { cards: cleanMap(parsed.cards), sets: cleanMap(parsed.sets), characters: cleanMap(parsed.characters) }
  } catch {
    return EMPTY
  }
}

function save(state: WatchlistState) {
  // Storage full or unavailable returns false; state still lives in memory for this session.
  writeRaw(STORAGE_KEY, JSON.stringify(state))
}

export interface WatchlistApi {
  /** Card numbers, newest starred first. */
  cards: string[]
  /** Set codes, newest starred first. */
  sets: string[]
  /** Card names, newest starred first. */
  characters: string[]
  isWatchingCard: (cardNumber: string) => boolean
  isWatchingSet: (setCode: string) => boolean
  isWatchingCharacter: (name: string) => boolean
  /** ISO timestamp the card was starred, or undefined when it is not watched. */
  watchedAt: (cardNumber: string) => string | undefined
  /** ISO timestamp the set was starred, or undefined when it is not watched. */
  setWatchedAt: (setCode: string) => string | undefined
  /** ISO timestamp the character was starred, or undefined when it is not watched. */
  characterWatchedAt: (name: string) => string | undefined
  toggleCard: (cardNumber: string) => void
  toggleSet: (setCode: string) => void
  toggleCharacter: (name: string) => void
}

const WatchlistContext = createContext<WatchlistApi | null>(null)

function newestFirst(map: Record<string, WatchEntry>): string[] {
  return Object.entries(map)
    .sort((a, b) => b[1].at.localeCompare(a[1].at) || a[0].localeCompare(b[0]))
    .map(([key]) => key)
}

function toggle(map: Record<string, WatchEntry>, key: string): Record<string, WatchEntry> {
  const next = { ...map }
  if (next[key]) delete next[key]
  else next[key] = { at: new Date().toISOString() }
  return next
}

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WatchlistState>(load)
  // Only a change made here is saved (and stamped for sync); a reload from the cloud or another tab is not.
  const localChange = useRef(false)
  const mutate = useCallback((fn: (s: WatchlistState) => WatchlistState) => {
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

  const isWatchingCard = useCallback((n: string) => Boolean(state.cards[n]), [state.cards])
  const isWatchingSet = useCallback((c: string) => Boolean(state.sets[c]), [state.sets])
  const isWatchingCharacter = useCallback((name: string) => Boolean(state.characters[name]), [state.characters])
  const watchedAt = useCallback((n: string) => state.cards[n]?.at, [state.cards])
  const setWatchedAt = useCallback((c: string) => state.sets[c]?.at, [state.sets])
  const characterWatchedAt = useCallback((name: string) => state.characters[name]?.at, [state.characters])
  const toggleCard = useCallback((n: string) => mutate((s) => ({ ...s, cards: toggle(s.cards, n) })), [mutate])
  const toggleSet = useCallback((c: string) => mutate((s) => ({ ...s, sets: toggle(s.sets, c) })), [mutate])
  const toggleCharacter = useCallback((name: string) => mutate((s) => ({ ...s, characters: toggle(s.characters, name) })), [mutate])

  const api = useMemo<WatchlistApi>(
    () => ({
      cards: newestFirst(state.cards),
      sets: newestFirst(state.sets),
      characters: newestFirst(state.characters),
      isWatchingCard,
      isWatchingSet,
      isWatchingCharacter,
      watchedAt,
      setWatchedAt,
      characterWatchedAt,
      toggleCard,
      toggleSet,
      toggleCharacter,
    }),
    [state, isWatchingCard, isWatchingSet, isWatchingCharacter, watchedAt, setWatchedAt, characterWatchedAt, toggleCard, toggleSet, toggleCharacter],
  )

  return <WatchlistContext.Provider value={api}>{children}</WatchlistContext.Provider>
}

export function useWatchlist(): WatchlistApi {
  const ctx = useContext(WatchlistContext)
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider')
  return ctx
}
