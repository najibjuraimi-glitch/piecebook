// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BidCalculator, hammerShares } from './BidCalculator'

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
    const premium = [...host!.querySelectorAll('button')].find((el) => el.textContent === 'Goldin 22%')
    const gstOn = [...host!.querySelectorAll('button')].find((el) => el.textContent === 'On')
    act(() => {
      premium!.click()
      gstOn!.click()
    })
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
    expect(body).toContain('S$196.25')
    expect(body).toContain('Payment fee 3%')
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
    expect(body).toContain('EN')
    expect(body).toContain('1 Sep 2026')
    expect(body).toContain('Stale, older than 7 days')
    const target = host!.querySelector('[id$="-target"]') as HTMLInputElement
    expect(target.value).toBe('')
    const use = [...host!.querySelectorAll('button')].find((el) => el.textContent === 'Use this target')
    act(() => use!.click())
    expect(target.value).toBe('90')
    expect(body).not.toContain('Japanese')
  })

  it('sets the Fanatics card fee from the premium preset and blocks shipping outside the known tier', () => {
    act(() => {
      root!.render(
        <MemoryRouter initialEntries={['/bid']}>
          <Routes>
            <Route path="/bid" element={<BidCalculator />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    const click = (label: string, group?: string) => {
      const scope = group
        ? [...host!.querySelectorAll('[role="radiogroup"]')].find((el) => el.getAttribute('aria-label') === group)
        : host
      const button = [...scope!.querySelectorAll('button')].find((el) => el.textContent === label)
      act(() => button!.click())
      return button
    }
    click('Max bid')
    click('Fanatics 20%', "Buyer's premium")
    click('Off', 'GST')
    const feeGroup = [...host!.querySelectorAll('[role="radiogroup"]')].find((el) => el.getAttribute('aria-label') === 'Payment fee')
    const fee = feeGroup!.querySelector('[aria-checked="true"]')
    expect(fee?.textContent).toBe('Fanatics card 2.9%')
    const type = (suffix: string, value: string) => {
      const input = host!.querySelector(`[id$="-${suffix}"]`) as HTMLInputElement
      typeInto(input, value)
    }
    act(() => {
      type('target', '2140.11')
      type('forwarder', '8.96')
      type('fx', '1.279918')
      type('fx-date', '2026-10-17')
    })
    const body = host!.textContent ?? ''
    expect(body).toContain('$1,327.62')
    expect(body).not.toContain('$1,366.72')
    click('eBay 0%', 'Payment fee')
    click('Goldin 22%', "Buyer's premium")
    const feeAgain = [...host!.querySelectorAll('[role="radiogroup"]')].find((el) => el.getAttribute('aria-label') === 'Payment fee')
    expect(feeAgain!.querySelector('[aria-checked="true"]')?.textContent).toBe('eBay 0%')
    click('All-in')
    click('Fanatics 20%', "Buyer's premium")
    act(() => {
      type('hammer', '100')
    })
    expect(host!.textContent).toContain('Type the shipping from the Fanatics checkout.')
    expect(host!.querySelector('section')).toBeNull()
  })
})

describe('hammer shares', () => {
  it('uses largest-remainder rounding so the shares add up to the hammer', () => {
    const three = hammerShares(100, [
      { id: 'a', sgd: 1 },
      { id: 'b', sgd: 1 },
      { id: 'c', sgd: 1 },
    ])
    expect(three.map((row) => row.share)).toEqual([33.34, 33.33, 33.33])
    expect(three.reduce((sum, row) => sum + row.share, 0)).toBe(100)

    const mixed = hammerShares(200, [
      { id: 'a', sgd: 200 },
      { id: 'b', sgd: 80 },
      { id: 'c', sgd: 80 },
    ])
    expect(mixed.map((row) => row.share)).toEqual([111.11, 44.45, 44.44])
    expect(Math.round(mixed.reduce((sum, row) => sum + row.share, 0) * 100) / 100).toBe(200)

    const odd = hammerShares(252.01, [
      { id: 'a', sgd: 1 },
      { id: 'b', sgd: 1 },
    ])
    expect(odd.map((row) => row.share)).toEqual([126.01, 126])
    expect(Math.round(odd.reduce((sum, row) => sum + row.share, 0) * 100) / 100).toBe(252.01)
  })
})
