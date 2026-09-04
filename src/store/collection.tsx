import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export interface CostLot {
  id: string
  cardNumber: string
  qty: number
  /** Total amount paid for this lot, in USD. */
  paidUsd: number
  /** ISO date YYYY-MM-DD */
  paidOn: string
  note?: string
}

export interface OwnedEntry {
  qty: number
  /** ISO timestamp when first marked owned; used for "newest first" sort. */
  ownedAt: string
}

interface CollectionState {
  owned: Record<string, OwnedEntry>
  lots: CostLot[]
}

const STORAGE_KEY = 'piecebook.v1'

const EMPTY: CollectionState = { owned: {}, lots: [] }

function load(): CollectionState {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<CollectionState>
    return {
      owned: parsed.owned && typeof parsed.owned === 'object' ? parsed.owned : {},
      lots: Array.isArray(parsed.lots) ? parsed.lots : [],
    }
  } catch {
    return EMPTY
  }
}

function save(state: CollectionState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable; state still lives in memory for this session.
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface CollectionApi {
  owned: Record<string, OwnedEntry>
  lots: CostLot[]
  isOwned: (cardNumber: string) => boolean
  ownedQty: (cardNumber: string) => number
  markOwned: (cardNumber: string) => void
  removeOwned: (cardNumber: string) => void
  setQty: (cardNumber: string, qty: number) => void
  lotsFor: (cardNumber: string) => CostLot[]
  saveLot: (lot: Omit<CostLot, 'id'> & { id?: string }) => void
  removeLot: (id: string) => void
}

const CollectionContext = createContext<CollectionApi | null>(null)

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CollectionState>(load)

  useEffect(() => {
    save(state)
  }, [state])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setState(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const isOwned = useCallback((n: string) => Boolean(state.owned[n]), [state.owned])
  const ownedQty = useCallback((n: string) => state.owned[n]?.qty ?? 0, [state.owned])
  const lotsFor = useCallback(
    (n: string) => state.lots.filter((l) => l.cardNumber === n).sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
    [state.lots],
  )

  const markOwned = useCallback((cardNumber: string) => {
    setState((s) => {
      if (s.owned[cardNumber]) return s
      return { ...s, owned: { ...s.owned, [cardNumber]: { qty: 1, ownedAt: new Date().toISOString() } } }
    })
  }, [])

  const removeOwned = useCallback((cardNumber: string) => {
    setState((s) => {
      const owned = { ...s.owned }
      delete owned[cardNumber]
      return { owned, lots: s.lots.filter((l) => l.cardNumber !== cardNumber) }
    })
  }, [])

  const setQty = useCallback((cardNumber: string, qty: number) => {
    const next = Math.max(1, Math.floor(qty))
    setState((s) => {
      const entry = s.owned[cardNumber] ?? { qty: 1, ownedAt: new Date().toISOString() }
      return { ...s, owned: { ...s.owned, [cardNumber]: { ...entry, qty: next } } }
    })
  }, [])

  const saveLot = useCallback((lot: Omit<CostLot, 'id'> & { id?: string }) => {
    setState((s) => {
      const clean: CostLot = {
        id: lot.id ?? newId(),
        cardNumber: lot.cardNumber,
        qty: Math.max(1, Math.floor(lot.qty || 1)),
        paidUsd: Math.max(0, Number(lot.paidUsd) || 0),
        paidOn: lot.paidOn,
        note: lot.note?.trim() ? lot.note.trim() : undefined,
      }
      const lots = lot.id ? s.lots.map((l) => (l.id === lot.id ? clean : l)) : [...s.lots, clean]

      // Logging a cost lot implies ownership; keep owned qty at least as large as logged lots.
      const lotQty = lots.filter((l) => l.cardNumber === clean.cardNumber).reduce((n, l) => n + l.qty, 0)
      const entry = s.owned[clean.cardNumber] ?? { qty: 1, ownedAt: new Date().toISOString() }
      const owned = { ...s.owned, [clean.cardNumber]: { ...entry, qty: Math.max(entry.qty, lotQty) } }
      return { owned, lots }
    })
  }, [])

  const removeLot = useCallback((id: string) => {
    setState((s) => ({ ...s, lots: s.lots.filter((l) => l.id !== id) }))
  }, [])

  const api = useMemo<CollectionApi>(
    () => ({
      owned: state.owned,
      lots: state.lots,
      isOwned,
      ownedQty,
      markOwned,
      removeOwned,
      setQty,
      lotsFor,
      saveLot,
      removeLot,
    }),
    [state, isOwned, ownedQty, markOwned, removeOwned, setQty, lotsFor, saveLot, removeLot],
  )

  return <CollectionContext.Provider value={api}>{children}</CollectionContext.Provider>
}

export function useCollection(): CollectionApi {
  const ctx = useContext(CollectionContext)
  if (!ctx) throw new Error('useCollection must be used within CollectionProvider')
  return ctx
}
