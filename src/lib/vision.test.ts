import { describe, expect, it } from 'vitest'
import { centeringFromBorders } from './centeringSummary'
import {
  asVisionCheck,
  cardLanguageLabel,
  checkRequestBody,
  isNonEnglishCardLanguage,
  isRetryableVisionFailure,
  normalizeCardLanguage,
  postCheckWithRetry,
  VisionRequestError,
  visionErrorMessage,
} from './vision'

describe('normalizeCardLanguage', () => {
  it('keeps EN JP CN KR FR', () => {
    expect(normalizeCardLanguage('EN')).toBe('EN')
    expect(normalizeCardLanguage('jp')).toBe('JP')
    expect(normalizeCardLanguage('CN')).toBe('CN')
    expect(normalizeCardLanguage('kr')).toBe('KR')
    expect(normalizeCardLanguage('FR')).toBe('FR')
  })

  it('maps common names and prefixes', () => {
    expect(normalizeCardLanguage('English')).toBe('EN')
    expect(normalizeCardLanguage('Japanese')).toBe('JP')
    expect(normalizeCardLanguage('JPN')).toBe('JP')
    expect(normalizeCardLanguage('Chinese')).toBe('CN')
    expect(normalizeCardLanguage('Korean')).toBe('KR')
    expect(normalizeCardLanguage('French')).toBe('FR')
  })

  it('returns null when the text is missing or unknown', () => {
    expect(normalizeCardLanguage(null)).toBeNull()
    expect(normalizeCardLanguage('')).toBeNull()
    expect(normalizeCardLanguage('IT')).toBeNull()
    expect(normalizeCardLanguage(12)).toBeNull()
  })
})

describe('card language helpers', () => {
  it('labels a missing read as not read', () => {
    expect(cardLanguageLabel(null)).toBe('not read')
    expect(cardLanguageLabel('EN')).toBe('EN')
  })

  it('treats only a named non-EN code as non-English', () => {
    expect(isNonEnglishCardLanguage('JP')).toBe(true)
    expect(isNonEnglishCardLanguage('EN')).toBe(false)
    expect(isNonEnglishCardLanguage(null)).toBe(false)
  })
})

describe('asVisionCheck language', () => {
  function payload(language: unknown) {
    return {
      identify: {
        set_code: 'ST14-003',
        name: 'Sanji',
        parallel_guess: 'base',
        language,
        confidence: 0.8,
        read_text: 'Sanji',
      },
      condition: {
        corners: { flags: [], notes: '' },
        edges: { flags: [], notes: '' },
        surface: { flags: [], notes: '' },
        psa10_ruled_out: false,
        reasons: [],
      },
    }
  }

  it('reads identify.language from the Worker payload', () => {
    const check = asVisionCheck(payload('JP'))
    expect(check?.identify.language).toBe('JP')
  })

  it('nulls an unknown language instead of passing it through', () => {
    expect(asVisionCheck(payload('Deutsch'))?.identify.language).toBeNull()
    expect(asVisionCheck(payload(null))?.identify.language).toBeNull()
  })

  it('reads the centering block when the Worker echoes one and leaves it null otherwise', () => {
    expect(asVisionCheck(payload('EN'))?.centering).toBeNull()
    const withCentering = { ...payload('EN'), centering: { source: 'device', front: { left: 60, right: 40, top: 50, bottom: 50 }, back: null } }
    const check = asVisionCheck(withCentering)
    expect(check?.centering).toMatchObject({ cannotBeTen: true, front: { leftRight: '60/40' }, back: null })
    expect(check?.centering?.verdict).toBe('Cannot be a 10 by centering: front 60/40 left to right is over 55/45.')
  })

  it('defaults coverage to full and tolerates the Worker no longer sending read_text', () => {
    const p = payload('EN') as { identify: Record<string, unknown>; coverage?: string }
    delete p.identify.read_text
    p.identify.rarity = 'sr'
    const check = asVisionCheck(p)
    expect(check?.coverage).toBe('full')
    expect(check?.identify.read_text).toBe('')
    expect(check?.identify.rarity).toBe('SR')
  })

  it('keeps identify_only coverage with an empty condition', () => {
    const check = asVisionCheck({ ...payload('EN'), coverage: 'identify_only' })
    expect(check?.coverage).toBe('identify_only')
    expect(check?.condition.psa10_ruled_out).toBe(false)
    expect(asVisionCheck({ ...payload('EN'), coverage: 'whatever' })?.coverage).toBe('full')
  })
})

describe('checkRequestBody', () => {
  it('sends the photos alone when nothing was measured, and the centering block when it was', () => {
    const photos = { frontDataUrl: 'data:image/jpeg;base64,AAAA', backDataUrl: 'data:image/jpeg;base64,BBBB' }
    expect(JSON.parse(checkRequestBody(photos))).toEqual({ front: photos.frontDataUrl, back: photos.backDataUrl })
    expect(JSON.parse(checkRequestBody(photos, { front: null, back: null }))).toEqual({ front: photos.frontDataUrl, back: photos.backDataUrl })
    const front = centeringFromBorders('front', 55, 45, 50, 50)
    const body = JSON.parse(checkRequestBody({ frontDataUrl: photos.frontDataUrl }, { front, back: null }))
    expect(body.back).toBeUndefined()
    expect(body.centering).toEqual({ front, back: null })
  })
})

