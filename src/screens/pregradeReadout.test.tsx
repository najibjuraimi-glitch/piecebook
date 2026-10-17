// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSyntheticCard } from '../lib/centering'
import { PregradeScreen } from './Pregrade'
import { PregradeCardScreen } from './PregradeCard'

const frontPx = makeSyntheticCard({
  width: 1000,
  height: 1400,
  card: { x: 120, y: 100, w: 760, h: 1064 },
  borders: { left: 50, right: 50, top: 50, bottom: 50 },
})
const backPx = makeSyntheticCard({
  width: 1000,
  height: 1400,
  card: { x: 120, y: 100, w: 760, h: 1064 },
  borders: { left: 40, right: 40, top: 40, bottom: 40 },
})

vi.mock('../lib/photoPixels', async () => {
  const actual = await vi.importActual<typeof import('../lib/photoPixels')>('../lib/photoPixels')
  return {
    ...actual,
    loadPhotoFile: async (file: File) => {
      const pixels = file.name.includes('back') ? backPx : frontPx
      return {
        file,
        bitmap: { width: pixels.width, height: pixels.height, close() {} } as ImageBitmap,
        pixels,
      }
    },
  }
})

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function unmountRoute() {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
}

async function renderRoute(path: string) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/pregrade" element={<PregradeScreen />} />
          <Route path="/pregrade/:cardNumber" element={<PregradeCardScreen />} />
        </Routes>
      </MemoryRouter>,
    )
  })
  return host
}

function fileInputs(): HTMLInputElement[] {
  return [...document.querySelectorAll('input[type="file"]')] as HTMLInputElement[]
}

async function upload(input: HTMLInputElement, name: string) {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' })
  const list = { 0: file, length: 1, item: () => file } as unknown as FileList
  Object.defineProperty(input, 'files', { configurable: true, value: list })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
  })
}

function expectReadout(side: 'front' | 'back', pattern: RegExp) {
  const build = document.querySelector(`[data-testid="build-tag-${side}"]`)
  const edge = document.querySelector(`[data-testid="edge-debug-${side}"]`)
  expect(build?.textContent ?? '').toMatch(/^build \S+/)
  expect(edge?.textContent ?? '').toMatch(pattern)
}

function priceText(grade: 'raw' | 'psa9' | 'psa10'): string {
  return document.querySelector(`[data-testid="price-${grade}"]`)?.textContent ?? ''
}

describe('pregrade result readout', () => {
  it('opens the photo check from an old ?p= link and shows only sourced prices', async () => {
    await renderRoute('/pregrade/ST01-007?p=not-a-saved-draft')
    expect(document.body.textContent).toContain('Upload photo')
    expect(document.body.textContent).toContain('Prices')
    expect(priceText('raw')).toContain('US $0.70')
    expect(priceText('raw')).toContain('S$0.90')
    expect(priceText('raw')).toContain('Limitless')
    expect(priceText('raw')).toContain('5 Sep 2026')
    expect(priceText('psa9')).toContain('No price yet')
    expect(priceText('psa9')).not.toMatch(/\$/)
    expect(priceText('psa10')).toContain('No price yet')
    expect(priceText('psa10')).not.toMatch(/\$/)
    expect(document.body.textContent).toContain('S$1.2829 to US $1')
    expect(document.body.textContent).not.toContain('Mark submitted')
    expect(document.body.textContent).not.toContain('Save draft')
    expect(document.body.textContent).not.toContain('PSA population')
    expect(document.body.textContent).not.toContain('Solds you typed')
  })

  it('says no price yet for every grade when the seed has no market', async () => {
    await renderRoute('/pregrade/EB05-033?p=whatever')
    for (const grade of ['raw', 'psa9', 'psa10'] as const) {
      expect(priceText(grade)).toContain('No price yet')
      expect(priceText(grade)).not.toMatch(/\$/)
    }
    expect(document.body.textContent).not.toContain('Mark submitted')
    expect(document.body.textContent).not.toContain('European Central Bank')
  })

  it('shows the build and the per-side notes on /pregrade after an upload', async () => {
    await renderRoute('/pregrade')
    const [front, back] = fileInputs()
    await upload(front, 'front.jpg')
    await upload(back, 'back.jpg')
    expectReadout('front', /px on \d+\/\d+ rows/)
    expectReadout('back', /px on \d+\/\d+ rows/)
    expect(document.body.textContent).not.toContain('cannot be a 10')
  })

  it('shows the build and the per-side notes on /pregrade/:cardNumber after an upload', async () => {
    await renderRoute('/pregrade/ST01-007')
    const [front, back] = fileInputs()
    await upload(front, 'front.jpg')
    await upload(back, 'back.jpg')
    expectReadout('front', /px on \d+\/\d+ rows/)
    expectReadout('back', /px on \d+\/\d+ rows/)
    expect(document.body.textContent).toContain('AI estimate, not a grade')
    expect(document.body.textContent).toContain('Prices')
    expect(document.body.textContent).not.toContain('Save draft')
    expect(document.body.textContent).not.toContain('cannot be a 10')
  })

  it('offers save flattened photo only with ?debug=1', async () => {
    await renderRoute('/pregrade')
    expect(document.body.textContent).not.toContain('Save flattened photo')
    unmountRoute()
    await renderRoute('/pregrade?debug=1')
    expect(document.querySelector('[data-testid="save-flat-front"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="save-flat-back"]')).toBeTruthy()
    unmountRoute()
    await renderRoute('/pregrade/ST01-007')
    expect(document.body.textContent).not.toContain('Save flattened photo')
    unmountRoute()
    await renderRoute('/pregrade/ST01-007?debug=1')
    expect(document.querySelector('[data-testid="save-flat-front"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="save-flat-back"]')).toBeTruthy()
  })

  it('shows a sourced Japanese PSA 10 and leaves PSA 9 empty', async () => {
    await renderRoute('/pregrade/OP05-100p2')
    expect(priceText('raw')).toContain('US $133.85')
    expect(priceText('raw')).toContain('ungraded TCGplayer market')
    expect(priceText('psa9')).toContain('No price yet')
    expect(priceText('psa9')).not.toMatch(/\$/)
    expect(priceText('psa10')).toContain('US $260.00')
    expect(priceText('psa10')).toContain('OP Box Index')
    expect(priceText('psa10')).toContain('Japanese printing · sold median')
    expect(priceText('psa10')).toContain('14 Sep 2026')
    expect(document.querySelector('[data-testid="price-psa10"] a')?.getAttribute('href')).toBe(
      'https://opboxindex.com/cards/op05-100-enel-100-sp.html',
    )
    expect(document.body.textContent).not.toContain('Mark submitted')
  })

  it('flags a borderless print from seed metadata and reads centering from the back', async () => {
    await renderRoute('/pregrade/EB04-007p2')
    const [front, back] = fileInputs()
    await upload(front, 'front.jpg')
    await upload(back, 'back.jpg')
    expect(document.body.textContent).toContain('Front centering not applicable (full art)')
    expect(document.body.textContent).toContain('Centering does not rule a 10 out. From the back only.')
    expect(document.body.textContent).toContain('10 not ruled out')
    expect(document.body.textContent).not.toContain('print border could be read')
  })
})
