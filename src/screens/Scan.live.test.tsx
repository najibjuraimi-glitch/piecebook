// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayIso } from '../lib/format'
import { ScanScreen } from './Scan'

let root: Root | null = null
let host: HTMLDivElement | null = null
const scans: string[] = []
let drawn: { w: number; h: number }[] = []
let pan = 0

const enCard = {
  index: 0,
  row: 0,
  col: 0,
  box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
  imageUrl: null,
  crop: null,
  name: 'Ace',
  codeText: 'OP13-002',
  language: 'EN',
  languageUnsure: false,
  printId: 'OP13-002',
  parallel: null,
  confidence: 0.95,
  lowConfidence: false,
  ambiguous: false,
  candidates: [],
  priced: true,
  forSale: true,
  sticker: { amount: 10, currency: 'SGD' },
  bundle: null,
  street: { status: 'fresh', sgd: 100, source: 'Limitless', asOf: '2026-10-18', url: null, stale: false, label: null, detail: null, sources: [], sourcesDisagree: false, evidence: [] },
  gapSgd: 90,
  gapPct: 90,
  underStreet: true,
  targetHit: false,
  watchId: null,
  liked: null,
  slab: { grader: 'PSA', grade: '10', cert: null, year: null, setName: null, blackLabel: false },
  certUrl: null,
  condition: { judge: 'estimate', confidence: null, whitening: false, surface: [], leftRight: null, topBottom: null, note: '' },
  drag: null,
  collection: false,
  contributionSgd: 90,
}

const jpCard = {
  ...enCard,
  index: 1,
  col: 1,
  box: { x: 0.55, y: 0.2, w: 0.3, h: 0.4 },
  name: 'Luffy',
  codeText: 'EB04-003',
  language: 'JP',
  printId: 'EB04-003',
  priced: false,
  sticker: { amount: 8, currency: 'SGD' },
  street: { ...enCard.street, status: 'none', sgd: null, source: null, asOf: null },
  gapSgd: null,
  gapPct: null,
  underStreet: false,
  contributionSgd: null,
  slab: { grader: 'PSA', grade: '9', cert: null, year: null, setName: null, blackLabel: false },
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function installPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('pointer: coarse') ? coarse : false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false
    },
  })) as typeof window.matchMedia
}

function installCamera(mode: 'ok' | 'denied' | 'missing') {
  const getUserMedia =
    mode === 'missing'
      ? undefined
      : mode === 'denied'
        ? async () => {
            throw new DOMException('denied', 'NotAllowedError')
          }
        : async () => {
            const track = { stop() {} }
            return { getTracks: () => [track], getVideoTracks: () => [track] }
          }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: getUserMedia ? { getUserMedia } : {},
  })
}

beforeEach(() => {
  scans.length = 0
  drawn = []
  pan = 0
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installPointer(false)
  installCamera('missing')
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1280 })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 720 })
  HTMLVideoElement.prototype.play = () => Promise.resolve()
  Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', { configurable: true, writable: true, value: null })
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    const canvas = this
    return {
      drawImage() {
        drawn.push({ w: canvas.width, h: canvas.height })
      },
      getImageData(_x: number, _y: number, w: number, h: number) {
        const data = new Uint8ClampedArray(w * h * 4)
        const cell = 16
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const sx = x + pan
            const id = Math.floor(sx / cell) * 13 + Math.floor(y / cell) * 29
            const v = sx % cell < 2 || y % cell < 2 ? 16 : 40 + (Math.abs(id * 17) % 180)
            const i = (y * w + x) * 4
            data[i] = data[i + 1] = data[i + 2] = v
            data[i + 3] = 255
          }
        }
        return { data, width: w, height: h }
      },
    }
  } as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
    callback(new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/jpeg' }))
  }
  vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method || 'GET').toUpperCase()
    if (url.endsWith('/scan') && method === 'GET') return json({ usage: { today: 50, cap: 60 } })
    if (url.endsWith('/scan')) {
      scans.push(url)
      return json({
        cards: [enCard, jpCard],
        lotAskSgd: null,
        lotAskAmount: null,
        lotAskCurrency: null,
        lotStreetSgd: 100,
        lotGapSgd: null,
        maxOfferSgd: 90,
        bundles: [],
        usage: { today: 4, cap: 60 },
        targets: [],
      })
    }
    if (url.endsWith('/watchlist')) return json({ revision: 0, items: [] })
    if (url.endsWith('/holdings')) return json({ revision: 0, copies: [], history: [] })
    return json({ error: 'no' }, 404)
  })
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.unstubAllGlobals()
})

