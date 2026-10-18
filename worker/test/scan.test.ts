import { describe, expect, it } from 'vitest'
import { singaporeToday } from '../../src/lib/boughtBook.ts'
import { storedQuote } from '../src/storedPrice.js'
import worker from '../src/index.js'
import { VisionCap } from '../src/cap.js'
import { matchScan } from '../../src/lib/scanMatch.ts'
import { boxFrom2d, cropScale, dropDisagreedBoxes, normaliseBox, normaliseScanSights } from '../src/scan.js'
import { seedPrints } from '../src/storedPrice.js'

class MemoryKV {
  store = new Map<string, string>()
  async get(name: string) {
    return this.store.get(name) ?? null
  }
  async put(name: string, value: string) {
    this.store.set(name, value)
  }
}

const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
const DAY = singaporeToday(Date.now())

const cards = {
  cards: [
    {
      row: 0,
      col: 0,
      box: { x: 0.05, y: 0.1, w: 0.2, h: 0.3 },
      code: 'OP09-004p2',
      name: 'Shanks',
      language: 'EN',
      parallel: 'manga',
      confidence: 0.94,
      sticker_amount: 40,
      sticker_currency: 'SGD',
      condition_judge: 'estimate',
      condition_confidence: 'low',
      whitening: true,
      surface: ['scratch'],
      left_right: '55/45',
      top_bottom: '50/50',
      condition_note: 'Estimate only.',
    },
    {
      row: 0,
      col: 1,
      code: 'OP09-004',
      name: 'Nami',
      language: 'EN',
      label_text: '2025 One Piece JP EN 2nd Anniversary Set',
      parallel: 'base',
      confidence: 0.9,
      grader: 'PSA',
      grade: '10',
      cert: '999',
      black_label: false,
    },
  ],
}

function answer(body: unknown) {
  return { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(body) }] }, finishReason: 'STOP' }] }
}

