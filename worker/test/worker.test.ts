import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker, { originAllowed } from '../src/index.js'
import { resetAccessCacheForTests, verifyAccess } from '../src/access.js'

// --- helpers -------------------------------------------------------------

const b64url = (bytes: Uint8Array | string) => {
  const bin = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface Signer {
  jwks: { keys: unknown[] }
  sign: (claims: Record<string, unknown>, kid?: string) => Promise<string>
}

async function makeSigner(kid = 'k1'): Promise<Signer> {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, [
    'sign',
    'verify',
  ])
  const pub = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey
  return {
    jwks: { keys: [{ kid, kty: 'RSA', alg: 'RS256', use: 'sig', n: pub.n, e: pub.e }] },
    sign: async (claims, useKid = kid) => {
      const header = b64url(JSON.stringify({ alg: 'RS256', kid: useKid }))
      const payload = b64url(JSON.stringify(claims))
      const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`))
      return `${header}.${payload}.${b64url(new Uint8Array(sig))}`
    },
  }
}

class MemoryKV {
  store = new Map<string, string>()
  async get(name: string, type?: string) {
    const v = this.store.get(name)
    if (v === undefined) return null
    return type === 'json' ? JSON.parse(v) : v
  }
  async put(name: string, value: string) {
    this.store.set(name, value)
  }
  async list({ prefix }: { prefix: string }) {
    return { keys: [...this.store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }
  }
}

const TEAM = 'https://jib.cloudflareaccess.com'
const AUD = 'aud-pages'
const NOW = Date.parse('2026-10-16T09:00:00Z')
const nowS = Math.floor(NOW / 1000)

let signer: Signer
const fetcher = async (url: string) => {
  if (url === `${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify(signer.jwks), { status: 200 })
  return new Response('nope', { status: 404 })
}
const deps = { fetcher, now: () => NOW }

function env(extra: Record<string, unknown> = {}) {
  return {
    GEMINI_MODEL: 'test-model',
    DAILY_CAP: '60',
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: `${AUD},aud-worker`,
    OWNER_EMAIL: 'najibjuraimi@gmail.com',
    VISION_CAP: new MemoryKV(),
    USER_DATA: new MemoryKV(),
    ...extra,
  }
}

const userClaims = (over: Record<string, unknown> = {}) => ({
  aud: [AUD],
  iss: TEAM,
  email: 'Najibjuraimi@gmail.com',
  sub: 'user-1',
  iat: nowS - 10,
  nbf: nowS - 10,
  exp: nowS + 3600,
  ...over,
})
const serviceClaims = () => ({ aud: [AUD], iss: TEAM, common_name: 'abc123.access', sub: '', iat: nowS - 10, exp: nowS + 3600 })

const req = (path: string, init: RequestInit & { jwt?: string } = {}) => {
  const headers = new Headers(init.headers)
  if (init.jwt) headers.set('Cf-Access-Jwt-Assertion', init.jwt)
  return new Request(`https://piecebook-vision.najibjuraimi.workers.dev${path}`, { ...init, headers })
}
const call = (r: Request, e = env()) => worker.fetch(r, e, {} as never, deps)

beforeAll(async () => {
  signer = await makeSigner()
})
beforeEach(() => resetAccessCacheForTests())

// --- CORS ----------------------------------------------------------------

describe('originAllowed', () => {
  it('allows the old site, the Pages site, its previews and localhost', () => {
    expect(originAllowed('https://najibjuraimi-glitch.github.io', {})).toBe(true)
    expect(originAllowed('https://piecebook.pages.dev', {})).toBe(true)
    expect(originAllowed('https://abc1234.piecebook.pages.dev', {})).toBe(true)
    expect(originAllowed('http://localhost:5173', {})).toBe(true)
  })
  it('refuses anything else, including look-alikes', () => {
    expect(originAllowed('https://evil.example', {})).toBe(false)
    expect(originAllowed('https://piecebook.pages.dev.evil.example', {})).toBe(false)
    expect(originAllowed('https://a.b.piecebook.pages.dev', {})).toBe(false)
    expect(originAllowed(null, {})).toBe(false)
  })
  it('honours ALLOWED_ORIGINS', () => {
    const e = { ALLOWED_ORIGINS: 'https://cards.example' }
    expect(originAllowed('https://cards.example', e)).toBe(true)
    expect(originAllowed('https://piecebook.pages.dev', e)).toBe(false)
  })
})

// --- Access JWT ----------------------------------------------------------

describe('verifyAccess', () => {
  it('accepts a signed user token and lower-cases the email', async () => {
    const jwt = await signer.sign(userClaims())
    const r = await verifyAccess(req('/sync', { jwt }), env(), deps)
    expect(r.ok).toBe(true)
    expect(r.identity).toMatchObject({ email: 'najibjuraimi@gmail.com', kind: 'user', readOnly: false })
  })
  it('reads the token from the CF_Authorization cookie too', async () => {
    const jwt = await signer.sign(userClaims())
    const r = await verifyAccess(req('/sync', { headers: { Cookie: `x=1; CF_Authorization=${jwt}` } }), env(), deps)
    expect(r.ok).toBe(true)
  })
  it('maps a service token to the owner, read-only by default', async () => {
    const jwt = await signer.sign(serviceClaims())
    const r = await verifyAccess(req('/sync', { jwt }), env(), deps)
    expect(r.identity).toMatchObject({ email: 'najibjuraimi@gmail.com', kind: 'service', readOnly: true, name: 'abc123.access' })
    const rw = await verifyAccess(req('/sync', { jwt }), env({ SERVICE_TOKEN_WRITE: '1' }), deps)
    expect(rw.identity.readOnly).toBe(false)
  })
  it('refuses a missing, expired, wrong-audience or tampered token', async () => {
    expect(await verifyAccess(req('/sync'), env(), deps)).toMatchObject({ ok: false, status: 401, detail: 'no_access_token' })
    expect(await verifyAccess(req('/sync', { jwt: await signer.sign(userClaims({ exp: nowS - 120 })) }), env(), deps)).toMatchObject({ status: 401, detail: 'expired' })
    expect(await verifyAccess(req('/sync', { jwt: await signer.sign(userClaims({ aud: ['other'] })) }), env(), deps)).toMatchObject({ status: 401, detail: 'bad_aud' })
    expect(await verifyAccess(req('/sync', { jwt: await signer.sign(userClaims({ iss: 'https://other.cloudflareaccess.com' })) }), env(), deps)).toMatchObject({ detail: 'bad_iss' })
    const good = await signer.sign(userClaims())
    const [h, p, s] = good.split('.')
    const forged = `${h}.${b64url(JSON.stringify(userClaims({ email: 'mallory@example.com' })))}.${s}`
    expect(await verifyAccess(req('/sync', { jwt: forged }), env(), deps)).toMatchObject({ status: 401, detail: 'bad_signature' })
    expect(await verifyAccess(req('/sync', { jwt: `${h}.${p}.AAAA` }), env(), deps)).toMatchObject({ status: 401, detail: 'bad_signature' })
  })
  it('refuses a token signed by a key the team does not publish', async () => {
    const other = await makeSigner('k2')
    const jwt = await other.sign(userClaims(), 'k2')
    expect(await verifyAccess(req('/sync', { jwt }), env(), deps)).toMatchObject({ status: 401, detail: 'unknown_kid' })
  })
  it('does not trust the email header on its own', async () => {
    const r = await verifyAccess(req('/sync', { headers: { 'Cf-Access-Authenticated-User-Email': 'najibjuraimi@gmail.com' } }), env(), deps)
    expect(r).toMatchObject({ ok: false, status: 401 })
  })
  it('reports not configured when the Access vars are unset', async () => {
    expect(await verifyAccess(req('/sync'), env({ ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' }), deps)).toMatchObject({ ok: false, status: 503, error: 'access_not_configured' })
  })
  it('honours ACCESS_DEV_IDENTITY only on localhost', async () => {
    const e = env({ ACCESS_DEV_IDENTITY: 'dev@example.com' })
    const local = await verifyAccess(new Request('http://localhost:8787/sync'), e, deps)
    expect(local).toMatchObject({ ok: true, identity: { email: 'dev@example.com' } })
    const remote = await verifyAccess(req('/sync'), e, deps)
    expect(remote).toMatchObject({ ok: false, status: 401 })
  })
})

// --- routing -------------------------------------------------------------

describe('routing', () => {
  it('/health is open and says whether Access and sync are on', async () => {
    const r = await call(req('/health'))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, access: 'on', sync: 'on' })
    const off = await call(req('/health'), env({ ACCESS_TEAM_DOMAIN: '', USER_DATA: undefined }))
    expect(await off.json()).toMatchObject({ access: 'off', sync: 'off' })
  })
  it('without Access config, /check stays open and /sync says so', async () => {
    const e = env({ ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' })
    const check = await call(req('/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), e)
    expect(check.status).toBe(400)
    expect(await check.json()).toMatchObject({ error: 'front_required' })
    const sync = await call(req('/sync'), e)
    expect(sync.status).toBe(503)
    expect(await sync.json()).toMatchObject({ error: 'sync_not_configured' })
  })
  it('with Access config, /check and /sync refuse a request with no token', async () => {
    const check = await call(req('/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))
    expect(check.status).toBe(401)
    const sync = await call(req('/sync'))
    expect(sync.status).toBe(401)
  })
  it('refuses a disallowed browser origin before anything else', async () => {
    const r = await call(req('/sync', { headers: { Origin: 'https://evil.example' } }))
    expect(r.status).toBe(403)
    expect(await r.json()).toMatchObject({ error: 'origin_not_allowed' })
  })
  it('/whoami names the caller', async () => {
    const r = await call(req('/whoami', { jwt: await signer.sign(serviceClaims()) }))
    expect(await r.json()).toEqual({ identity: 'najibjuraimi@gmail.com', kind: 'service', readOnly: true })
  })
})

// --- sync ----------------------------------------------------------------

describe('/sync', () => {
  const doc = (value: unknown, updatedAt: string) => ({ value, updatedAt })
  const put = (e: ReturnType<typeof env>, jwt: string, docs: Record<string, unknown>) =>
    call(req('/sync', { method: 'PUT', jwt, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docs }) }), e)

  it('stores per key, last write wins, and hands back the winner', async () => {
    const e = env()
    const jwt = await signer.sign(userClaims())
    const first = await put(e, jwt, { 'piecebook.v1': doc({ owned: { 'OP09-001': { qty: 1 } } }, '2026-10-16T08:00:00.000Z') })
    expect(first.status).toBe(200)
    const older = await put(e, jwt, { 'piecebook.v1': doc({ owned: {} }, '2026-10-16T07:00:00.000Z') })
    const olderBody = await older.json()
    expect(olderBody.docs['piecebook.v1']).toEqual(doc({ owned: { 'OP09-001': { qty: 1 } } }, '2026-10-16T08:00:00.000Z'))
    const newer = await put(e, jwt, { 'piecebook.v1': doc({ owned: {} }, '2026-10-16T08:30:00.000Z'), 'piecebook.decks.v1': doc({ decks: [] }, '2026-10-16T08:30:00.000Z') })
    expect((await newer.json()).docs['piecebook.v1'].value).toEqual({ owned: {} })
    const all = await (await call(req('/sync', { jwt }), e)).json()
    expect(all).toMatchObject({ identity: 'najibjuraimi@gmail.com', readOnly: false })
    expect(Object.keys(all.docs).sort()).toEqual(['piecebook.decks.v1', 'piecebook.v1'])
    const one = await (await call(req('/sync/piecebook.decks.v1', { jwt }), e)).json()
    expect(one.doc).toEqual(doc({ decks: [] }, '2026-10-16T08:30:00.000Z'))
  })
  it('keeps identities apart', async () => {
    const e = env()
    await put(e, await signer.sign(userClaims()), { 'piecebook.v1': doc({ owned: { a: 1 } }, '2026-10-16T08:00:00.000Z') })
    const other = await (await call(req('/sync', { jwt: await signer.sign(userClaims({ email: 'someone@else.example' })) }), e)).json()
    expect(other.docs).toEqual({})
  })
  it('a service token reads the owner data and cannot write', async () => {
    const e = env()
    await put(e, await signer.sign(userClaims()), { 'piecebook.v1': doc({ owned: { a: 1 } }, '2026-10-16T08:00:00.000Z') })
    const svc = await signer.sign(serviceClaims())
    const read = await (await call(req('/sync', { jwt: svc }), e)).json()
    expect(read).toMatchObject({ identity: 'najibjuraimi@gmail.com', kind: 'service', readOnly: true })
    expect(read.docs['piecebook.v1'].value).toEqual({ owned: { a: 1 } })
    const write = await put(e, svc, { 'piecebook.v1': doc({ owned: {} }, '2026-10-16T09:00:00.000Z') })
    expect(write.status).toBe(403)
    expect(await write.json()).toMatchObject({ error: 'read_only' })
  })
  it('rejects bad keys, bad stamps and clamps clocks from the future', async () => {
    const e = env()
    const jwt = await signer.sign(userClaims())
    expect((await put(e, jwt, { 'evil-key': doc(1, '2026-10-16T08:00:00.000Z') })).status).toBe(400)
    expect((await put(e, jwt, { 'piecebook.v1': doc(1, 'yesterday') })).status).toBe(400)
    expect((await put(e, jwt, { 'piecebook.v1': { updatedAt: '2026-10-16T08:00:00.000Z' } })).status).toBe(400)
    const future = await (await put(e, jwt, { 'piecebook.v1': doc(1, '2030-01-01T00:00:00.000Z') })).json()
    expect(future.docs['piecebook.v1'].updatedAt).toBe(new Date(NOW).toISOString())
  })
  it('says sync is not configured when the KV binding is missing', async () => {
    const r = await call(req('/sync', { jwt: await signer.sign(userClaims()) }), env({ USER_DATA: undefined }))
    expect(r.status).toBe(503)
    expect(await r.json()).toMatchObject({ error: 'sync_not_configured' })
  })
})

describe('/holdings', () => {
  it('stays closed without Access', async () => {
    const closed = await call(req('/holdings'), env({ ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' }))
    expect(closed.status).toBe(503)
    expect(await closed.json()).toMatchObject({ error: 'holdings_not_configured' })
    const locked = await call(req('/holdings'))
    expect(locked.status).toBe(401)
  })

  it('lets a service token add and update a row, and never echoes the token', async () => {
    const lines: unknown[] = []
    const e = env()
    const jwt = await signer.sign(serviceClaims())
    const secret = 'super-secret-token-value'
    const created = await worker.fetch(
      req('/holdings', {
        method: 'POST',
        jwt,
        headers: { 'Content-Type': 'application/json', 'CF-Access-Client-Secret': secret },
        body: JSON.stringify({ revision: 0, card: 'Nami', code: 'ST01-007', grade: 'Raw', allInSgd: 2, marketValueSgd: 5, marketSource: 'Cards', marketAsOf: '2026-10-12' }),
      }),
      e,
      {} as never,
      { ...deps, log: (line: unknown) => lines.push(line) },
    )
    const body = await created.json()
    expect(created.status).toBe(201)
    expect(body.copy.rowId).toBe('OPB-0001')
    expect(body.revision).toBe(1)
    expect(JSON.stringify(body)).not.toContain(secret)
    expect(JSON.stringify(body)).not.toContain(jwt)
    expect(JSON.stringify(lines)).not.toContain(secret)
    expect(JSON.stringify(lines)).not.toContain(jwt)

    const sold = await call(
      req('/holdings/OPB-0001/sold', {
        method: 'POST',
        jwt,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 1, soldDate: '2026-10-01', soldPrice: 1, currency: 'SGD', feesSgd: 0, shippingOutSgd: 0 }),
      }),
      e,
    )
    expect(sold.status).toBe(200)
    expect(await sold.json()).toMatchObject({ revision: 2, copy: { status: 'Sold', netSgd: 1, realizedSgd: -1 } })

    const read = await call(req('/holdings', { jwt }), e)
    const book = await read.json()
    expect(book.copies).toHaveLength(1)
    expect(book.copies[0].marketSource).toBe('Cards')
    const clash = await call(
      req('/holdings', {
        method: 'POST',
        jwt,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 0, card: 'Other' }),
      }),
      e,
    )
    expect(clash.status).toBe(409)
  })

  it('puts a service-token write in the owner book the phone reads', async () => {
    const kv = new MemoryKV()
    const e = env({ USER_DATA: kv, OWNER_EMAIL: 'NajibJuraimi@gmail.com' })
    const svc = await signer.sign(serviceClaims())
    const created = await call(
      req('/holdings', {
        method: 'POST',
        jwt: svc,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 0, card: 'Nami', code: 'ST01-007', grade: 'Raw', allInSgd: 2 }),
      }),
      e,
    )
    expect(created.status).toBe(201)
    expect([...kv.store.keys()].filter((k) => k.endsWith(':holdings.v1'))).toEqual(['u:najibjuraimi@gmail.com:holdings.v1'])

    const phone = await call(req('/holdings', { jwt: await signer.sign(userClaims()) }), e)
    expect(await phone.json()).toMatchObject({ source: 'piecebook', revision: 1, copies: [{ rowId: 'OPB-0001', card: 'Nami' }] })

    const other = await call(req('/holdings', { jwt: await signer.sign(userClaims({ email: 'someone@else.example' })) }), e)
    expect(await other.json()).toMatchObject({ revision: 0, copies: [] })
  })

  it('imports a CSV once for a signed-in user', async () => {
    const e = env()
    const jwt = await signer.sign(userClaims())
    const csv = 'Row ID,Code,Grade/Raw,All-in SGD,Status,Card,Market value SGD,Notes\nOPB-0004,ST01-007,Raw,2,Held,Nami,9,Sample copy\n'
    const first = await call(
      req('/holdings/import', {
        method: 'POST',
        jwt,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 0, csv }),
      }),
      e,
    )
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ imported: 1, revision: 1 })
    const second = await call(
      req('/holdings/import', {
        method: 'POST',
        jwt,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 1, csv }),
      }),
      e,
    )
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ error: 'already_imported' })
  })

  it('says holdings are not configured when KV is missing', async () => {
    const r = await call(req('/holdings', { jwt: await signer.sign(userClaims()) }), env({ USER_DATA: undefined }))
    expect(r.status).toBe(503)
    expect(await r.json()).toMatchObject({ error: 'holdings_not_configured' })
  })
})
