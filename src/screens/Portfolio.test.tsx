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
    expect(body).toContain('OPB-0001')
    expect(body).toContain('OPB-0002')
    expect(body).toContain('Under cost')
    expect(body).toContain('Under all-in')
    expect(body).toContain('No price yet')
    expect(body).toContain('Stale, older than 7 days')
    expect(body).toContain('Carousell')
    expect(body).toContain('ROI')
    expect(body).toContain('S$557.50')
    expect(body).not.toContain('pricecharting')
    expect(body).not.toContain('9999')
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
    expect(memory['OPB-0003']).toBe(333.55)
  })
})