function harness(opts: { imageType?: string; imageStatus?: number } = {}) {
  const kv = new MemoryKV()
  const env = { GEMINI_MODEL: 'test-model', GEMINI_API_KEY: 'sk-SECRET-KEY', DAILY_CAP: '60', ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', VISION_CAP: kv }
  const requests: string[] = []
  const modelFetch = async (url: string) => {
    requests.push(url)
    return new Response(JSON.stringify(answer(cards)), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const imageFetch = async () =>
    new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      status: opts.imageStatus ?? 200,
      headers: { 'Content-Type': opts.imageType ?? 'image/jpeg' },
    })
  const run = (body: Record<string, unknown>) =>
    worker.fetch(new Request('https://piecebook-vision.najibjuraimi.workers.dev/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), env, {} as never, { modelFetch, imageFetch })
  return { run, requests, used: () => Number(kv.store.get(`count:${DAY}`) ?? 0) }
}

describe('scan sights', () => {
  it('keeps a fraction box and drops a zero sticker', () => {
    const sights = normaliseScanSights({ cards: [{ row: 1, col: 2, confidence: 2, sticker_amount: 0, code: 'EB04', box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }] })
    expect(sights[0]).toMatchObject({ row: 1, col: 2, confidence: 1, sticker: null, codeText: 'EB04', box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } })
  })

  it('divides pixel boxes by the image size instead of clamping them', () => {
    const box = normaliseBox({ x: 200, y: 400, w: 300, h: 500 }, 1000, 2000)
    expect(box).toEqual({ x: 0.2, y: 0.2, w: 0.3, h: 0.25 })
    expect(normaliseBox({ x: 1564, y: 0, w: 1564, h: 2048 }, 0, 0)).toBeNull()
  })

  it('reads box_2d on a 0 to 1000 scale and drops a box that disagrees with its column', () => {
    expect(boxFrom2d([100, 200, 500, 600])).toEqual({ x: 0.2, y: 0.1, w: 0.4, h: 0.4 })
    expect(boxFrom2d([0.1, 0.2, 0.5, 0.6])).toEqual({ x: 0.2, y: 0.1, w: 0.4, h: 0.4 })
    expect(boxFrom2d([0, 0, 1, 1])).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(boxFrom2d([0, 0, 1000, 1100])).toBeNull()
    expect(boxFrom2d([0, 0, 0, 400])).toBeNull()
    const sights = normaliseScanSights({
      cards: [
        { row: 0, col: 0, confidence: 1, box_2d: [0, 600, 400, 900], code: '#106', set: 'EB04' },
        { row: 0, col: 1, confidence: 1, box_2d: [0, 100, 400, 400], code: 'OP09-004' },
      ],
    })
    expect(sights[0]).toMatchObject({ code: '#106', setCode: 'EB04' })
    const named = normaliseScanSights({ cards: [{ row: 0, col: 0, confidence: 1, code: '#061', set_name: 'EN 2ND ANNIVERSARY SET' }] })
    expect(named[0].setCode).toBe('EN 2ND ANNIVERSARY SET')
    expect(cropScale(100, 40)).toBe(1)
    expect(cropScale(800, 400)).toBe(1)
    expect(cropScale(2000, 1000)).toBe(0.8)
    const dropped = dropDisagreedBoxes(sights)
    expect(dropped[0].box).toBeNull()
    expect(dropped[1].box).toBeNull()
  })

  it('keeps Ace OP13-002 distinct from Ace ST13-002', () => {
    const raw = {
      cards: [
        { row: 0, col: 0, code: 'OP13-002', name: 'Ace', language: 'EN', confidence: 0.93 },
        { row: 0, col: 1, code: 'ST13-002', name: 'Portgas.D.Ace', language: 'EN', confidence: 0.91 },
      ],
    }
    const scan = matchScan({
      sights: normaliseScanSights(raw),
      prints: seedPrints(),
      quoteFor: () => null,
      today: '2026-10-18',
    })
    expect(scan.cards.map((card) => card.codeText)).toEqual(['OP13-002', 'ST13-002'])
    expect(scan.cards[0].candidates.every((id) => id.toUpperCase().startsWith('OP13-002'))).toBe(true)
    expect(scan.cards[1].candidates.every((id) => id.toUpperCase().startsWith('ST13-002'))).toBe(true)
    expect(scan.cards[0].candidates.some((id) => id.toUpperCase().startsWith('ST13'))).toBe(false)
    expect(scan.cards[1].candidates.some((id) => id.toUpperCase().startsWith('OP13'))).toBe(false)
    expect(scan.cards[0].printId === null || scan.cards[0].printId.startsWith('OP13-002')).toBe(true)
    expect(scan.cards[1].printId === null || scan.cards[1].printId.startsWith('ST13-002')).toBe(true)
  })
})

describe('stored manual price', () => {
  it('returns the typed PSA 10 for Shanks Silver and no raw price', () => {
    expect(storedQuote('OP09-004p4', 'psa10')).toMatchObject({ usd: 1350.5, source: 'PriceCharting', detail: 'manual' })
    expect(storedQuote('OP09-004p4', 'raw')).toBeNull()
  })
})

describe('vision cap', () => {
  it('counts two charges once each', async () => {
    const storage = new Map<string, number>()
    const cap = new VisionCap({ storage: { get: async (key: string) => storage.get(key), put: async (key: string, value: number) => { storage.set(key, value) } } })
    const hold = () => cap.fetch(new Request('https://vision-cap/reserve?day=2026-10-18&cap=60'))
    const [first, second] = await Promise.all([hold(), hold()])
    const bodies = [await first.json(), await second.json()]
    expect(bodies.map((body: { used: number }) => body.used).sort()).toEqual([1, 2])
    expect(bodies.every((body: { held: boolean }) => body.held)).toBe(true)
    const released = await (await cap.fetch(new Request('https://vision-cap/release?day=2026-10-18&cap=60'))).json()
    expect(released.used).toBe(1)
  })
})

describe('POST /scan', () => {
  it('prices a confident English print, refuses the JP label, and does not keep the photo', async () => {
    const h = harness()
    const response = await h.run({ image: PIXEL, caption: '', lotAskSgd: 100 })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.imageStored).toBe(false)
    expect(body.cards[0]).toMatchObject({ printId: 'OP09-004p2', language: 'EN', condition: { whitening: true, judge: 'estimate' } })
    expect(body.cards[0].box).toEqual({ x: 0.05, y: 0.1, w: 0.2, h: 0.3 })
    expect(body.cards[0].crop).toBeNull()
    expect(body.cards[1]).toMatchObject({ language: 'JP', priced: false, certUrl: 'https://www.psacard.com/cert/999' })
    expect(body.cards[1].street.sgd).toBeNull()
    expect(body.usage.today).toBe(1)
    expect(h.used()).toBe(1)
    expect(JSON.stringify(body)).not.toContain('sk-SECRET-KEY')
    expect(h.requests[0]).toContain('generateContent')
  })

  it('does not count a failed model call against the daily cap', async () => {
    const kv = new MemoryKV()
    const env = { GEMINI_MODEL: 'test-model', GEMINI_API_KEY: 'sk-SECRET-KEY', DAILY_CAP: '60', ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', VISION_CAP: kv }
    const modelFetch = async () => new Response('upstream down', { status: 503 })
    const response = await worker.fetch(new Request('https://piecebook-vision.najibjuraimi.workers.dev/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: PIXEL }),
    }), env, {} as never, { modelFetch, imageFetch: async () => new Response(null, { status: 500 }) })
    expect(response.status).toBe(502)
    expect(Number(kv.store.get(`count:${DAY}`) ?? 0)).toBe(0)
  })

  it('refuses a listing page and does not call the model', async () => {
    const h = harness({ imageType: 'text/html' })
    const response = await h.run({ imageUrl: 'https://www.carousell.com.sg/p/some-lot' })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'not_an_image' })
    expect(h.requests).toHaveLength(0)
    expect(h.used()).toBe(0)
  })

  it('fetches an image URL the caller sent and still does not store it', async () => {
    const h = harness()
    const response = await h.run({ imageUrl: 'https://images.example/card.jpg' })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.cards[0].imageUrl).toBe('https://images.example/card.jpg')
    expect(body.imageStored).toBe(false)
  })

  it('reports scans left without charging the cap', async () => {
    const kv = new MemoryKV()
    const env = { GEMINI_MODEL: 'test-model', GEMINI_API_KEY: 'sk-SECRET-KEY', DAILY_CAP: '60', ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', VISION_CAP: kv }
    const response = await worker.fetch(new Request('https://piecebook-vision.najibjuraimi.workers.dev/scan'), env, {} as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ usage: { today: 0, cap: 60 } })
    expect(kv.store.size).toBe(0)
  })
})
