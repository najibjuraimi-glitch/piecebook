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
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'VisionRequestError'
    this.status = status
  }
}

export const CHECK_TIMEOUT_MS = 30_000
const LONG_EDGE = 1600
const MAX_ENCODED_BYTES = 450_000

/** Human line from a failed /check body — never a silent "could not run". */
export function visionErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const p = payload as { error?: unknown; detail?: unknown; hint?: unknown }
    const error = typeof p.error === 'string' ? p.error : ''
    const detail = typeof p.detail === 'string' ? p.detail : typeof p.hint === 'string' ? p.hint : ''
    const bits = [error, detail].filter(Boolean)
    if (bits.length) return bits.join(' — ')
  }
  return `The photo check could not run (${status}).`
}

/** Downscale a photo to ~1600px on the long edge, JPEG small enough for the Worker. */
export async function downscaleForVision(file: Blob, longEdge = LONG_EDGE): Promise<string> {
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
  for (const quality of [0.85, 0.75, 0.65, 0.55]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length * 0.75 <= MAX_ENCODED_BYTES) return url
  }
  return canvas.toDataURL('image/jpeg', 0.5)
}

export interface VisionCheckPayload {
  check: VisionCheck
  frontDataUrl: string
  backDataUrl?: string
}

let inflight: Promise<VisionCheckPayload> | null = null

export async function checkPhotos(front: Blob, back?: Blob | null): Promise<VisionCheckPayload> {
  if (inflight) return inflight
  inflight = checkPhotosOnce(front, back).finally(() => {
    inflight = null
  })
  return inflight
}

async function checkPhotosOnce(front: Blob, back?: Blob | null): Promise<VisionCheckPayload> {
  const frontDataUrl = await downscaleForVision(front)
  const backDataUrl = back ? await downscaleForVision(back) : undefined
  const body: { front: string; back?: string } = { front: frontDataUrl }
  if (backDataUrl) body.back = backDataUrl
  const jsonBody = JSON.stringify(body)
  const retried = await postCheckWithRetry(jsonBody)
  let payload: unknown
  try {
    payload = await retried.json()
  } catch {
    throw new VisionRequestError('The photo check did not answer.', retried.status)
  }
  if (retried.status === 429) {
    const err = payload as { cap?: number; used?: number }
    throw new VisionCapError(Number(err.cap) || 60, Number(err.used) || 0)
  }
  if (!retried.ok) throw new VisionRequestError(visionErrorMessage(payload, retried.status), retried.status)
  const check = asVisionCheck(payload)
  if (!check) throw new VisionRequestError(visionErrorMessage(payload, retried.status), retried.status)
  return { check, frontDataUrl, backDataUrl }
}

export interface PostCheckDeps {
  fetch: typeof fetch
  timeoutMs: number
  url: string
}

/**
 * POST /check at most twice: the second attempt only after a timeout, a
 * network drop, or a 5xx. Each attempt gets its own abort timer.
 */
export async function postCheckWithRetry(body: string, deps?: Partial<PostCheckDeps>): Promise<Response> {
  const d: PostCheckDeps = {
    fetch: deps?.fetch ?? ((input, init) => fetch(input, init)),
    timeoutMs: deps?.timeoutMs ?? CHECK_TIMEOUT_MS,
    url: deps?.url ?? `${VISION_URL}/check`,
  }
  const attempt = async (): Promise<Response> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), d.timeoutMs)
    try {
      return await d.fetch(d.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }
  let first: Response
  try {
    first = await attempt()
  } catch {
    try {
      return await attempt()
    } catch {
      throw new VisionRequestError('The photo check timed out.')
    }
  }
  if (first.status < 500) return first
  try {
    return await attempt()
  } catch {
    throw new VisionRequestError('The photo check timed out.', first.status)
  }
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
