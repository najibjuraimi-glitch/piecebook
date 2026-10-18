import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getHoldings } from '../lib/holdingsClient'
import { fixtureBook } from '../lib/loadBought'
import { portfolioIndex, portfolioMark, type PortfolioIndex, type PortfolioMark } from '../lib/portfolioMarks'

/**
 * The same book Portfolio shows: the sample until a signed-in /holdings read
 * replaces it. Card lists read exactPrint, then the card number in the code.
 * They do not read piecebook.v1.
 */
interface HoldingsBookApi {
  mark: (cardNumber: string) => PortfolioMark | null
}

const HoldingsBookContext = createContext<HoldingsBookApi | null>(null)

export function HoldingsBookProvider({ children }: { children: React.ReactNode }) {
  const [index, setIndex] = useState<PortfolioIndex>(() => portfolioIndex(fixtureBook().copies))

  useEffect(() => {
    const ac = new AbortController()
    getHoldings(ac.signal)
      .then((res) => {
        if (!res.ok || !res.data || !Array.isArray(res.data.copies)) return
        setIndex(portfolioIndex(res.data.copies))
      })
      .catch(() => {
        // No worker or signed out. The sample book stays, as on Portfolio.
      })
    return () => ac.abort()
  }, [])

  const mark = useCallback((cardNumber: string) => portfolioMark(index, cardNumber), [index])
  const value = useMemo(() => ({ mark }), [mark])
  return <HoldingsBookContext.Provider value={value}>{children}</HoldingsBookContext.Provider>
}

export function useHoldingsBook(): HoldingsBookApi {
  const ctx = useContext(HoldingsBookContext)
  if (!ctx) throw new Error('useHoldingsBook must be used within HoldingsBookProvider')
  return ctx
}