function scanPayload(cards: unknown[]) {
  return {
    cards,
    lotAskSgd: null,
    lotAskAmount: null,
    lotAskCurrency: null,
    lotStreetSgd: 100,
    lotGapSgd: null,
    maxOfferSgd: 90,
    bundles: [],
    usage: { today: 4, cap: 60 },
    targets: [],
  }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

async function waitUntil(pred: () => boolean, ms: number) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (pred()) return true
    await wait(200)
  }
  return pred()
}

async function renderScan() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <ScanScreen />
      </MemoryRouter>,
    )
  })
  await settle()
  return host
}

describe('scan camera', () => {
  it('starts on upload for a desktop pointer and falls back to the file picker without a camera', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const view = await renderScan()
    expect(view.querySelector('[data-testid="scan-live"]')).toBeNull()
    expect(view.textContent).toContain('Upload photo')
    expect(view.querySelector('#scan-file')?.getAttribute('aria-label')).toBe('Photo')
    const camera = [...view.querySelectorAll('button')].find((button) => button.textContent === 'Scan with camera')
    await act(async () => {
      camera?.click()
    })
    expect(view.textContent).toContain('No camera on this device. Upload a photo instead.')
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })

  it('opens the live view on a phone and keeps the manual shutter', async () => {
    installPointer(true)
    installCamera('ok')
    const view = await renderScan()
    expect(view.querySelector('[data-testid="scan-live"]')).not.toBeNull()
    expect(view.querySelector('[data-testid="scan-shutter"]')).not.toBeNull()
    expect(view.querySelector('[data-testid="scan-pause"]')?.textContent).toBe('Pause')
    expect(view.querySelector('[data-testid="scan-cap"]')?.textContent).toBe('10 left')
    expect(view.querySelector('[data-testid="scan-cap"]')?.getAttribute('data-low')).toBe('true')
    expect(scans).toHaveLength(0)
  })

  it('sends a full-resolution frame from the shutter and labels EN and JP', async () => {
    installPointer(true)
    installCamera('ok')
    const view = await renderScan()
    expect(view.textContent).not.toContain('Starting the camera')
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-pause"]')?.click()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600))
    })
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-shutter"]')?.click()
    })
    await settle()
    await settle()
    expect(scans).toHaveLength(1)
    expect(drawn).toContainEqual({ w: 1280, h: 720 })
    const en = view.querySelector('[data-testid="scan-label-0"]')
    const jp = view.querySelector('[data-testid="scan-label-1"]')
    expect(en?.textContent).toContain('EN')
    expect(en?.textContent).toContain('OP13-002')
    expect(en?.textContent).toContain('PSA 10')
    expect(en?.getAttribute('data-tone')).toBe('green')
    expect(jp?.textContent).toContain('JP')
    expect(jp?.textContent).toContain('EB04-003')
    expect(jp?.textContent).toContain('PSA 9')
    expect(jp?.textContent).toContain('no JP comp')
    expect(jp?.getAttribute('data-tone')).toBe('muted')
    expect(view.querySelector('[data-testid="scan-cap"]')?.textContent).toBe('56 left')
    await act(async () => {
      jp?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(view.querySelector('[data-testid="scan-row"]')?.textContent).toContain('EB04-003')
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-freeze"]')?.click()
    })
    expect(view.querySelector('[data-testid="scan-live"]')).toBeNull()
    expect(view.textContent).toContain('Fresh English street')
    expect(view.textContent).toContain('EB04-003')
  })

  it('keeps the max lot offer after a frozen row is picked', async () => {
    installPointer(true)
    installCamera('ok')
    const asOf = todayIso()
    vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      if (url.endsWith('/scan') && method === 'GET') return json({ usage: { today: 1, cap: 60 } })
      if (url.endsWith('/scan')) {
        return json({
          cards: [{
            ...enCard,
            name: 'Shanks',
            codeText: 'OP09-004p2',
            printId: 'OP09-004p2',
            slab: null,
            lowConfidence: true,
            ambiguous: true,
            candidates: ['OP09-004p2'],
            priced: true,
            street: { ...enCard.street, sgd: 80, source: 'PriceCharting', asOf, url: 'https://www.pricecharting.com/a', detail: 'manual' },
            contributionSgd: 72,
          }],
          lotAskSgd: null,
          lotAskAmount: null,
          lotAskCurrency: null,
          lotStreetSgd: 80,
          lotGapSgd: null,
          maxOfferSgd: 72,
          bundles: [],
          usage: { today: 2, cap: 60 },
          targets: [{ id: 'WL-0001', printId: 'OP09-004p2', targetSgd: 50, grade: 'raw', marketSgd: 80, marketAsOf: asOf, marketSource: 'PriceCharting', marketUrl: 'https://www.pricecharting.com/a' }],
        })
      }
      if (url.endsWith('/watchlist')) return json({ revision: 0, items: [] })
      if (url.endsWith('/holdings')) return json({ revision: 0, copies: [], history: [] })
      return json({ error: 'no' }, 404)
    })
    const view = await renderScan()
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-pause"]')?.click()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600))
    })
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-shutter"]')?.click()
    })
    await settle()
    await settle()
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-freeze"]')?.click()
    })
    expect(view.textContent).toContain('Max lot offer S$72')
    const pick = [...view.querySelectorAll('button')].find((button) => button.textContent === 'OP09-004p2')
    await act(async () => {
      pick?.click()
    })
    expect(view.textContent).toContain('Max lot offer S$72')
  })

  it('hides labels when the case moves during the read, and disables upload while reading', async () => {
    installPointer(true)
    installCamera('ok')
    let release: (() => void) | null = null
    vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      if (url.endsWith('/scan') && method === 'GET') return json({ usage: { today: 1, cap: 60 } })
      if (url.endsWith('/scan')) {
        scans.push(url)
        return new Promise((resolve) => {
          release = () => resolve(json(scanPayload([enCard, jpCard])))
        })
      }
      if (url.endsWith('/watchlist')) return json({ revision: 0, items: [] })
      if (url.endsWith('/holdings')) return json({ revision: 0, copies: [], history: [] })
      return json({ error: 'no' }, 404)
    })
    const view = await renderScan()
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-pause"]')?.click()
    })
    await wait(1600)
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-shutter"]')?.click()
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
    expect(view.textContent).toContain('reading case, about 30s')
    expect(view.querySelector<HTMLButtonElement>('[data-testid="scan-upload"]')?.disabled).toBe(true)
    pan = 80
    await act(async () => {
      release?.()
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
    expect(view.querySelector('[data-testid="scan-moved"]')?.textContent).toBe('moved, rescanning')
    expect(view.querySelector('[data-testid="scan-label-0"]')).toBeNull()
    expect(view.querySelector('[data-testid="scan-label-1"]')).toBeNull()
    expect(view.textContent).not.toContain('Paused to save scans')
  })

  it('does not pause when the case moves during the read, and the bar keeps moving after 30s', async () => {
    installPointer(true)
    installCamera('ok')
    let release: (() => void) | null = null
    vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      if (url.endsWith('/scan') && method === 'GET') return json({ usage: { today: 1, cap: 60 } })
      if (url.endsWith('/scan')) {
        scans.push(url)
        if (scans.length < 3) return json(scanPayload([]))
        return new Promise((resolve) => {
          release = () => resolve(json(scanPayload([])))
        })
      }
      if (url.endsWith('/watchlist')) return json({ revision: 0, items: [] })
      if (url.endsWith('/holdings')) return json({ revision: 0, copies: [], history: [] })
      return json({ error: 'no' }, 404)
    })
    const view = await renderScan()
    expect(await waitUntil(() => scans.length >= 1, 8000)).toBe(true)
    pan = 40
    expect(await waitUntil(() => scans.length >= 2, 8000)).toBe(true)
    pan = 90
    expect(await waitUntil(() => scans.length >= 3, 8000)).toBe(true)
    pan = 160
    const started = Date.now()
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => started + 31000)
    await wait(400)
    const bar = view.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('data-indeterminate')).toBe('true')
    expect(bar?.hasAttribute('aria-valuenow')).toBe(false)
    clock.mockRestore()
    pan = 200
    await act(async () => {
      release?.()
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
    expect(view.querySelector('[data-testid="scan-moved"]')?.textContent).toBe('moved, rescanning')
    expect(view.querySelector('[data-testid="scan-hold"]')).toBeNull()
    expect(view.textContent).not.toContain('Paused to save scans')
    expect(await waitUntil(() => scans.length >= 4, 12000)).toBe(true)
    expect(view.textContent).not.toContain('Paused to save scans')
  }, 40000)

  it('aborts the scan request when the live view unmounts', async () => {
    installPointer(true)
    installCamera('ok')
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      if (url.endsWith('/scan') && method === 'GET') return Promise.resolve(json({ usage: { today: 1, cap: 60 } }))
      if (url.endsWith('/scan')) {
        signal = init?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
      }
      if (url.endsWith('/watchlist')) return Promise.resolve(json({ revision: 0, items: [] }))
      if (url.endsWith('/holdings')) return Promise.resolve(json({ revision: 0, copies: [], history: [] }))
      return Promise.resolve(json({ error: 'no' }, 404))
    })
    const view = await renderScan()
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-pause"]')?.click()
    })
    await wait(1600)
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-shutter"]')?.click()
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
    expect(signal?.aborted).toBe(false)
    await act(async () => {
      root?.unmount()
      root = null
    })
    expect(signal?.aborted).toBe(true)
  })

  it('does not treat an aborted read as a failed scan', async () => {
    installPointer(true)
    installCamera('ok')
    let posts = 0
    vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      if (url.endsWith('/scan') && method === 'GET') return json({ usage: { today: 1, cap: 60 } })
      if (url.endsWith('/scan')) {
        posts += 1
        scans.push(url)
        if (posts <= 2) throw new DOMException('aborted', 'AbortError')
        return json(scanPayload([enCard]))
      }
      if (url.endsWith('/watchlist')) return json({ revision: 0, items: [] })
      if (url.endsWith('/holdings')) return json({ revision: 0, copies: [], history: [] })
      return json({ error: 'no' }, 404)
    })
    const view = await renderScan()
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-pause"]')?.click()
    })
    await wait(1600)
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-shutter"]')?.click()
    })
    await settle()
    expect(view.textContent).not.toContain('could not be read')
    expect(await waitUntil(() => view.querySelector<HTMLButtonElement>('[data-testid="scan-shutter"]')?.disabled === false, 2500)).toBe(true)
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-shutter"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 80))
    })
    expect(view.textContent).not.toContain('could not be read')
    expect(posts).toBe(2)
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-pause"]')?.click()
    })
    expect(await waitUntil(() => posts >= 3, 4000)).toBe(true)
    expect(view.querySelector('[data-testid="scan-label-0"]')).not.toBeNull()
  }, 12000)

  it('retries a failed read once on the same view, then waits for movement', async () => {
    installPointer(true)
    installCamera('ok')
    vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      if (url.endsWith('/scan') && method === 'GET') return json({ usage: { today: 1, cap: 60 } })
      if (url.endsWith('/scan')) {
        scans.push(url)
        return json({ error: 'read_failed' }, 500)
      }
      if (url.endsWith('/watchlist')) return json({ revision: 0, items: [] })
      if (url.endsWith('/holdings')) return json({ revision: 0, copies: [], history: [] })
      return json({ error: 'no' }, 404)
    })
    await renderScan()
    expect(await waitUntil(() => scans.length >= 2, 10000)).toBe(true)
    expect(scans.length).toBe(2)
    await wait(4500)
    expect(scans.length).toBe(2)
    pan = 80
    expect(await waitUntil(() => scans.length >= 3, 8000)).toBe(true)
  }, 25000)

  it('pauses after three scans with no new cards until the case moves', async () => {
    installPointer(true)
    installCamera('ok')
    vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      if (url.endsWith('/scan') && method === 'GET') return json({ usage: { today: 1, cap: 60 } })
      if (url.endsWith('/scan')) {
        scans.push(url)
        return json(scanPayload([]))
      }
      if (url.endsWith('/watchlist')) return json({ revision: 0, items: [] })
      if (url.endsWith('/holdings')) return json({ revision: 0, copies: [], history: [] })
      return json({ error: 'no' }, 404)
    })
    const view = await renderScan()
    expect(await waitUntil(() => scans.length >= 1, 8000)).toBe(true)
    pan = 40
    expect(await waitUntil(() => scans.length >= 2, 8000)).toBe(true)
    pan = 90
    expect(await waitUntil(() => scans.length >= 3, 8000)).toBe(true)
    expect(await waitUntil(() => (view.textContent || '').includes('Paused to save scans, move or tap to resume'), 2000)).toBe(true)
    const n = scans.length
    await wait(4500)
    expect(scans.length).toBe(n)
    expect(view.querySelector('[data-testid="scan-pause"]')?.textContent).toBe('Resume')
    pan = 160
    await wait(700)
    expect(view.textContent).not.toContain('Paused to save scans, move or tap to resume')
  }, 30000)

  it('stays paused when the case moves during a manual pause', async () => {
    installPointer(true)
    installCamera('ok')
    const view = await renderScan()
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="scan-pause"]')?.click()
    })
    pan = 80
    await wait(2500)
    expect(scans).toHaveLength(0)
    expect(view.querySelector('[data-testid="scan-pause"]')?.textContent).toBe('Resume')
    expect(view.textContent).not.toContain('Paused to save scans')
  })

  it('falls back to the file picker when camera permission is refused', async () => {
    installPointer(false)
    installCamera('denied')
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const view = await renderScan()
    const camera = [...view.querySelectorAll('button')].find((button) => button.textContent === 'Scan with camera')
    await act(async () => {
      camera?.click()
    })
    expect(view.textContent).toContain('Camera permission was refused. You can still upload a photo.')
    expect(view.querySelector('[data-testid="scan-live"]')).toBeNull()
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })
})
