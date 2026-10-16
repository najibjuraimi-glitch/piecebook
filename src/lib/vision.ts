import { VISION_URL } from '../config/vision'
import { parseCenteringSummary, type CenteringSummary, type PhotoCentering } from './centeringSummary'
import { isConfidence, isSeverity, type Confidence, type Severity } from './gradeScore'

export const CARD_LANGUAGES = ['EN', 'JP', 'CN', 'KR', 'FR'] as const
export type CardLanguageCode = (typeof CARD_LANGUAGES)[number]

export interface VisionSection {
  flags: string[]
  notes: string
  /** How bad the worst defect in this part is, from the model's strict enum. Null on older answers. */
  severity: Severity | null
  /** How well the photos show this part, from the model. Null on older answers. */
  confidence: Confidence | null
}

export interface VisionIdentify {
  set_code: string | null
  name: string | null
  /** Rarity mark next to the card number (L, SEC, SR, R, UC, C, SP, P) when read. */
  rarity: string | null
  parallel_guess: string | null
  /** Printed language read from the card text, not the set code. */
  language: CardLanguageCode | null
  confidence: number
  /** OCR text. The Worker no longer sends it (it tripped Gemini's recitation filter); kept for stored predictions. */
  read_text: string
}

/** `identify_only`: the model refused to describe the card, so the condition block is empty and nothing is ruled out. */
export type VisionCoverage = 'full' | 'identify_only'

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
  coverage: VisionCoverage
  /** Centering as the Worker echoed it back (measured on this device). Null on answers that carried none. */
  centering: CenteringSummary | null
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

/** The shrunken photos that were sent, so a refused check can still feed the worksheet. */
export interface VisionPhotos {
  frontDataUrl: string
  backDataUrl?: string
}

export class VisionRequestError extends Error {
  readonly status?: number
  /** Worker error code (`model_error`, `unparseable_model_output`, …) when it sent one. */
  readonly code?: string
  /** Worker's parse-failure reason (`blocked`, `max_tokens`, …) when it sent one. */
  readonly reason?: string
  /** True when trying the same photos again has a real chance: model hiccups, timeouts, 5xx. */
  readonly retryable: boolean
  /** Set once the photos were shrunk, whatever happened after. */
  photos?: VisionPhotos
  constructor(message: string, status?: number, opts: { code?: string; reason?: string; retryable?: boolean; photos?: VisionPhotos } = {}) {
    super(message)
    this.name = 'VisionRequestError'
    this.status = status
    this.code = opts.code
    this.reason = opts.reason
    this.photos = opts.photos
    this.retryable = opts.retryable ?? isRetryableVisionFailure(opts.code, status, opts.reason)
  }
  /** The model refused to describe this card (copyright or safety filter); the same photo will refuse again. */
  get blocked(): boolean {
    return this.reason === 'blocked'
  }
}

export const CHECK_TIMEOUT_MS = 30_000
const LONG_EDGE = 1600
const MAX_ENCODED_BYTES = 450_000

const RETRYABLE_CODES = new Set(['model_error', 'unparseable_model_output'])

/** A failure worth a second tap: the model misbehaved or the network did, not the request. */
export function isRetryableVisionFailure(code: string | undefined, status: number | undefined, reason?: string): boolean {
  if (reason === 'blocked') return false
  if (code && RETRYABLE_CODES.has(code)) return true
  if (code) return false
  return status === undefined || status >= 500
}

/** Plain words for the Worker's model failures; `detail` from the Worker wins when it has one. */
const MODEL_FAILURE_TEXT: Record<string, string> = {
  model_error: 'The photo check’s model did not answer.',
  unparseable_model_output: 'The photo check got a garbled answer from the model.',
}

