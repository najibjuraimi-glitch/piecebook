// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BidCalculator } from './BidCalculator'

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  vi.unstubAllGlobals()
})

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const marketRow = {
  id: 'WL-0004',
  code: 'OP10-119',
  grade: 'Raw',
  targetSgd: null,
  notes: '',
  added: '2026-10-01',
  marketSgd: 100,
  marketAsOf: '2026-09-01',
  marketSource: 'Cards',
  marketUrl: 'https://example.com/card',
  priceSgd: null,
  source: null,
  asOf: null,
  url: null,
  priceLabel: 'No price yet',
  hit: false,
  stale: false,
}

describe('All-in calculator', () => {
  it('shows each component for a hammer', () => {
    act(() => {
      root!.render(
        <MemoryRouter initialEntries={['/bid']}>
          <Routes>
            <Route path="/bid" element={<BidCalculator />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    const button = [...host!.querySelectorAll('button')].find((el) => el.textContent === 'Goldin 22%')
    act(() => button!.click())
    const hammer = host!.querySelector('#_r_0_-hammer, [id$="-hammer"]') as HTMLInputElement
    const shipping = host!.querySelector('[id$="-shipping"]') as HTMLInputElement
    const forwarder = host!.querySelector('[id$="-forwarder"]') as HTMLInputElement
    const fx = host!.querySelector('[id$="-fx"]') as HTMLInputElement
    const fxDate = host!.querySelector('[id$="-fx-date"]') as HTMLInputElement
    act(() => {
      typeInto(hammer, '100')
      typeInto(shipping, '5')
      typeInto(forwarder, '10')
      typeInto(fx, '1.3')
      typeInto(fxDate, '2026-10-01')
    })
    const body = host!.textContent ?? ''
    expect(body).toContain('S$190.86')
    expect(body).toContain("Buyer's premium 22%")
    expect(body).toContain('Seller shipping')
    expect(body).toContain('Forwarder')
    expect(body).toContain('GST 9%')
    expect(body).toContain('1 Oct 2026')
    expect(body).not.toContain('Japanese')
  })

  it('prefills a max bid from 0.9 times the manual English price', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ revision: 1, items: [marketRow] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    )
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/bid?item=WL-0004']}>
          <Routes>
            <Route path="/bid" element={<BidCalculator />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    const body = host!.textContent ?? ''
    expect(body).toContain('OP10-119 · Raw')
    expect(body).toContain('0.9 × S$100')
    expect(body).toContain('Cards')
    expect(body).toContain('1 Sep 2026')
    expect(body).toContain('Stale, older than 7 days')
    const target = host!.querySelector('[id$="-target"]') as HTMLInputElement
    expect(target.value).toBe('90')
    expect(body).not.toContain('Japanese')
  })
})
