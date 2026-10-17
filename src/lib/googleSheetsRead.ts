/**
 * Read one tab of a Google Sheet with a service account.
 * Scope is spreadsheets.readonly. This module never updates, appends or clears.
 *
 * The JSON key is an argument. Callers must not print it, and errors from here
 * do not include the key, the token, or the spreadsheet id.
 */

export const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SHEETS_ORIGIN = 'https://sheets.googleapis.com'

export interface ServiceAccountKey {
  client_email: string
  private_key: string
}

export interface ReadBoughtOptions {
  key: ServiceAccountKey
  spreadsheetId: string
  sheetGid: number
  fetcher?: typeof fetch
  now?: () => number
}

function b64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function redact(message: string): string {
  return message
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/ya29\.[0-9A-Za-z._-]+/g, '[redacted]')
    .replace(/private_key/gi, '[redacted]')
    .slice(0, 180)
}

export function publicHttpError(kind: 'sheets_auth_failed' | 'sheets_read_failed', status: number, body: string): string {
  let message = ''
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; error_description?: string }
    if (typeof parsed.error === 'string') message = parsed.error
    else if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) message = parsed.error.message
    else if (parsed.error_description) message = parsed.error_description
  } catch {
    message = ''
  }
  const safe = redact(message)
  return safe ? `${kind}:${status}:${safe}` : `${kind}:${status}`
}

async function accessToken(key: ServiceAccountKey, fetcher: typeof fetch, now: () => number): Promise<string> {
  const iat = Math.floor(now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SHEETS_READONLY_SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    }),
  )
  const unsigned = `${header}.${claim}`
  let cryptoKey: CryptoKey
  try {
    cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToPkcs8(key.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  } catch {
    throw new Error('sheets_auth_failed:key')
  }
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned))
  const assertion = `${unsigned}.${b64url(sig)}`
  const res = await fetcher(TOKEN_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (res.status >= 300 && res.status < 400) throw new Error('sheets_auth_failed:redirect')
  const text = await res.text()
  if (!res.ok) throw new Error(publicHttpError('sheets_auth_failed', res.status, text))
  let token = ''
  try {
    token = String((JSON.parse(text) as { access_token?: string }).access_token ?? '')
  } catch {
    token = ''
  }
  if (!token) throw new Error('sheets_auth_failed:no_token')
  return token
}

async function sheetsGet(url: string, token: string, fetcher: typeof fetch): Promise<unknown> {
  if (!url.startsWith(`${SHEETS_ORIGIN}/`)) throw new Error('sheets_read_failed:host')
  const res = await fetcher(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  if (res.status >= 300 && res.status < 400) throw new Error('sheets_read_failed:redirect')
  const text = await res.text()
  if (!res.ok) throw new Error(publicHttpError('sheets_read_failed', res.status, text))
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('sheets_read_failed:unreadable')
  }
}

/**
 * GET the tab whose sheetId is `sheetGid`, then GET its values.
 * Formatted strings, so a date cell stays a date the parser can read.
 */
export async function readBoughtTab(opts: ReadBoughtOptions): Promise<{ title: string; matrix: string[][] }> {
  const spreadsheetId = opts.spreadsheetId.trim()
  if (!/^[a-zA-Z0-9_-]{10,80}$/.test(spreadsheetId)) throw new Error('sheets_read_failed:bad_spreadsheet_id')
  if (!Number.isInteger(opts.sheetGid)) throw new Error('sheets_read_failed:bad_gid')
  const fetcher = opts.fetcher ?? fetch
  const now = opts.now ?? Date.now
  const token = await accessToken(opts.key, fetcher, now)
  const metaUrl = `${SHEETS_ORIGIN}/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`
  const meta = (await sheetsGet(metaUrl, token, fetcher)) as {
    sheets?: { properties?: { sheetId?: number; title?: string } }[]
  }
  const sheet = (meta.sheets ?? []).find((s) => s.properties?.sheetId === opts.sheetGid)
  const title = sheet?.properties?.title
  if (!title) throw new Error('sheets_read_failed:tab_not_found')
  const range = `'${title.replace(/'/g, "''")}'`
  const valuesUrl =
    `${SHEETS_ORIGIN}/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    '?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING'
  const values = (await sheetsGet(valuesUrl, token, fetcher)) as { values?: unknown[][] }
  const matrix = (values.values ?? []).map((row) => (Array.isArray(row) ? row.map((cell) => (cell == null ? '' : String(cell))) : []))
  return { title, matrix }
}