/** Human line from a failed /check body — never a silent "could not run". */
export function visionErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const p = payload as { error?: unknown; detail?: unknown; hint?: unknown }
    const error = typeof p.error === 'string' ? p.error : ''
    const detail = typeof p.detail === 'string' ? p.detail : typeof p.hint === 'string' ? p.hint : ''
    if (error && MODEL_FAILURE_TEXT[error]) return detail || MODEL_FAILURE_TEXT[error]
    const bits = [error, detail].filter(Boolean)
    if (bits.length) return bits.join(' — ')
  }
  return `The photo check could not run (${status}).`
}

function visionErrorField(payload: unknown, field: 'error' | 'reason'): string | undefined {
  if (payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>)[field] === 'string') {
    return (payload as Record<string, string>)[field]
  }
  return undefined
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

/** Centering measured on this device, sent with the photos so the Worker can echo it to agents. */
export interface CenteringToSend {
  front: PhotoCentering | null
  back: PhotoCentering | null
}

export async function checkPhotos(front: Blob, back?: Blob | null, centering?: CenteringToSend | null): Promise<VisionCheckPayload> {
  if (inflight) return inflight
  inflight = checkPhotosOnce(front, back, centering).finally(() => {
    inflight = null
  })
  return inflight
}

async function checkPhotosOnce(front: Blob, back?: Blob | null, centering?: CenteringToSend | null): Promise<VisionCheckPayload> {
  const frontDataUrl = await downscaleForVision(front)
  const backDataUrl = back ? await downscaleForVision(back) : undefined
  const photos: VisionPhotos = { frontDataUrl, backDataUrl }
  try {
    return await postAndParse(photos, centering)
  } catch (err) {
    // Whatever went wrong after shrinking, the photos are still good for the worksheet.
    if (err instanceof VisionRequestError && !err.photos) err.photos = photos
    throw err
  }
}

/** The JSON body for POST /check: photos as data URLs, plus the centering block when it was measured. */
export function checkRequestBody(photos: VisionPhotos, centering?: CenteringToSend | null): string {
  const { frontDataUrl, backDataUrl } = photos
  const body: { front: string; back?: string; centering?: CenteringToSend } = { front: frontDataUrl }
  if (backDataUrl) body.back = backDataUrl
  if (centering && (centering.front || centering.back)) body.centering = centering
  return JSON.stringify(body)
}

async function postAndParse(photos: VisionPhotos, centering?: CenteringToSend | null): Promise<VisionCheckPayload> {
  const { frontDataUrl, backDataUrl } = photos
  const jsonBody = checkRequestBody(photos, centering)
  const retried = await postCheckWithRetry(jsonBody)
  let payload: unknown
  try {
    payload = await retried.json()
  } catch {
    throw new VisionRequestError('The photo check did not answer.', retried.status, { retryable: true })
  }
  if (retried.status === 429) {
    const err = payload as { cap?: number; used?: number }
    throw new VisionCapError(Number(err.cap) || 60, Number(err.used) || 0)
  }
  const code = visionErrorField(payload, 'error')
  const reason = visionErrorField(payload, 'reason')
  if (!retried.ok) throw new VisionRequestError(visionErrorMessage(payload, retried.status), retried.status, { code, reason })
  const check = asVisionCheck(payload)
  if (!check) {
    throw new VisionRequestError('The photo check answered without a card read.', retried.status, { code, retryable: true })
  }
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
      throw new VisionRequestError('The photo check timed out.', undefined, { retryable: true })
    }
  }
  if (first.status < 500) return first
  try {
    return await attempt()
  } catch {
    throw new VisionRequestError('The photo check timed out.', first.status, { retryable: true })
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
  const sv = (s as { severity?: unknown }).severity
  const cf = (s as { confidence?: unknown }).confidence
  return { flags, notes: typeof s.notes === 'string' ? s.notes : '', severity: isSeverity(sv) ? sv : null, confidence: isConfidence(cf) ? cf : null }
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
      rarity: typeof id.rarity === 'string' && id.rarity.trim() ? id.rarity.trim().toUpperCase() : null,
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
    coverage: r.coverage === 'identify_only' ? 'identify_only' : 'full',
    centering: parseCenteringSummary(r.centering),
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
