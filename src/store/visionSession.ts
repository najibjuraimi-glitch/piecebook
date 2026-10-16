import type { VisionCheck } from '../lib/vision'
import { asVisionCheck } from '../lib/vision'

const KEY = 'piecebook.vision.session.v1'

export interface VisionSession {
  check: VisionCheck
  frontDataUrl: string
  backDataUrl?: string
  confirmedCardNumber?: string
}

/** Same-tab copy so confirm → worksheet still works if sessionStorage quota rejects the data URLs. */
let memory: VisionSession | null = null

function fromParsed(parsed: Partial<VisionSession>): VisionSession | null {
  const check = asVisionCheck(parsed.check)
  if (!check || typeof parsed.frontDataUrl !== 'string') return null
  return {
    check,
    frontDataUrl: parsed.frontDataUrl,
    backDataUrl: typeof parsed.backDataUrl === 'string' ? parsed.backDataUrl : undefined,
    confirmedCardNumber: typeof parsed.confirmedCardNumber === 'string' ? parsed.confirmedCardNumber : undefined,
  }
}

function readStored(): VisionSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return fromParsed(JSON.parse(raw) as Partial<VisionSession>)
  } catch {
    return null
  }
}

export function peekVisionSession(): VisionSession | null {
  return memory ?? readStored()
}

export function writeVisionSession(session: VisionSession): void {
  memory = session
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Quota: memory still carries the photos to the worksheet in this tab.
  }
}

export function confirmVisionCard(cardNumber: string): VisionSession | null {
  const current = peekVisionSession()
  if (!current) return null
  const next = { ...current, confirmedCardNumber: cardNumber }
  writeVisionSession(next)
  return next
}

export function clearVisionSession(): void {
  memory = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
