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
    expect(op09).not.toContain('You own a version')
    expect(localStorage.getItem('piecebook.v1')).toContain('OP09-001')
  })

  it('marks the manga print exactly and leaves the base unmarked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        revision: 1,
        copies: [{ code: 'OP10-119', status: 'Held', exactPrint: 'OP10-119p2' }],
        history: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    await renderAt('/sets/OP-10')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const text = (href: string) => host!.querySelector(`a[href="${href}"]`)?.textContent ?? ''
    expect(text('/cards/OP10-119p2')).toContain('In your portfolio')
    expect(text('/cards/OP10-119')).not.toContain('In your portfolio')
    expect(text('/cards/OP10-119')).not.toContain('You own a version')
    expect(text('/cards/OP10-119p1')).not.toContain('In your portfolio')
  })

  it('marks every print of a bare code as a version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        revision: 1,
        copies: [{ code: 'OP13-028', status: 'Held', exactPrint: null }],
        history: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    await renderAt('/sets/OP-13')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const text = (href: string) => host!.querySelector(`a[href="${href}"]`)?.textContent ?? ''
    expect(text('/cards/OP13-028')).toContain('You own a version')
    expect(text('/cards/OP13-028')).not.toContain('In your portfolio')
    expect(text('/cards/OP13-028p1')).toContain('You own a version')
    expect(host!.textContent ?? '').toContain('2 you own a version')
  })
})
