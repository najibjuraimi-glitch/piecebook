import { describe, expect, it } from 'vitest'
import { singaporeToday } from '../../src/lib/boughtBook.ts'
import worker from '../src/index.js'
import { normaliseBox, normaliseScanSights } from '../src/scan.js'

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
      name: 'Nami',
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
    expect(body.cards[1]).toMatchObject({ language: 'JP', priced: false, certUrl: 'https://www.psacard.com/cert/999' })
    expect(body.cards[1].street.sgd).toBeNull()
    expect(body.usage.today).toBe(1)
    expect(h.used()).toBe(1)
    expect(JSON.stringify(body)).not.toContain('sk-SECRET-KEY')
    expect(h.requests[0]).toContain('generateContent')
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
})
