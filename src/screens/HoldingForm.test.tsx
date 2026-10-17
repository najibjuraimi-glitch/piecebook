// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HoldingFormScreen } from './HoldingForm'

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

describe('Add a copy', () => {
  it('posts the row with the current revision', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          expect(String(url)).toContain('/holdings')
          bodies.push(JSON.parse(String(init.body)))
          return Promise.resolve(new Response(JSON.stringify({ revision: 3, copy: { rowId: 'OPB-0008' } }), { status: 201 }))
        }
        return Promise.resolve(
          new Response(JSON.stringify({ source: 'piecebook', revision: 2, copies: [], history: [] }), { status: 200 }),
        )
      }),
    )
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <HoldingFormScreen mode="add" />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    const card = host!.querySelector('input') as HTMLInputElement
    await act(async () => {
      typeInto(card, 'Nami')
    })
    const save = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Save copy')!
    await act(async () => {
      save.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(bodies[0]).toMatchObject({ revision: 2, card: 'Nami', grade: 'Raw', status: 'Held' })
    expect(String((bodies[0] as { priceChartingUrl?: string }).priceChartingUrl ?? '')).not.toContain('javascript:')
  })

  it('asks you to sign in when the book cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <HoldingFormScreen mode="add" />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    const save = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Save copy')!
    await act(async () => {
      save.click()
    })
    expect(host!.textContent).toContain('Sign in to save a copy.')
  })
})
