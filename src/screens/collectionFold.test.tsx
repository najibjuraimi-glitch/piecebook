// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { CollectionProvider } from '../store/collection'
import { DecksProvider } from '../store/decks'
import { HoldingsBookProvider } from '../store/holdingsBook'
import { ReaderCutoffProvider } from '../store/readerCutoff'
import { WatchlistProvider } from '../store/watchlist'

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

function renderAt(path: string) {
  return act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <CollectionProvider>
          <HoldingsBookProvider>
            <WatchlistProvider>
              <DecksProvider>
                <ReaderCutoffProvider>
                  <App />
                </ReaderCutoffProvider>
              </DecksProvider>
            </WatchlistProvider>
          </HoldingsBookProvider>
        </CollectionProvider>
      </MemoryRouter>,
    )
  })
}

describe('collection folded into portfolio', () => {
  it('sends /collection to Portfolio and drops Collection from the nav', async () => {
    await renderAt('/collection')
    await act(async () => {
      await Promise.resolve()
    })
    const body = host!.textContent ?? ''
    expect(body).toContain('Sample book')
    const labels = [...host!.querySelectorAll('nav[aria-label="Primary"] a')].map((a) => a.textContent)
    expect(labels).toContain('Portfolio')
    expect(labels).not.toContain('Collection')
  })

  it('marks a set card from the holding code and ignores the old owned toggle', async () => {
    localStorage.setItem('piecebook.v1', JSON.stringify({ owned: { 'OP09-001': { qty: 4, ownedAt: '2026-10-01T00:00:00.000Z' } } }))
    await renderAt('/sets/ST-01')
    await act(async () => {
      await Promise.resolve()
    })
    const body = host!.textContent ?? ''
    expect(body).toContain('In your portfolio')
    expect(body).toContain('1 in your portfolio')
    expect(body).not.toContain('Mark owned')
    expect(body).not.toContain('I have this deck')
    expect(localStorage.getItem('piecebook.v1')).toContain('OP09-001')
  })

  it('does not mark a set from the old owned toggle', async () => {
    localStorage.setItem('piecebook.v1', JSON.stringify({ owned: { 'OP09-001': { qty: 4, ownedAt: '2026-10-01T00:00:00.000Z' } } }))
    await renderAt('/sets/OP-09')
    await act(async () => {
      await Promise.resolve()
    })
    const op09 = host!.textContent ?? ''
    expect(op09).toContain('OP09-001')
    expect(op09).not.toContain('In your portfolio')
    expect(localStorage.getItem('piecebook.v1')).toContain('OP09-001')
  })
})
