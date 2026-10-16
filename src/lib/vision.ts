import { VISION_URL } from '../config/vision'

export const CARD_LANGUAGES = ['EN', 'JP', 'CN', 'KR', 'FR'] as const
export type CardLanguageCode = (typeof CARD_LANGUAGES)[number]

export interface VisionSection {
  flags: string[]
  notes: string
}

export interface VisionIdentify {
  set_code: string | null
  name: string | null
  parallel_guess: string | null
  /** Printed language read from the card text, not the set code. */
  language: CardLanguageCode | null
  confidence: number
  read_text: string
}

/** EN / JP / CN / KR / FR from model output; anything else is null. */
export function normalizeCardLanguage(v: unknown): CardLanguageCode | null {
  if (!v || typeof v !== 'string') return null
  const u = v.trim().toUpperCase()
  if ((CARD_LANGUAGES as readonly string[]).includes(u)) return u as CardLanguageCode
  if (/^EN/.test(u) || u === 'ENGLISH') return 'EN'
  if (/^(JP|JA|JPN|JAPANESE)/.test(u)) return 'JP'
  if (/^(CN|ZH|CHINESE)/.test(u)) return 'CN'
  if (/^(KR|KO|KOR|KOREAN)/.test(u)) return 'KR'
  if (/^(FR|FRA|FRENCH)/.test(u)) return 'FR'
  return null
}

export function cardLanguageLabel(code: CardLanguageCode | null): string {
  return code ?? 'not read'
}

/** True only when the photo check named a non-English print. */
export function isNonEnglishCardLanguage(code: CardLanguageCode | null): boolean {
  return code != null && code !== 'EN'
}

export interface VisionCondition {
  corners: VisionSection
  edges: VisionSection
  surface: VisionSection
  psa10_ruled_out: boolean
  reasons: string[]
}

export interface VisionUsage {
  today: number
  cap: number
}

export interface VisionCheck {
  identify: VisionIdentify
  condition: VisionCondition
  ai_guess: boolean
  model: string
  usage: VisionUsage
  disclaimer: string
}

export class VisionCapError extends Error {
  readonly cap: number
  readonly used: number
  constructor(cap: number, used: number) {
    super('daily_cap_reached')
    this.name = 'VisionCapError'
    this.cap = cap
    this.used = used
  }
}

export class VisionRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VisionRequestError'
  }
}

const LONG_EDGE = 1600
const JPEG_QUALITY = 0.85

/** Downscale a photo to ~1600px on the long edge, JPEG ~0.85, as a data URL. */
export async function downscaleForVision(file: Blob, longEdge = LONG_EDGE, quality = JPEG_QUALITY): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new VisionRequestError('Could not resize the photo.')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality)
}

export interface VisionCheckPayload {
  check: VisionCheck
  frontDataUrl: string
  backDataUrl?: string
}

export async function checkPhotos(front: Blob, back?: Blob | null): Promise<VisionCheckPayload> {
  const frontDataUrl = await downscaleForVision(front)
  const backDataUrl = back ? await downscaleForVision(back) : undefined
  const body: { front: string; back?: string } = { front: frontDataUrl }
  if (backDataUrl) body.back = backDataUrl
  let res: Response
  try {
    res = await fetch(`${VISION_URL}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new VisionRequestError('The photo check did not answer.')
  }
  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    throw new VisionRequestError('The photo check did not answer.')
  }
  if (res.status === 429) {
    const err = payload as { cap?: number; used?: number }
    throw new VisionCapError(Number(err.cap) || 60, Number(err.used) || 0)
  }
  if (!res.ok) throw new VisionRequestError('The photo check could not run.')
  const check = asVisionCheck(payload)
  if (!check) throw new VisionRequestError('The photo check could not run.')
  return { check, frontDataUrl, backDataUrl }
}

/** Turn a vision data URL back into a File so the worksheet can measure it. */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const comma = dataUrl.indexOf(',')
  const header = comma >= 0 ? dataUrl.slice(0, comma) : ''
  const data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/jpeg'
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name, { type: mime })
}

function asSection(raw: unknown): VisionSection | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as { flags?: unknown; notes?: unknown }
  const flags = Array.isArray(s.flags) ? s.flags.filter((f): f is string => typeof f === 'string') : []
  return { flags, notes: typeof s.notes === 'string' ? s.notes : '' }
}

export function asVisionCheck(raw: unknown): VisionCheck | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<VisionCheck>
  const id = r.identify
  const c = r.condition
  if (!id || typeof id !== 'object' || !c || typeof c !== 'object') return null
  const corners = asSection(c.corners)
  const edges = asSection(c.edges)
  const surface = asSection(c.surface)
  if (!corners || !edges || !surface) return null
  const reasons = Array.isArray(c.reasons) ? c.reasons.filter((x): x is string => typeof x === 'string') : []
  return {
    identify: {
      set_code: typeof id.set_code === 'string' && id.set_code.trim() ? id.set_code.trim() : null,
      name: typeof id.name === 'string' && id.name.trim() ? id.name.trim() : null,
      parallel_guess: typeof id.parallel_guess === 'string' && id.parallel_guess.trim() ? id.parallel_guess.trim() : null,
      language: normalizeCardLanguage(id.language),
      confidence: Number.isFinite(Number(id.confidence)) ? Number(id.confidence) : 0,
      read_text: typeof id.read_text === 'string' ? id.read_text : '',
    },
    condition: {
      corners,
      edges,
      surface,
      psa10_ruled_out: Boolean(c.psa10_ruled_out),
      reasons,
    },
    ai_guess: true,
    model: typeof r.model === 'string' ? r.model : '',
    usage: {
      today: Number((r.usage as VisionUsage | undefined)?.today) || 0,
      cap: Number((r.usage as VisionUsage | undefined)?.cap) || 0,
    },
    disclaimer:
      typeof r.disclaimer === 'string' && r.disclaimer.trim()
        ? r.disclaimer
        : 'AI guess. Photos can rule out a PSA 10 but never confirm one.',
  }
}
