import { describe, expect, it } from 'vitest'
import worker from '../src/index.js'
import {
  DISCLAIMER,
  PRICECHARTING_FIELDS,
  PRICE_TTL_S,
  buildPrice,
  cacheKey,
  candidateGroups,
  choosePricechartingProduct,
  choosePrint,
  handlePrice,
  loadProductMap,
  normaliseGrade,
  normaliseVariant,
  parseCardNumber,
  parseEcb,
  parsePriceQuery,
  printsFor,
  setsHolding,
  splitProductName,
  toSgd,
} from '../src/price.js'

// --- fixtures: trimmed from real TCGCSV and ECB answers (16 Oct 2026) -------

const GROUPS = [
  { groupId: 23834, name: 'Extra Booster: Anime 25th Collection', abbreviation: 'EB02' },
  { groupId: 24637, name: "Adventure on Kami's Island", abbreviation: 'OP15-EB04' },
  { groupId: 23213, name: 'Awakening of the New Era', abbreviation: 'OP05' },
  { groupId: 23496, name: 'One Piece Card The Best', abbreviation: 'PRB01' },
]
const ext = (number: string, rarity = 'L') => [
  { name: 'Rarity', displayName: 'Rarity', value: rarity },
  { name: 'Number', displayName: 'Number', value: number },
]
const EB02_PRODUCTS = [
  { productId: 594069, name: 'Extra Booster: Anime 25th Collection Box', url: 'https://www.tcgplayer.com/product/594069', extendedData: [] },
  { productId: 629100, name: 'Monkey.D.Luffy (010)', url: 'https://www.tcgplayer.com/product/629100/eb02-luffy', extendedData: ext('EB02-010') },
  { productId: 629101, name: 'Monkey.D.Luffy (010) (Alternate Art)', url: 'https://www.tcgplayer.com/product/629101/eb02-luffy-aa', extendedData: ext('EB02-010') },
  { productId: 629140, name: 'Kouzuki Oden (SP)', url: 'https://www.tcgplayer.com/product/629140', extendedData: ext('OP01-031', 'SP') },
]
const EB02_PRICES = [
  { productId: 629100, lowPrice: 0.01, midPrice: 0.5, highPrice: 20.39, marketPrice: 0.43, directLowPrice: null, subTypeName: 'Normal' },
  { productId: 629101, lowPrice: 1007.16, midPrice: 1398.9, highPrice: 7500, marketPrice: 1033.15, directLowPrice: null, subTypeName: 'Foil' },
  { productId: 629140, lowPrice: 10, midPrice: 12, highPrice: 20, marketPrice: null, directLowPrice: null, subTypeName: 'Foil' },
]
const OP05_PRODUCTS = [
  { productId: 527024, name: 'Monkey.D.Luffy (119)', url: 'https://www.tcgplayer.com/product/527024', extendedData: ext('OP05-119', 'SEC') },
  { productId: 530122, name: 'Monkey.D.Luffy (119) (Alternate Art)', url: 'https://www.tcgplayer.com/product/530122', extendedData: ext('OP05-119', 'SEC') },
  { productId: 527026, name: 'Monkey.D.Luffy (119) (Alternate Art) (Manga)', url: 'https://www.tcgplayer.com/product/527026', extendedData: ext('OP05-119', 'SEC') },
]
const OP05_PRICES = [
  { productId: 527024, marketPrice: 16.3, lowPrice: 12, midPrice: 18 },
  { productId: 530122, marketPrice: 160.02, lowPrice: 140, midPrice: 170 },
  { productId: 527026, marketPrice: null, lowPrice: null, midPrice: null },
]
const PRB01_PRODUCTS = [{ productId: 586960, name: 'Monkey.D.Luffy (119) (Alternate Art)', url: 'https://www.tcgplayer.com/product/586960', extendedData: ext('OP05-119', 'SEC') }]
const PRB01_PRICES = [{ productId: 586960, marketPrice: 208.18, lowPrice: 190, midPrice: 220 }]

