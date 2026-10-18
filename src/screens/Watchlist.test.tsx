// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WatchItemForm } from './WatchItemForm'
import { WatchlistScreen } from './Watchlist'

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

function text(): string {
  return host?.textContent ?? ''
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const item = {
  id: 'WL-0001',
  code: 'OP09-004',
  grade: 'Raw',
  targetSgd: 5,
  notes: 'chase',
  added: '2026-10-16',
  priceSgd: 1.5,
  source: 'Limitless',
  asOf: '2026-09-05',
  priceLabel: null,
  hit: true,
  stale: true,
}

const quiet = {
  id: 'WL-0002',
  code: 'OP09-004',
  grade: 'PSA 10',
  targetSgd: 400,
  notes: '',
  added: '2026-10-16',
  priceSgd: null,
  source: null,
  asOf: null,
  priceLabel: 'No price yet',
  hit: false,
  stale: false,
}

describe('Watchlist screen', () => {
  it('shows the English price, a hit, a stale mark and no price yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).endsWith('/alerts')) {
          return Promise.resolve(
            new Response(JSON.stringify({ revision: 0, underAllIn: [], watchlist: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
          )
        }
        return Promise.resolve(
          new Response(JSON.stringify({ source: 'piecebook', revision: 2, items: [item, quiet], writes: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }),
    )
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <WatchlistScreen />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const body = text()
    expect(body).toContain('OP09-004 · Raw')
    expect(body).toContain('Limitless')
    expect(body).toContain('5 Sep 2026')
    expect(body).toContain('At or under target')
    expect(body).toContain('Stale, older than 7 days')
    expect(body).toContain('No price yet')
    expect(body).toContain('Prints')
    expect(host!.querySelector('details[data-testid="prints"]')?.hasAttribute('open')).toBe(false)
    expect(host!.querySelector('[data-pinned="true"]')).toBeTruthy()
    expect(body).toContain('PSA 10')
    expect(body).not.toContain('Japanese')
    expect(host!.querySelector('a[href="/watchlist/WL-0001"]')).toBeTruthy()
  })
})

describe('Watchlist form', () => {
  it('posts a new target with the current revision', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          bodies.push(JSON.parse(String(init.body)))
          return Promise.resolve(new Response(JSON.stringify({ revision: 3, item: { id: 'WL-0003' } }), { status: 201 }))
        }
        return Promise.resolve(new Response(JSON.stringify({ revision: 2, items: [] }), { status: 200 }))
      }),
    )
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <WatchItemForm mode="add" />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    const inputs = [...host!.querySelectorAll('input')]
    await act(async () => {
      typeInto(inputs[0], 'OP09-004')
      typeInto(inputs[1], '5')
    })
    const save = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Save target')!
    await act(async () => {
      save.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(String(bodies[0] && (bodies[0] as { code?: string }).code)).toBe('OP09-004')
    expect(bodies[0]).toMatchObject({ revision: 2, code: 'OP09-004', grade: 'Raw', targetSgd: 5 })
  })

  async function renderEdit() {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/watchlist/WL-0001']}>
          <Routes>
            <Route path="/watchlist/:id" element={<WatchItemForm mode="edit" />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('patches an existing target', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET'
        if (method !== 'GET') calls.push({ method, url: String(url), body: JSON.parse(String(init?.body)) })
        if (method === 'PATCH') return Promise.resolve(new Response(JSON.stringify({ revision: 2 }), { status: 200 }))
        return Promise.resolve(new Response(JSON.stringify({ revision: 1, items: [item] }), { status: 200 }))
      }),
    )
    await renderEdit()
    expect(text()).toContain('WL-0001')
    expect(text()).toContain('Limitless')
    expect(text()).toContain('5 Sep 2026')
    expect(text()).toContain('At or under target')
    expect(text()).toContain('Stale, older than 7 days')
    const notes = host!.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      typeInto(notes, 'updated')
    })
    const save = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Save target')!
    await act(async () => {
      save.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { revision: 1, notes: 'updated', code: 'OP09-004', grade: 'Raw' } })
    expect(calls[0].url).toContain('/watchlist/WL-0001')
  })

  it('removes an existing target', async () => {
    const calls: { method: string; body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        const method = init?.method || 'GET'
        if (method === 'DELETE') calls.push({ method, body: JSON.parse(String(init?.body)) })
        if (method === 'DELETE') return Promise.resolve(new Response(JSON.stringify({ revision: 2 }), { status: 200 }))
        return Promise.resolve(new Response(JSON.stringify({ revision: 1, items: [item] }), { status: 200 }))
      }),
    )
    await renderEdit()
    const remove = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Remove WL-0001')!
    await act(async () => {
      remove.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(calls[0]).toEqual({ method: 'DELETE', body: { revision: 1 } })
  })
})
