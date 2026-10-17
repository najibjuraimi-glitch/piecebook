// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSyntheticCard } from '../lib/centering'
import { savePrediction, removePrediction, type PredictionDraft } from '../store/predictions'
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

function draft(id: string): PredictionDraft {
  const centering = {
    left: 50,
    right: 50,
    top: 40,
    bottom: 60,
    lrLabel: '50/50',
    tbLabel: '60/40',
    worseLabel: '60/40',
    worseLargerPct: 60,
    cannotBeTen: true,
    resolved: true,
    edgeNotes: {
      left: '50px on 18/21',
      right: '50px on 18/21',
      top: '40px on 16/21',
      bottom: '60px on 17/21',
    },
  }
  return {
    id,
    cardNumber: 'ST01-007',
    cardName: 'Nami',
    photos: [
      { side: 'front', fileName: 'front.jpg', width: 1000, height: 1400, centering },
      {
        side: 'back',
        fileName: 'back.jpg',
        width: 1000,
        height: 1400,
        centering: {
          ...centering,
          top: 30,
          bottom: 30,
          tbLabel: '50/50',
          worseLabel: '50/50',
          worseLargerPct: 50,
          cannotBeTen: false,
          edgeNotes: { left: '30px on 14/21', right: '30px on 14/21', top: '30px on 12/21', bottom: '30px on 15/21' },
        },
      },
    ],
    cannotBeTen: true,
    photoNote: '',
    vision: null,
    pop: null,
    raw: null,
    v9: null,
    v10: null,
    v8: null,
    shipToPortlandUsd: null,
    shipToPsaUsd: null,
    buyAndShipUsd: null,
    months: 5,
    monthlyDrift: 0,
    verdict: null,
    reason: null,
    evUsd: null,
    costInUsd: null,
    maxBuyUsd: null,
    bestExit: null,
    p10: null,
    p10Band: null,
    actualGrade: null,
  }
}

let root: Root | null = null
let host: HTMLDivElement | null = null
let storedId: string | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  if (storedId) removePrediction(storedId)
  storedId = null
})

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

describe('pregrade result readout', () => {
  it('shows the build and the per-side notes on /pregrade/:cardNumber', async () => {
    const saved = savePrediction(draft('readout-stored'))
    storedId = saved.id
    await renderRoute(`/pregrade/ST01-007?p=${encodeURIComponent(saved.id)}`)
    expectReadout('front', /left: 50px on 18\/21/)
    expectReadout('back', /bottom: 30px on 15\/21/)
    expect(document.body.textContent).toContain('AI estimate, not a grade')
  })

  it('shows the build and the per-side notes on /pregrade after an upload', async () => {
    await renderRoute('/pregrade')
    const [front, back] = fileInputs()
    await upload(front, 'front.jpg')
    await upload(back, 'back.jpg')
    expectReadout('front', /px on \d+\/21/)
    expectReadout('back', /px on \d+\/21/)
    expect(document.body.textContent).not.toContain('cannot be a 10')
  })

  it('shows the build and the per-side notes on /pregrade/:cardNumber after an upload', async () => {
    await renderRoute('/pregrade/ST01-007')
    const [front, back] = fileInputs()
    await upload(front, 'front.jpg')
    await upload(back, 'back.jpg')
    expectReadout('front', /px on \d+\/21/)
    expectReadout('back', /px on \d+\/21/)
    expect(document.body.textContent).toContain('AI estimate, not a grade')
    expect(document.body.textContent).not.toContain('cannot be a 10')
  })
})
