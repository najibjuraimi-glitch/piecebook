import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getHoldings } from '../lib/holdingsClient'
import { fixtureBook } from '../lib/loadBought'
import { codeInBook, codesInBook } from '../lib/portfolioMarks'

/**
 * The same book Portfolio shows: the sample until a signed-in /holdings read
 * replaces it. Card lists read the codes. They do not read piecebook.v1.
 */
interface HoldingsBookApi {
  inPortfolio: (cardNumber: string) => boolean
}

const HoldingsBookContext = createContext<HoldingsBookApi | null>(null)

export function HoldingsBookProvider({ children }: { children: React.ReactNode }) {
  const [codes, setCodes] = useState(() => codesInBook(fixtureBook().copies))

  useEffect(() => {
    const ac = new AbortController()
    getHoldings(ac.signal)
      .then((res) => {
        if (!res.ok || !res.data || !Array.isArray(res.data.copies)) return
        setCodes(codesInBook(res.data.copies))
      })
      .catch(() => {
        // No worker or signed out. The sample book stays, as on Portfolio.
      })
    return () => ac.abort()
  }, [])

  const inPortfolio = useCallback((cardNumber: string) => codeInBook(codes, cardNumber), [codes])
  const value = useMemo(() => ({ inPortfolio }), [inPortfolio])
  return <HoldingsBookContext.Provider value={value}>{children}</HoldingsBookContext.Provider>
}

export function useHoldingsBook(): HoldingsBookApi {
  const ctx = useContext(HoldingsBookContext)
  if (!ctx) throw new Error('useHoldingsBook must be used within HoldingsBookProvider')
  return ctx
}
