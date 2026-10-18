// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BOUGHT_ALERTS_KEY } from '../lib/boughtAlerts'
import { PortfolioScreen } from './Portfolio'

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no worker'))))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  vi.unstubAllGlobals()
})

function text(): string {
  return host?.textContent ?? ''
}

describe('Portfolio screen', () => {
  it('shows the sample book: holdings, a sale, ROI, stale and no price', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <PortfolioScreen />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    const body = text()
    expect(body).toContain('Sample book')
    expect(body).toContain('×2')
    expect(body).toContain('Nami')
    expect(body).toContain('Row IDs')
    expect(body).toContain('OPB-0001')
    expect(body).toContain('OPB-0002')
    expect(body).toContain('Under cost')
    expect(body).toContain('Under all-in')
    expect(body).toContain('No price yet')
    expect(body).toContain('Sheet (Cards)')
    expect(body).toContain('Stale, older than 7 days')
    expect(body).toContain('Carousell')
    expect(body).toContain('ROI')
    expect(body).toContain('S$707.50')
    expect(body).toContain('JP · PSA 10 · $260.00 · OP Box Index')
    expect(host!.querySelector('details[data-testid="prints"]')?.hasAttribute('open')).toBe(false)
    expect(body).not.toContain('Japanese')
    expect(body).not.toContain('999')
    expect(host!.querySelector('a[href="https://www.pricecharting.com/game/one-piece/nami"]')?.textContent).toBe('PriceCharting')
    expect(body).toContain('OP05-100p2 · PSA 10')
    expect(body).toContain('OP05-100p2 · Raw')
  })

  it('dismisses an alert once and keeps the under-cost line', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <PortfolioScreen />
        </MemoryRouter>,
      )
    })
    const button = host!.querySelector('button')
    expect(button?.textContent).toBe('Dismiss')
    await act(async () => {
      button!.click()
    })
    expect(text()).not.toContain('Under all-in')
    expect(text()).toContain('Under cost')
    const memory = JSON.parse(localStorage.getItem(BOUGHT_ALERTS_KEY)!)
    expect(memory['OPB-0001']).toBe(0.9)
    expect(memory['OPB-0003']).toBe(350)
  })

  it('replaces the sample when the signed-in book loads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (String(url).endsWith('/holdings/snapshot')) {
          return Promise.resolve(new Response(JSON.stringify({ source: 'piecebook', history: [] }), { status: 200 }))
        }
        if (String(url).endsWith('/holdings') && (!init?.method || init.method === 'GET')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                source: 'piecebook',
                revision: 1,
                history: [],
                copies: [
                  {
                    rowId: 'OPB-0042',
                    date: '2026-10-01',
                    card: 'Zoro',
                    code: 'OP01-001',
                    grade: 'Raw',
                    where: 'Desk',
                    paidSgd: 3,
                    gstSgd: 0,
                    forwardingSgd: 0,
                    allInSgd: 3,
                    marketValueSgd: null,
                    marketSource: '',
                    marketAsOf: null,
                    notes: '',
                    priceChartingUrl: null,
                    status: 'Held',
                    soldDate: null,
                    soldPrice: null,
                    currency: '',
                    saleFx: null,
                    channel: '',
                    feesSgd: null,
                    shippingOutSgd: null,
                    netSgd: null,
                    realizedSgd: null,
                  },
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          )
        }
        return Promise.reject(new Error('no'))
      }),
    )
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <PortfolioScreen />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(text()).toContain('Your book')
    expect(text()).toContain('Zoro')
    expect(text()).toContain('OPB-0042')
    expect(text()).toContain('Add a copy')
    expect(text()).not.toContain('Sample book, not your cards')
  })
})
