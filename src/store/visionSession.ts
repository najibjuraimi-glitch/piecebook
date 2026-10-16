import type { VisionCheck } from '../lib/vision'
import { asVisionCheck } from '../lib/vision'

const KEY = 'piecebook.vision.session.v1'

export interface VisionSession {
  check: VisionCheck
  frontDataUrl: string
  backDataUrl?: string
  confirmedCardNumber?: string
}

function readRaw(): VisionSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<VisionSession>
    const check = asVisionCheck(parsed.check)
    if (!check || typeof parsed.frontDataUrl !== 'string') return null
    return {
      check,
      frontDataUrl: parsed.frontDataUrl,
      backDataUrl: typeof parsed.backDataUrl === 'string' ? parsed.backDataUrl : undefined,
      confirmedCardNumber: typeof parsed.confirmedCardNumber === 'string' ? parsed.confirmedCardNumber : undefined,
    }
  } catch {
    return null
  }
}

export function peekVisionSession(): VisionSession | null {
  return readRaw()
}

export function writeVisionSession(session: VisionSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Private mode / quota: the current page still holds the object.
  }
}

export function confirmVisionCard(cardNumber: string): VisionSession | null {
  const current = readRaw()
  if (!current) return null
  const next = { ...current, confirmedCardNumber: cardNumber }
  writeVisionSession(next)
  return next
}

export function clearVisionSession(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
