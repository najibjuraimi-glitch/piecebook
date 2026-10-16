import { useSyncExternalStore } from 'react'
import type { ExitId, P10Band, PriceKind, Verdict } from '../lib/gradeWorth'
import type { PhotoSide, RejectCode } from '../lib/centering'
import { asVisionCheck, type VisionCheck } from '../lib/vision'
import { readRaw, subscribeUserData, writeRaw } from './userData'

const STORAGE_KEY = 'piecebook.pregrade.v1'

export type PredictionStatus = 'draft' | 'submitted'

export interface StoredPrice {
  usd: number
  source: string
  asOf: string
  kind: PriceKind
}

export interface StoredPop {
  tens: number
  nines: number
  total: number
  source: string
  asOf: string
}

export interface StoredPhoto {
  side: PhotoSide
  fileName: string
  width: number
  height: number
  reject?: { code: RejectCode; message: string }
  centering?: {
    left: number
    right: number
    top: number
    bottom: number
    lrLabel: string
    tbLabel: string
    worseLabel: string
    worseLargerPct: number
    cannotBeTen: boolean
    /** Absent on rows saved before the print-edge guard; restore recomputes it from the pixel counts. */
    resolved?: boolean
  }
}

export interface PredictionRecord {
  id: string
  createdAt: string
  updatedAt: string
  submittedAt?: string
  status: PredictionStatus
  cardNumber: string
  cardName: string
  photos: StoredPhoto[]
  cannotBeTen: boolean
  photoNote: string
  /** Snapshot of the photo-check guess. Optional — older rows have none. */
  vision: VisionCheck | null
  pop: StoredPop | null
  raw: StoredPrice | null
  v9: StoredPrice | null
  v10: StoredPrice | null
  v8: StoredPrice | null
  shipToPortlandUsd: number | null
  shipToPsaUsd: number | null
  buyAndShipUsd: number | null
  months: number
  monthlyDrift: number
  verdict: Verdict | null
  reason: string | null
  evUsd: number | null
  costInUsd: number | null
  maxBuyUsd: number | null
  bestExit: ExitId | null
  p10: number | null
  p10Band: P10Band | null
  /** Grade entry later — this slice only stores the slot. */
  actualGrade: { grade: number; cert?: string; asOf: string } | null
}

export type PredictionDraft = Omit<PredictionRecord, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'submittedAt'> & {
  id?: string
}

let cache: PredictionRecord[] | null = null
let snapshot: PredictionRecord[] = []
const listeners = new Set<() => void>()

function sorted(list: PredictionRecord[]): PredictionRecord[] {
  return list.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function read(): PredictionRecord[] {
  if (cache) return cache
  try {
    const raw = readRaw(STORAGE_KEY)
    cache = raw ? cleanList(JSON.parse(raw)) : []
  } catch {
    cache = []
  }
  snapshot = sorted(cache)
  return cache
}

function write(next: PredictionRecord[]): void {
  cache = next
  snapshot = sorted(next)
  // Quota or private mode returns false: keep the in-memory list so the session still works.
  writeRaw(STORAGE_KEY, JSON.stringify(next))
  for (const l of listeners) l()
}

// A copy from the cloud, an import or another tab replaces the cache.
subscribeUserData(STORAGE_KEY, (change) => {
  if (change.source === 'local') return
  cache = null
  read()
  for (const l of listeners) l()
})

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function cleanList(raw: unknown): PredictionRecord[] {
  if (!Array.isArray(raw)) return []
  return raw.map(cleanRecord).filter((r): r is PredictionRecord => r !== null)
}

function cleanRecord(raw: unknown): PredictionRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<PredictionRecord>
  if (typeof r.id !== 'string' || typeof r.cardNumber !== 'string') return null
  return {
    id: r.id,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString(),
    submittedAt: typeof r.submittedAt === 'string' ? r.submittedAt : undefined,
    status: r.status === 'submitted' ? 'submitted' : 'draft',
    cardNumber: r.cardNumber,
    cardName: typeof r.cardName === 'string' ? r.cardName : r.cardNumber,
    photos: Array.isArray(r.photos) ? (r.photos as StoredPhoto[]) : [],
    cannotBeTen: Boolean(r.cannotBeTen),
    photoNote: typeof r.photoNote === 'string' ? r.photoNote : '',
    vision: r.vision ? asVisionCheck(r.vision) : null,
    pop: r.pop ?? null,
    raw: r.raw ?? null,
    v9: r.v9 ?? null,
    v10: r.v10 ?? null,
    v8: r.v8 ?? null,
    shipToPortlandUsd: numOrNull(r.shipToPortlandUsd),
    shipToPsaUsd: numOrNull(r.shipToPsaUsd),
    buyAndShipUsd: numOrNull(r.buyAndShipUsd),
    months: Number(r.months) || 5,
    monthlyDrift: Number(r.monthlyDrift) || 0,
    verdict: r.verdict === 'go' || r.verdict === 'borderline' || r.verdict === 'no-go' ? r.verdict : null,
    reason: typeof r.reason === 'string' ? r.reason : null,
    evUsd: numOrNull(r.evUsd),
    costInUsd: numOrNull(r.costInUsd),
    maxBuyUsd: numOrNull(r.maxBuyUsd),
    bestExit: r.bestExit === 'vault-sell' || r.bestExit === 'ship-sg' || r.bestExit === 'keep' ? r.bestExit : null,
    p10: numOrNull(r.p10),
    p10Band: r.p10Band === 'low' || r.p10Band === 'mid' || r.p10Band === 'high' ? r.p10Band : null,
    actualGrade: r.actualGrade ?? null,
  }
}

function numOrNull(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function listPredictions(): PredictionRecord[] {
  read()
  return snapshot
}

export function getPrediction(id: string | undefined): PredictionRecord | undefined {
  if (!id) return undefined
  return read().find((r) => r.id === id)
}

export function savePrediction(draft: PredictionDraft): PredictionRecord {
  const now = new Date().toISOString()
  const existing = draft.id ? read().find((r) => r.id === draft.id) : undefined
  if (existing?.status === 'submitted') return existing
  const record: PredictionRecord = {
    ...draft,
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    status: 'draft',
    vision: draft.vision ?? existing?.vision ?? null,
    actualGrade: existing?.actualGrade ?? draft.actualGrade ?? null,
  }
  const rest = read().filter((r) => r.id !== record.id)
  write([record, ...rest])
  return record
}

/** Locks the row. Grade entry is later — this only flips the lock. */
export function submitPrediction(id: string): PredictionRecord | undefined {
  const now = new Date().toISOString()
  let submitted: PredictionRecord | undefined
  write(
    read().map((r) => {
      if (r.id !== id || r.status === 'submitted') {
        if (r.id === id) submitted = r
        return r
      }
      submitted = { ...r, status: 'submitted', submittedAt: now, updatedAt: now }
      return submitted
    }),
  )
  return submitted
}

export function removePrediction(id: string): void {
  const row = read().find((r) => r.id === id)
  if (row?.status === 'submitted') return
  write(read().filter((r) => r.id !== id))
}

export function usePredictions(): PredictionRecord[] {
  return useSyncExternalStore(subscribe, listPredictions, listPredictions)
}

export function usePrediction(id: string | undefined): PredictionRecord | undefined {
  const list = usePredictions()
  return id ? list.find((r) => r.id === id) : undefined
}
