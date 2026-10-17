import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { publicHttpError, readBoughtTab, SHEETS_READONLY_SCOPE } from './googleSheetsRead'

function pem(der: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)))
  const lines = b64.match(/.{1,64}/g)!.join('\n')
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`
}

describe('readBoughtTab', () => {
  it('signs a readonly token and only GETs the tab', async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )
    const key = {
      client_email: 'reader@example.iam.gserviceaccount.com',
      private_key: pem(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
    }
    const calls: { url: string; method: string }[] = []
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET' })
      if (url === 'https://oauth2.googleapis.com/token') {
        const body = String(init?.body)
        const assertion = new URLSearchParams(body).get('assertion')!
        const [h, p, s] = assertion.split('.')
        const claims = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')))
        expect(claims.scope).toBe(SHEETS_READONLY_SCOPE)
        expect(claims.iss).toBe(key.client_email)
        const pad = s.replace(/-/g, '+').replace(/_/g, '/')
        const sig = Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))
        const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, sig, new TextEncoder().encode(`${h}.${p}`))
        expect(ok).toBe(true)
        return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 })
      }
      if (url.includes('/values/')) {
        expect(url).toContain('valueRenderOption=FORMATTED_VALUE')
        expect(init?.method).toBe('GET')
        return new Response(JSON.stringify({ values: [['Row ID', 'Code'], ['OPB-1', 'ST01-007']] }), { status: 200 })
      }
      return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 163782451, title: 'Bought' } }] }), { status: 200 })
    }) as typeof fetch

    const read = await readBoughtTab({
      key,
      spreadsheetId: 'abcdefghijklmnopqrstuvwxyz0123456789ABCD',
      sheetGid: 163782451,
      fetcher,
      now: () => Date.parse('2026-10-17T00:00:00Z'),
    })
    expect(read.title).toBe('Bought')
    expect(read.matrix[1]).toEqual(['OPB-1', 'ST01-007'])
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET', 'GET'])
    expect(calls.every((c) => !/batchUpdate|values:append|:batchClear/.test(c.url))).toBe(true)
  })

  it('redacts an email in an error and does not mention the key', () => {
    const message = publicHttpError(
      'sheets_read_failed',
      403,
      JSON.stringify({ error: { message: 'Permission denied for reader@project.iam.gserviceaccount.com private_key' } }),
    )
    expect(message).not.toContain('reader@')
    expect(message).not.toContain('private_key')
    expect(message.startsWith('sheets_read_failed:403:')).toBe(true)
  })

  it('the read modules never name a write method', () => {
    const files = [
      new URL('./googleSheetsRead.ts', import.meta.url),
      new URL('../../scripts/bought-refresh.mjs', import.meta.url),
      new URL('../../worker/src/bought.js', import.meta.url),
    ]
    for (const file of files) {
      const src = new TextDecoder().decode(readFileSync(fileURLToPath(file)))
      expect(src).not.toMatch(/values:append|batchUpdate|:batchClear|spreadsheets\.values\.update/)
    }
    expect(new TextDecoder().decode(readFileSync(fileURLToPath(new URL('./googleSheetsRead.ts', import.meta.url))))).toContain('spreadsheets.readonly')
  })
})