const CSV = ['card_number,set_code,tcgplayer_product_id', 'EB02-010,EB-02,629100', 'EB02-010p1,EB-02,629101', 'OP05-119,OP-05,527024', 'OP05-119p1,OP-05,530122', 'OP05-119p2,OP-05,527026', 'OP05-119p4,PRB-01,586960', 'EB04-001,EB-04,685295'].join('\n')
const ROSTER = {
  sets: [
    { setCode: 'EB-02', product: 'booster_box', tcgplayerGroupId: 23834 },
    { setCode: 'OP-05', product: 'booster_box', tcgplayerGroupId: 23213 },
    { setCode: 'PRB-01', product: 'booster_box', tcgplayerGroupId: 23496 },
    { setCode: 'EB-04', product: 'booster_box', tcgplayerGroupId: null },
  ],
}
const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<Cube><Cube time='2026-10-15'>
<Cube currency='USD' rate='1.1208'/>
<Cube currency='JPY' rate='170.31'/>
<Cube currency='SGD' rate='1.4379'/>
</Cube></Cube></gesmes:Envelope>`
const NOW = '2026-10-16T09:00:00.000Z'

class MemoryKV {
  store = new Map<string, string>()
  puts = 0
  async get(name: string, type?: string) {
    const v = this.store.get(name) ?? null
    return v != null && type === 'json' ? JSON.parse(v) : v
  }
  async put(name: string, value: string) {
    this.puts++
    this.store.set(name, value)
  }
}

/** A fetch that serves the fixtures and records every URL. `down` names hosts that refuse. */
function fakeFetch(opts: { down?: string[]; log?: string[]; pricecharting?: unknown } = {}) {
  const log = opts.log ?? []
  return async (url: string) => {
    log.push(url)
    const u = new URL(url)
    if ((opts.down ?? []).some((h) => u.host.includes(h))) return new Response('nope', { status: 503 })
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (u.host === 'tcgcsv.com') {
      if (u.pathname === '/last-updated.txt') return new Response('2026-10-15T20:06:01+0000')
      if (u.pathname === '/tcgplayer/68/groups') return json({ success: true, errors: [], results: GROUPS })
      const m = /^\/tcgplayer\/68\/(\d+)\/(products|prices)$/.exec(u.pathname)
      if (m) {
        const g = Number(m[1])
        const table = { 23834: [EB02_PRODUCTS, EB02_PRICES], 23213: [OP05_PRODUCTS, OP05_PRICES], 23496: [PRB01_PRODUCTS, PRB01_PRICES] }[g]
        if (!table) return new Response('{}', { status: 404 })
        return json({ success: true, errors: [], results: m[2] === 'products' ? table[0] : table[1] })
      }
    }
    if (u.host === 'www.ecb.europa.eu') return new Response(ECB_XML, { status: 200 })
    if (u.host === 'www.pricecharting.com') return json(opts.pricecharting ?? { status: 'success', products: [] })
    return new Response('not found', { status: 404 })
  }
}

const deps = (over: Record<string, unknown> = {}) => ({ fetch: fakeFetch(over as never), productMap: loadProductMap(CSV), roster: ROSTER, now: () => NOW, ...over })
const q = (qs: string) => parsePriceQuery(new URL(`https://w/price?${qs}`)) as ReturnType<typeof parsePriceQuery> & { card: string }

// --- parsing ----------------------------------------------------------------

describe('parseCardNumber', () => {
  it('reads Piecebook numbers with or without a print suffix, any case', () => {
    expect(parseCardNumber('EB02-010')).toEqual({ base: 'EB02-010', print: null, setToken: 'EB02', setCode: 'EB-02' })
    expect(parseCardNumber(' op05-119p4 ')).toEqual({ base: 'OP05-119', print: 'p4', setToken: 'OP05', setCode: 'OP-05' })
    expect(parseCardNumber('OP05-119_p2')).toMatchObject({ print: 'p2' })
    expect(parseCardNumber('PRB01-001')).toMatchObject({ setCode: 'PRB-01' })
    expect(parseCardNumber('Luffy')).toBeNull()
    expect(parseCardNumber('OP5-119')).toBeNull()
  })
})

