// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrintsPanel } from './PrintsPanel'

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
})

describe('Prints panel', () => {
  it('warns on a bare code and does not pin a print', () => {
    act(() => {
      root!.render(<PrintsPanel code="OP10-119" grade="raw" />)
    })
    const body = host!.textContent ?? ''
    expect(body).toContain('No exact print set.')
    expect(body).not.toContain('Pinned')
    expect(host!.querySelector('[data-pinned="true"]')).toBeNull()
    expect(host!.querySelector('details[data-testid="prints"]')?.hasAttribute('open')).toBe(false)
    const link = host!.querySelector('a')
    expect(link?.textContent).toBe('Limitless')
    expect(link?.getAttribute('href')).toBe('https://onepiece.limitlesstcg.com/cards/en/OP10-119')
    expect(link?.closest('p')?.textContent).toContain('Stale, older than 7 days')
  })
})
