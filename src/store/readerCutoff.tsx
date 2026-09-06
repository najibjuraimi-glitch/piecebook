import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * How far the reader has finished (11.1). Remembered. Default is each name's
 * debut arc — the same gate the character page already uses — so a first visit
 * does not unlock later summaries or fruits.
 */
const STORAGE_KEY = 'piecebook.readerCutoff.v1'

export type CutoffId = 'debut' | 'east-blue' | 'arabasta' | 'enies-lobby' | 'marineford' | 'dressrosa' | 'wano' | 'now'

export interface CutoffOption {
  id: CutoffId
  /** Short chip label. */
  label: string
  /** Last chapter of that arc; null on Debut arc and Now. */
  chapter: number | null
  /** Late wiki clauses (deaths, "former") pass. */
  finished: boolean
}

/** Saga floors from the wiki Story Arcs list, last chapter of the named arc. */
export const CUTOFFS: readonly CutoffOption[] = [
  { id: 'debut', label: 'Debut arc', chapter: null, finished: false },
  { id: 'east-blue', label: 'East Blue', chapter: 95, finished: false },
  { id: 'arabasta', label: 'Arabasta', chapter: 217, finished: false },
  { id: 'enies-lobby', label: 'Enies Lobby', chapter: 430, finished: false },
  { id: 'marineford', label: 'Marineford', chapter: 580, finished: false },
  { id: 'dressrosa', label: 'Dressrosa', chapter: 801, finished: false },
  { id: 'wano', label: 'Wano', chapter: 1057, finished: false },
  { id: 'now', label: 'Now', chapter: null, finished: true },
]

function isCutoffId(v: string | null): v is CutoffId {
  return CUTOFFS.some((c) => c.id === v)
}

export function readCutoffId(): CutoffId {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return isCutoffId(raw) ? raw : 'debut'
  } catch {
    return 'debut'
  }
}

export function writeCutoffId(id: CutoffId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage unavailable: the tab still works for this visit.
  }
}

export interface ReaderCutoff {
  id: CutoffId
  option: CutoffOption
  /** Last chapter finished, or null for the stored debut-arc line. */
  chapter: number | null
  finished: boolean
  /** Summaries and fruits stay closed until a saga chip is picked. */
  unlocksStory: boolean
  setId: (id: CutoffId) => void
}

const ReaderCutoffContext = createContext<ReaderCutoff | null>(null)

export function ReaderCutoffProvider({ children }: { children: ReactNode }) {
  const [id, setIdState] = useState<CutoffId>(readCutoffId)
  const setId = useCallback((next: CutoffId) => {
    setIdState(next)
    writeCutoffId(next)
  }, [])
  const value = useMemo<ReaderCutoff>(() => {
    const option = CUTOFFS.find((c) => c.id === id) ?? CUTOFFS[0]
    return {
      id: option.id,
      option,
      chapter: option.finished ? null : option.chapter,
      finished: option.finished,
      unlocksStory: option.id !== 'debut',
      setId,
    }
  }, [id, setId])
  return <ReaderCutoffContext.Provider value={value}>{children}</ReaderCutoffContext.Provider>
}

export function useReaderCutoff(): ReaderCutoff {
  const ctx = useContext(ReaderCutoffContext)
  if (!ctx) throw new Error('useReaderCutoff needs ReaderCutoffProvider')
  return ctx
}