describe('normaliseVariant and normaliseGrade', () => {
  it('accept both desks’ words', () => {
    expect(normaliseVariant('')).toBe('base')
    expect(normaliseVariant('alt')).toBe('alt')
    expect(normaliseVariant('Alternate Art')).toBe('alt')
    expect(normaliseVariant('parallel')).toBe('alt')
    expect(normaliseVariant('SP')).toBe('sp')
    expect(normaliseVariant('manga')).toBe('manga')
    expect(normaliseVariant('p3')).toBe('p3')
    expect(normaliseVariant('any')).toBe('any')
    expect(normaliseVariant('shiny')).toBeNull()
    expect(normaliseGrade(undefined)).toBe('raw')
    expect(normaliseGrade('PSA10')).toBe('psa10')
    expect(normaliseGrade('psa 10')).toBe('psa10')
    expect(normaliseGrade('PSA9')).toBe('psa9')
    expect(normaliseGrade('bgs10')).toBeNull()
  })
})

describe('parsePriceQuery', () => {
  it('unifies Auction’s and Cards’ shapes into one query', () => {
    expect(q('card=OP05-119&variant=SP&lang=EN&grade=PSA10')).toEqual({ card: 'OP05-119', print: null, setToken: 'OP05', setCode: 'OP-05', variant: 'sp', lang: 'EN', grade: 'psa10' })
    expect(q('code=EB02-010&variant=alt&grade=raw')).toEqual({ card: 'EB02-010', print: null, setToken: 'EB02', setCode: 'EB-02', variant: 'alt', lang: 'EN', grade: 'raw' })
    expect(q('code=EB02-010')).toMatchObject({ variant: 'base', grade: 'raw' })
  })

  it('lets a print suffix on the number win over the variant word', () => {
    expect(q('card=OP05-119p4&variant=base')).toMatchObject({ print: 'p4', variant: 'p4' })
    expect(q('card=EB02-010p1')).toMatchObject({ print: 'p1', variant: 'alt' })
  })

  it('names what is wrong instead of guessing', () => {
    expect(q('variant=alt')).toMatchObject({ error: 'card_required' })
    expect(q('card=EB02-010&variant=shiny')).toMatchObject({ error: 'variant_unknown' })
    expect(q('card=EB02-010&grade=bgs10')).toMatchObject({ error: 'grade_unknown' })
  })

  it('keys the cache on the normalised query', () => {
    expect(cacheKey(q('card=eb02-010&variant=Alternate%20Art&grade=PSA10'))).toBe('price:v1:EB02-010|alt|EN|psa10')
  })
})

// --- product matching ---------------------------------------------------------

describe('product map and groups', () => {
  it('maps card numbers to TCGplayer products both ways, keeping the CSV casing', () => {
    const map = loadProductMap(CSV)
    expect(map.byCard.get('EB02-010P1')).toEqual({ productId: 629101, setCode: 'EB-02', cardNumber: 'EB02-010p1' })
    expect(map.byProduct.get(586960)).toBe('OP05-119p4')
    expect(setsHolding('OP05-119', map)).toEqual(['OP-05', 'PRB-01'])
  })

  it('finds the roster group, the reprint set’s group, and groups named by abbreviation (OP15-EB04 for EB04)', () => {
    expect(candidateGroups('OP-05', 'OP05', GROUPS, ROSTER, ['OP-05', 'PRB-01'])).toEqual([23213, 23496])
    expect(candidateGroups('EB-04', 'EB04', GROUPS, ROSTER)).toEqual([24637])
    expect(candidateGroups('OP-99', 'OP99', GROUPS, ROSTER)).toEqual([])
  })
})

