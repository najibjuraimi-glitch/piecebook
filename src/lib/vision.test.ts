import { describe, expect, it } from 'vitest'
import {
  asVisionCheck,
  cardLanguageLabel,
  isNonEnglishCardLanguage,
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
})

describe('visionErrorMessage', () => {
  it('shows the Worker error and detail instead of a silent failure', () => {
    expect(visionErrorMessage({ error: 'model_error', status: 503, detail: 'upstream timeout' }, 502)).toBe(
      'model_error — upstream timeout',
    )
    expect(visionErrorMessage({ error: 'too_large', hint: 'downscale to ~1600px long edge' }, 413)).toBe(
      'too_large — downscale to ~1600px long edge',
    )
    expect(visionErrorMessage(null, 502)).toBe('The photo check could not run (502).')
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