describe('VisionRequestError blocked', () => {
  it('is never retryable and carries the photos for the worksheet', () => {
    const err = new VisionRequestError('declined', 502, {
      code: 'unparseable_model_output',
      reason: 'blocked',
      photos: { frontDataUrl: 'data:image/jpeg;base64,AAAA' },
    })
    expect(err.blocked).toBe(true)
    expect(err.retryable).toBe(false)
    expect(err.photos?.frontDataUrl).toBe('data:image/jpeg;base64,AAAA')
    expect(new VisionRequestError('x', 502, { code: 'unparseable_model_output', reason: 'max_tokens' }).blocked).toBe(false)
    expect(isRetryableVisionFailure('unparseable_model_output', 502, 'blocked')).toBe(false)
  })
})

describe('visionErrorMessage', () => {
  it('shows the Worker error and detail instead of a silent failure', () => {
    expect(visionErrorMessage({ error: 'too_large', hint: 'downscale to ~1600px long edge' }, 413)).toBe(
      'too_large — downscale to ~1600px long edge',
    )
    expect(visionErrorMessage(null, 502)).toBe('The photo check could not run (502).')
  })

  it('turns model failures into plain words, preferring the Worker hint', () => {
    expect(
      visionErrorMessage(
        { error: 'unparseable_model_output', status: 200, reason: 'max_tokens', detail: 'The model ran out of room before answering. Try again.' },
        502,
      ),
    ).toBe('The model ran out of room before answering. Try again.')
    expect(visionErrorMessage({ error: 'unparseable_model_output', status: 200 }, 502)).toBe(
      'The photo check got a garbled answer from the model.',
    )
    expect(visionErrorMessage({ error: 'model_error', status: 503, detail: 'upstream timeout' }, 502)).toBe('upstream timeout')
    expect(
      visionErrorMessage(
        { error: 'model_error', status: 400, reason: 'region_unsupported', detail: 'AI check unavailable from this region right now, try again.', upstream: 'FAILED_PRECONDITION: User location is not supported for the API use.' },
        502,
      ),
    ).toBe('AI check unavailable from this region right now, try again.')
    expect(new VisionRequestError('x', 502, { code: 'model_error', reason: 'region_unsupported' })).toMatchObject({ retryable: true, blocked: false })
    expect(visionErrorMessage({ error: 'model_error', status: 0 }, 502)).toBe('The photo check’s model did not answer.')
  })
})

describe('isRetryableVisionFailure', () => {
  it('marks model hiccups, 5xx and timeouts as worth another tap', () => {
    expect(isRetryableVisionFailure('unparseable_model_output', 502)).toBe(true)
    expect(isRetryableVisionFailure('model_error', 502)).toBe(true)
    expect(isRetryableVisionFailure(undefined, 503)).toBe(true)
    expect(isRetryableVisionFailure(undefined, undefined)).toBe(true)
  })
  it('does not retry the caller’s own mistakes', () => {
    expect(isRetryableVisionFailure('too_large', 413)).toBe(false)
    expect(isRetryableVisionFailure('front_required', 400)).toBe(false)
    expect(isRetryableVisionFailure(undefined, 401)).toBe(false)
  })
  it('is carried by VisionRequestError', () => {
    expect(new VisionRequestError('x', 502, { code: 'unparseable_model_output' }).retryable).toBe(true)
    expect(new VisionRequestError('x', 413, { code: 'too_large' }).retryable).toBe(false)
    expect(new VisionRequestError('x', undefined, { retryable: true }).retryable).toBe(true)
  })
})

describe('postCheckWithRetry', () => {
  type Step = number | 'throw' | 'hang'
  function fakeFetch(steps: Step[]) {
    const calls: number[] = []
    const fetchImpl: typeof fetch = (_input, init) => {
      const step = steps[calls.length] ?? 200
      calls.push(Date.now())
      if (step === 'throw') return Promise.reject(new TypeError('network'))
      if (step === 'hang') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
      }
      return Promise.resolve(new Response('{}', { status: step }))
    }
    return { fetchImpl, calls }
  }
  const url = 'https://vision.test/check'

  it('returns a 2xx on the first try without retrying', async () => {
    const f = fakeFetch([200])
    const res = await postCheckWithRetry('{}', { fetch: f.fetchImpl, url })
    expect(res.status).toBe(200)
    expect(f.calls).toHaveLength(1)
  })

  it('does not retry a 4xx such as the daily cap', async () => {
    const f = fakeFetch([429, 200])
    const res = await postCheckWithRetry('{}', { fetch: f.fetchImpl, url })
    expect(res.status).toBe(429)
    expect(f.calls).toHaveLength(1)
  })

  it('retries once on a 5xx and stops after the second answer', async () => {
    const ok = fakeFetch([502, 200])
    expect((await postCheckWithRetry('{}', { fetch: ok.fetchImpl, url })).status).toBe(200)
    expect(ok.calls).toHaveLength(2)
    const bad = fakeFetch([502, 503, 200])
    expect((await postCheckWithRetry('{}', { fetch: bad.fetchImpl, url })).status).toBe(503)
    expect(bad.calls).toHaveLength(2)
  })

  it('retries once after a timeout and gives a VisionRequestError after the second', async () => {
    const recovered = fakeFetch(['hang', 200])
    expect((await postCheckWithRetry('{}', { fetch: recovered.fetchImpl, url, timeoutMs: 20 })).status).toBe(200)
    expect(recovered.calls).toHaveLength(2)
    const dead = fakeFetch(['hang', 'hang', 200])
    await expect(postCheckWithRetry('{}', { fetch: dead.fetchImpl, url, timeoutMs: 20 })).rejects.toBeInstanceOf(
      VisionRequestError,
    )
    expect(dead.calls).toHaveLength(2)
  })

  it('a 5xx followed by a network drop never makes a third request', async () => {
    const f = fakeFetch([500, 'throw', 200])
    await expect(postCheckWithRetry('{}', { fetch: f.fetchImpl, url })).rejects.toBeInstanceOf(VisionRequestError)
    expect(f.calls).toHaveLength(2)
  })
})