describe('splitProductName and printsFor', () => {
  it('separates TCGplayer’s labels from its own disambiguators', () => {
    expect(splitProductName('Monkey.D.Luffy (010)')).toEqual({ name: 'Monkey.D.Luffy', suffixes: [] })
    expect(splitProductName('Monkey.D.Luffy (010) (Alternate Art)')).toEqual({ name: 'Monkey.D.Luffy', suffixes: ['alternate art'] })
    expect(splitProductName('Monkey.D.Luffy (119) (Alternate Art) (Manga)')).toEqual({ name: 'Monkey.D.Luffy', suffixes: ['alternate art', 'manga'] })
    expect(splitProductName('Jewelry Bonney (EB04-001) (Alternate Art)')).toEqual({ name: 'Jewelry Bonney', suffixes: ['alternate art'] })
    expect(splitProductName('Kouzuki Oden (SP)')).toEqual({ name: 'Kouzuki Oden', suffixes: ['sp'] })
  })

  it('lists every print of a number with its label, price and Piecebook number, skipping sealed products', () => {
    const prints = printsFor('EB02-010', EB02_PRODUCTS, EB02_PRICES, loadProductMap(CSV))
    expect(prints.map((p) => [p.cardNumber, p.label, p.variantKeys, p.market])).toEqual([
      ['EB02-010', 'Base', ['base'], 0.43],
      ['EB02-010p1', 'Alternate Art', ['alt'], 1033.15],
    ])
    expect(prints[1].url).toBe('https://www.tcgplayer.com/product/629101/eb02-luffy-aa')
  })
})

describe('choosePrint', () => {
  const map = loadProductMap(CSV)
  const prints = [...printsFor('OP05-119', OP05_PRODUCTS, OP05_PRICES, map), ...printsFor('OP05-119', PRB01_PRODUCTS, PRB01_PRICES, map)]

  it('takes the only print with exactly that label', () => {
    expect(choosePrint(prints, 'base', null, map, 'OP05-119').chosen?.productId).toBe(527024)
    expect(choosePrint(prints, 'manga', null, map, 'OP05-119').chosen?.productId).toBe(527026)
  })

  it('on a shared label takes the lowest print number and says so', () => {
    const pick = choosePrint(prints, 'alt', null, map, 'OP05-119')
    expect(pick.chosen?.cardNumber).toBe('OP05-119p1')
    expect(pick.note).toContain('2 prints of OP05-119 are labelled alt (OP05-119p1, OP05-119p4); this is OP05-119p1')
  })

  it('resolves a print number through the product map and names a label nobody carries', () => {
    expect(choosePrint(prints, 'p4', 'p4', map, 'OP05-119').chosen?.productId).toBe(586960)
    expect(choosePrint(prints, 'p7', 'p7', map, 'OP05-119')).toMatchObject({ chosen: null, reason: 'no TCGplayer product is mapped to OP05-119p7' })
    expect(choosePrint(prints, 'sp', null, map, 'OP05-119').reason).toMatch(/no print of OP05-119 is labelled sp/)
    expect(choosePrint(prints, 'any', null, map, 'OP05-119')).toEqual({ chosen: null, reason: 'any' })
  })
})

// --- FX and PriceCharting ----------------------------------------------------

describe('parseEcb and toSgd', () => {
  it('derives SGD per USD from the cube and dates it by the cube', () => {
    expect(parseEcb(ECB_XML)).toEqual({ rate: 1.2829, asOf: '2026-10-15', eurUsd: 1.1208, eurSgd: 1.4379 })
    expect(parseEcb('<Cube time="2026-10-15"><Cube currency="USD" rate="1.1"/></Cube>')).toBeNull()
    expect(toSgd(1033.15, 1.2829)).toBe(1325.43)
    expect(toSgd(null, 1.2829)).toBeNull()
  })
})

describe('PriceCharting mapping', () => {
  it('uses the documented card fields: loose = ungraded, graded = 9, manual-only = PSA 10', () => {
    expect(PRICECHARTING_FIELDS).toEqual({ raw: 'loose-price', psa9: 'graded-price', psa10: 'manual-only-price' })
  })

  it('picks the One Piece product carrying the card number, base or alt as asked', () => {
    const products = [
      { id: '1', 'console-name': 'Pokemon Card', 'product-name': 'Luffy EB02-010' },
      { id: '2', 'console-name': 'One Piece Card Game', 'product-name': 'Monkey D. Luffy EB02-010 [Alternate Art]' },
      { id: '3', 'console-name': 'One Piece Card Game', 'product-name': 'Monkey D. Luffy EB02-010' },
    ]
    expect(choosePricechartingProduct(products, 'EB02-010', 'base')?.id).toBe('3')
    expect(choosePricechartingProduct(products, 'EB02-010', 'alt')?.id).toBe('2')
    expect(choosePricechartingProduct(products, 'EB02-011', 'base')).toBeNull()
  })
})

