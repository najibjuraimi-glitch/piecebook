import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type CostCurrency = 'SGD' | 'USD'

export const COST_CURRENCIES: readonly CostCurrency[] = ['SGD', 'USD']

/**
 * What the collector paid for a card, in the currency they paid in. One cost
 * per owned card; no FX conversion anywhere, so SGD and USD never mix.
 */
export interface CostBasis {
  amount: number
  currency: CostCurrency
  /** ISO date YYYY-MM-DD */
  paidOn: string
  note?: string
}

export interface OwnedEntry {
  qty: number
  /** ISO timestamp when first marked owned; used for "newest first" sort. */
  ownedAt: string
  /** Only present while the card is owned; removing ownership clears it. */
  cost?: CostBasis
}

interface CollectionState {
  owned: Record<string, OwnedEntry>
}

/** Pre-cost-basis shape (PR #5 and earlier) still found in some browsers. */
interface LegacyLot {
  cardNumber: string
  paidUsd: number
  paidOn: string
  note?: string
}

const STORAGE_KEY = 'piecebook.v1'

const EMPTY: CollectionState = { owned: {} }

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isCurrency(v: unknown): v is CostCurrency {
  return v === 'SGD' || v === 'USD'
}

function cleanCost(raw: unknown): CostBasis | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const c = raw as Partial<CostBasis>
  const amount = Number(c.amount)
  if (!Number.isFinite(amount) || amount < 0) return undefined
  if (!isCurrency(c.currency)) return undefined
  if (typeof c.paidOn !== 'string' || !ISO_DATE_RE.test(c.paidOn)) return undefined
  const note = typeof c.note === 'string' && c.note.trim() ? c.note.trim() : undefined
  return { amount, currency: c.currency, paidOn: c.paidOn, ...(note ? { note } : {}) }
}

function cleanEntry(raw: unknown): OwnedEntry | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const e = raw as Partial<OwnedEntry>
  const qty = Math.max(1, Math.floor(Number(e.qty) || 1))
  const ownedAt = typeof e.ownedAt === 'string' ? e.ownedAt : new Date(0).toISOString()
  const cost = cleanCost(e.cost)
  return { qty, ownedAt, ...(cost ? { cost } : {}) }
}

/**
 * Folds the old `lots` array (USD only, several per card) into one USD cost per
 * owned card so nothing a collector typed earlier is lost. Runs once on load;
 * the next save writes the new shape and drops `lots`.
 */
function migrateLots(owned: Record<string, OwnedEntry>, lots: unknown): Record<string, OwnedEntry> {
  if (!Array.isArray(lots) || lots.length === 0) return owned
  const next = { ...owned }
  const byCard = new Map<string, LegacyLot[]>()
  for (const lot of lots as Partial<LegacyLot>[]) {
    if (!lot || typeof lot.cardNumber !== 'string' || !next[lot.cardNumber] || next[lot.cardNumber].cost) continue
    const list = byCard.get(lot.cardNumber) ?? []
    list.push(lot as LegacyLot)
    byCard.set(lot.cardNumber, list)
  }
  for (const [cardNumber, list] of byCard) {
    const amount = list.reduce((sum, l) => sum + (Number(l.paidUsd) || 0), 0)
    const paidOn = list.map((l) => l.paidOn).filter((d) => typeof d === 'string' && ISO_DATE_RE.test(d)).sort()[0]
    const note = list.map((l) => l.note?.trim()).filter(Boolean).join('; ')
    if (!paidOn) continue
    next[cardNumber] = {
      ...next[cardNumber],
      cost: { amount, currency: 'USD', paidOn, ...(note ? { note } : {}) },
    }
  }
  return next
}

function load(): CollectionState {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as { owned?: unknown; lots?: unknown }
    const owned: Record<string, OwnedEntry> = {}
    if (parsed.owned && typeof parsed.owned === 'object') {
      for (const [cardNumber, entry] of Object.entries(parsed.owned as Record<string, unknown>)) {
        const clean = cleanEntry(entry)
        if (clean) owned[cardNumber] = clean
      }
    }
    return { owned: migrateLots(owned, parsed.lots) }
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

export interface CollectionApi {
  owned: Record<string, OwnedEntry>
  isOwned: (cardNumber: string) => boolean
  ownedQty: (cardNumber: string) => number
  costFor: (cardNumber: string) => CostBasis | undefined
  markOwned: (cardNumber: string) => void
  removeOwned: (cardNumber: string) => void
  setQty: (cardNumber: string, qty: number) => void
  /** No-op unless the card is owned: cost only exists alongside ownership. */
  setCost: (cardNumber: string, cost: CostBasis) => void
  clearCost: (cardNumber: string) => void
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
  const costFor = useCallback((n: string) => state.owned[n]?.cost, [state.owned])

  const markOwned = useCallback((cardNumber: string) => {
    setState((s) => {
      if (s.owned[cardNumber]) return s
      return { owned: { ...s.owned, [cardNumber]: { qty: 1, ownedAt: new Date().toISOString() } } }
    })
  }, [])

  const removeOwned = useCallback((cardNumber: string) => {
    setState((s) => {
      if (!s.owned[cardNumber]) return s
      const owned = { ...s.owned }
      delete owned[cardNumber]
      return { owned }
    })
  }, [])

  const setQty = useCallback((cardNumber: string, qty: number) => {
    const next = Math.max(1, Math.floor(qty))
    setState((s) => {
      const entry = s.owned[cardNumber] ?? { qty: 1, ownedAt: new Date().toISOString() }
      return { owned: { ...s.owned, [cardNumber]: { ...entry, qty: next } } }
    })
  }, [])

  const setCost = useCallback((cardNumber: string, cost: CostBasis) => {
    const clean = cleanCost(cost)
    if (!clean) return
    setState((s) => {
      const entry = s.owned[cardNumber]
      if (!entry) return s
      return { owned: { ...s.owned, [cardNumber]: { ...entry, cost: clean } } }
    })
  }, [])

  const clearCost = useCallback((cardNumber: string) => {
    setState((s) => {
      const entry = s.owned[cardNumber]
      if (!entry || !entry.cost) return s
      const { cost: _dropped, ...rest } = entry
      return { owned: { ...s.owned, [cardNumber]: rest } }
    })
  }, [])

  const api = useMemo<CollectionApi>(
    () => ({
      owned: state.owned,
      isOwned,
      ownedQty,
      costFor,
      markOwned,
      removeOwned,
      setQty,
      setCost,
      clearCost,
    }),
    [state, isOwned, ownedQty, costFor, markOwned, removeOwned, setQty, setCost, clearCost],
  )

  return <CollectionContext.Provider value={api}>{children}</CollectionContext.Provider>
}

export function useCollection(): CollectionApi {
  const ctx = useContext(CollectionContext)
  if (!ctx) throw new Error('useCollection must be used within CollectionProvider')
  return ctx
}