// --- buildPrice ----------------------------------------------------------------

describe('buildPrice', () => {
  it('answers Cards’ ask: EN TCGplayer market in USD and SGD at the dated ECB rate, with source URL and pull date', async () => {
    const b = await buildPrice(q('code=EB02-010&variant=alt&grade=raw'), {}, deps())
    expect(b.print).toEqual({ cardNumber: 'EB02-010p1', setCode: 'EB-02', name: 'Monkey.D.Luffy', variant: 'Alternate Art', tcgplayerProductId: 629101, url: 'https://www.tcgplayer.com/product/629101/eb02-luffy-aa' })
    expect(b.street).toEqual({ usd: 1033.15, sgd: 1325.43, grade: 'raw', source: 'tcgplayer', url: 'https://www.tcgplayer.com/product/629101/eb02-luffy-aa', asOf: '2026-10-15', pulledAt: NOW })
    expect(b.sources.tcgplayer).toMatchObject({ status: 'ok', usd: { market: 1033.15, low: 1007.16, mid: 1398.9 }, sgd: { market: 1325.43, low: 1292.09, mid: 1794.65 }, asOf: '2026-10-15', via: 'https://tcgcsv.com/tcgplayer/68/23834/prices' })
    expect(b.fx).toMatchObject({ status: 'ok', rate: 1.2829, asOf: '2026-10-15', url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', note: 'Not a bank quote.' })
    expect(b.sources.pricecharting).toMatchObject({ status: 'not_configured' })
    expect(b.sources.pricecharting.note).toContain('PRICECHARTING_TOKEN')
    expect(b.sources.ebay_sold.status).toBe('not_configured')
    expect(b.sources.collectr.status).toBe('unavailable')
    expect(b.disclaimer).toBe(DISCLAIMER)
    expect(b.notes).toEqual([])
  })

  it('answers Auction’s ask for a PSA 10 honestly: TCGplayer is raw-only, PriceCharting is not configured, no street figure', async () => {
    const b = await buildPrice(q('card=OP05-119&variant=alt&lang=EN&grade=PSA10'), {}, deps())
    expect(b.street).toBeNull()
    expect(b.sources.tcgplayer).toMatchObject({ status: 'not_applicable', grade: 'raw' })
    expect(b.sources.tcgplayer.note).toMatch(/raw cards only/)
    expect(b.notes).toEqual(['No PSA 10 street figure: PriceCharting is not_configured.'])
    // The print was still identified and every print is listed with its raw market for context.
    expect(b.print?.cardNumber).toBe('OP05-119p1')
    expect(b.prints.map((p) => p.cardNumber)).toEqual(['OP05-119', 'OP05-119p1', 'OP05-119p2', 'OP05-119p4'])
  })

  it('reads PriceCharting when a token is set and converts the pennies', async () => {
    const pricecharting = { status: 'success', products: [{ id: '777', 'console-name': 'One Piece Card Game', 'product-name': 'Monkey D. Luffy OP05-119 [Alternate Art]', 'loose-price': 16002, 'graded-price': 30000, 'manual-only-price': 52500 }] }
    const log: string[] = []
    const b = await buildPrice(q('card=OP05-119&variant=alt&grade=PSA10'), { PRICECHARTING_TOKEN: 'tok-SECRET' }, deps({ pricecharting, log }))
    expect(b.sources.pricecharting).toMatchObject({ status: 'ok', grade: 'psa10', usd: { psa10: 525 }, sgd: { psa10: 673.52 }, url: 'https://www.pricecharting.com/game/777', asOf: '2026-10-16' })
    expect(b.street).toMatchObject({ usd: 525, sgd: 673.52, grade: 'psa10', source: 'pricecharting' })
    expect(log.some((u) => u.startsWith('https://www.pricecharting.com/api/products?t=tok-SECRET&q=one%20piece%20OP05-119%20Alternate%20Art'))).toBe(true)
    // The token never leaks into the answer.
    expect(JSON.stringify(b)).not.toContain('tok-SECRET')
  })

  it('says unavailable when PriceCharting has no such price or no such print', async () => {
    const none = { status: 'success', products: [{ id: '1', 'console-name': 'One Piece Card Game', 'product-name': 'Monkey D. Luffy OP05-119', 'loose-price': 1630 }] }
    const b = await buildPrice(q('card=OP05-119&grade=psa10'), { PRICECHARTING_TOKEN: 't' }, deps({ pricecharting: none }))
    expect(b.sources.pricecharting).toMatchObject({ status: 'unavailable' })
    expect(b.sources.pricecharting.note).toMatch(/no PSA 10 price/)
    const b2 = await buildPrice(q('card=OP05-119&variant=alt&grade=psa10'), { PRICECHARTING_TOKEN: 't' }, deps({ pricecharting: none }))
    expect(b2.sources.pricecharting.note).toMatch(/lists no alt print/)
  })

  it('finds a reprint-set print through the product map (OP05-119p4 lives in PRB-01)', async () => {
    const b = await buildPrice(q('card=OP05-119p4'), {}, deps())
    expect(b.print).toMatchObject({ cardNumber: 'OP05-119p4', tcgplayerProductId: 586960 })
    expect(b.street).toMatchObject({ usd: 208.18, sgd: 267.07 })
    expect(b.sources.tcgplayer.via).toBe('https://tcgcsv.com/tcgplayer/68/23496/prices')
  })

  it('lists every print for variant=any and names a print TCGplayer prices as null', async () => {
    const any = await buildPrice(q('card=OP05-119&variant=any'), {}, deps())
    expect(any.street).toBeNull()
    expect(any.sources.tcgplayer).toMatchObject({ status: 'list' })
    expect(any.prints).toHaveLength(4)
    const manga = await buildPrice(q('card=OP05-119&variant=manga'), {}, deps())
    expect(manga.street).toBeNull()
    expect(manga.sources.tcgplayer).toMatchObject({ status: 'unavailable', note: 'TCGplayer lists this print without a market price today.' })
  })

  it('returns a clear unavailable when TCGCSV cannot be reached, and never a number', async () => {
    const b = await buildPrice(q('card=EB02-010'), {}, deps({ down: ['tcgcsv.com'] }))
    expect(b.street).toBeNull()
    expect(b.print).toBeNull()
    expect(b.sources.tcgplayer).toMatchObject({ status: 'unavailable' })
    expect(b.sources.tcgplayer.note).toMatch(/TCGCSV could not be read from the Worker/)
    expect(b.notes[0]).toMatch(/No raw street figure/)
    expect(b.fx.status).toBe('ok')
  })

  it('falls back to the last committed ECB table, dated, when the ECB cannot be reached', async () => {
    const fxFallback = { asOf: '2026-10-10', rate: 1.28, sourceName: 'European Central Bank euro foreign-exchange reference rates', sourceUrl: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml' }
    const b = await buildPrice(q('card=EB02-010&variant=alt'), {}, deps({ down: ['ecb.europa.eu'], fxFallback }))
    expect(b.fx).toMatchObject({ status: 'fallback', rate: 1.28, asOf: '2026-10-10', pulledAt: null })
    expect(b.fx.note).toMatch(/last committed ECB table, dated 2026-10-10/)
    expect(b.street?.sgd).toBe(toSgd(1033.15, 1.28))
  })

  it('names a set with no known TCGplayer group and a non-English ask', async () => {
    const b = await buildPrice(q('card=OP99-001&lang=JP'), {}, deps())
    expect(b.sources.tcgplayer).toMatchObject({ status: 'unavailable', note: 'no TCGplayer group is known for OP-99.' })
    expect(b.notes[0]).toMatch(/Only English prices/)
  })

  it('caches TCGCSV groups, group tables and the ECB rate in KV so a second call makes no network call', async () => {
    const kv = new MemoryKV()
    const log: string[] = []
    const d = deps({ log })
    await buildPrice(q('card=EB02-010&variant=alt'), { PRICE_CACHE: kv }, d)
    const after = log.length
    expect([...kv.store.keys()].sort()).toEqual(['fx:ecb:v1', 'tcgcsv:group:23834', 'tcgcsv:groups'])
    await buildPrice(q('card=EB02-010'), { PRICE_CACHE: kv }, d)
    expect(log.length).toBe(after)
  })
})

// --- handlePrice and routing -------------------------------------------------

describe('handlePrice', () => {
  const env = (kv?: MemoryKV) => ({ PRICE_CACHE: kv })
  const call = (path: string, kv?: MemoryKV, method = 'GET') => handlePrice(new Request(`https://w${path}`, { method }), env(kv), {}, deps())

  it('serves both spellings, caches the whole answer for six hours and flags the hit', async () => {
    const kv = new MemoryKV()
    const first = await call('/street?code=EB02-010&variant=alt&grade=raw', kv)
    expect(first.status).toBe(200)
    expect(first.headers.get('Cache-Control')).toBe(`private, max-age=${PRICE_TTL_S}`)
    const a = await first.json()
    expect(a.cache).toEqual({ hit: false, ttlSeconds: PRICE_TTL_S })
    expect(kv.store.has('price:v1:EB02-010|alt|EN|raw')).toBe(true)
    const b = await (await call('/price?card=eb02-010&variant=Alternate%20Art', kv)).json()
    expect(b.cache).toEqual({ hit: true, ttlSeconds: PRICE_TTL_S })
    expect(b.street).toEqual(a.street)
    const fresh = await (await call('/price?card=EB02-010&variant=alt&fresh=1', kv)).json()
    expect(fresh.cache.hit).toBe(false)
  })

  it('does not cache an answer with no real figure, so an outage is retried next call', async () => {
    const kv = new MemoryKV()
    const r = await handlePrice(new Request('https://w/price?card=EB02-010'), env(kv), {}, deps({ down: ['tcgcsv.com'] }))
    const body = await r.json()
    expect(body.cache).toEqual({ hit: false, ttlSeconds: 0 })
    expect([...kv.store.keys()].filter((k) => k.startsWith('price:'))).toEqual([])
  })

  it('answers 400 with a reason for a bad query and 405 for anything but GET', async () => {
    expect((await call('/price?variant=alt')).status).toBe(400)
    expect(await (await call('/price?card=EB02-010&grade=bgs10')).json()).toMatchObject({ error: 'grade_unknown' })
    expect((await call('/price?card=EB02-010', undefined, 'POST')).status).toBe(405)
  })
})

describe('routing', () => {
  it('fails closed without Access, naming the route, like /sync does', async () => {
    const env = { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', VISION_CAP: new MemoryKV() }
    const r = await worker.fetch(new Request('https://w/price?card=EB02-010'), env, {} as never, {})
    expect(r.status).toBe(503)
    expect(await r.json()).toMatchObject({ error: 'price_not_configured' })
    const s = await worker.fetch(new Request('https://w/street?code=EB02-010'), env, {} as never, {})
    expect(s.status).toBe(503)
  })

  it('serves a read-only dev identity the same answer on /price and /street', async () => {
    const env = { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', ACCESS_DEV_IDENTITY: 'dev@example.com', VISION_CAP: new MemoryKV() }
    const r = await worker.fetch(new Request('http://localhost/street?code=EB02-010&variant=alt'), env, {} as never, deps())
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.street).toMatchObject({ usd: 1033.15, sgd: 1325.43 })
    expect(body.query).toEqual({ card: 'EB02-010', variant: 'alt', lang: 'EN', grade: 'raw' })
  })
})
