#!/usr/bin/env node
/**
 * Refresh the EN card checklists and seed prices from Limitless.
 *
 *   npm run seed:refresh                 # every set on the roster
 *   npm run seed:refresh -- --sets OP-17,EB-04
 *   npm run seed:refresh -- --dry-run    # report only, write nothing
 *   npm run seed:refresh -- --as-of 2026-09-05
 *   npm run seed:refresh -- --boxes-only # only the TCGCSV step: box prices, upcoming-set discovery, Limitless code probe
 *
 * Source: https://onepiece.limitlesstcg.com/cards/en/{slug}?display=full&show=all&per-page=all
 * (one `card-page-main` block per print). Rules, kept identical to the first
 * seeds so re-runs are diffable (see docs/seed-sources.md):
 *   - card_number from the CDN filename: OP09-001_EN.webp → OP09-001, _p1_ → p1
 *   - rarity: official Limitless label (Leader, Common … Secret Rare, Special
 *     Card, Treasure Rare) → code; style labels (Alternate Art, Manga Art, …)
 *     inherit the base print's rarity; promo numbers (P-xxx) take P
 *   - market_usd from the `tr.current` prints row; blank when Limitless shows
 *     none (never invented); as_of = today for priced rows
 *   - regular sets keep same-set numbers only; PRB and ST reprint products keep every
 *     print in the box; a set with no Limitless page of its own (EB-04) is
 *     assembled from its numbers on the other sets' pages
 * Writes data/{code}-en-seed.csv (identity, rarity, image, price, variant),
 * data/card-attributes/{code}.csv (category, colour, cost / life, stats,
 * traits, effect and trigger text, artist, block, legality), appends today's
 * priced rows to data/price-history/{code}.csv (one row per card per day,
 * source=limitless), upserts data/tcgplayer-products.csv (card → TCGPlayer
 * product id) and repins the per-file counts in data/SEED-VERSION.txt.
 *
 * Upcoming sets (7.5): the TCGCSV step also scans every One Piece group for a
 * "… Booster Box" product on presale that is not on the roster yet and adds it
 * as a roster row with cardSeedStatus pending, TCGplayer's name, date, product
 * and group ids. The set code is read from the group's own cards: TCGCSV lists
 * the revealed singles with their card numbers (OP18-021 …), and the majority
 * prefix is the code, cross-checked against the group's abbreviation
 * (codeSource tcgcsv-cards). Only a group with neither gets a code by sequence
 * (Extra Booster → EB-nn, Premium Booster → PRB-nn, else OP-nn), marked
 * codeProvisional (codeSource sequence) and re-read each run from its cards
 * and from Limitless (/cards/{code}) until one confirms it. When a pending
 * set's checklist seeds, its row turns ready. Those are the only edits ever
 * made to Cards' roster JSON; prices and names on existing rows are never touched.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')
const HISTORY_DIR = join(DATA, 'price-history')
const BASE = 'https://onepiece.limitlesstcg.com'
const UA = 'Mozilla/5.0 (Piecebook seed refresh; github.com/najibjuraimi-glitch/piecebook)'
const DELAY_MS = 1500

const RARITY = {
  Leader: 'L',
  Common: 'C',
  Uncommon: 'UC',
  Rare: 'R',
  'Super Rare': 'SR',
  'Secret Rare': 'SEC',
  'Special Card': 'SP',
  'Treasure Rare': 'TR',
}
const REPRINT_SETS = /^(PRB|ST)-/ // premium boosters and starter decks are reprint products: every print on the page belongs
const FIELDS = ['set_code', 'set_name', 'card_number', 'name', 'rarity', 'language', 'image_url', 'market_usd', 'as_of', 'variant']
const ATTR_DIR = join(DATA, 'card-attributes')
const ATTR_FIELDS = [
  'card_number', 'variant', 'category', 'color', 'cost', 'life', 'power', 'counter', 'attribute', 'types',
  'effect', 'trigger', 'artist', 'block', 'standard', 'extra',
]

// ---------------------------------------------------------------- args

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const DRY = args.includes('--dry-run')
const NO_HISTORY = args.includes('--no-history')
const BOXES_ONLY = args.includes('--boxes-only') // only snapshot the roster's box prices; no Limitless fetch
const AS_OF = flag('--as-of') ?? new Date().toISOString().slice(0, 10)
const ONLY = flag('--sets')?.split(',').map((s) => s.trim().toUpperCase())

// ---------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}
const clean = (s) => decode(s.replace(/\s+/g, ' ')).trim()

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(rows, fields) {
  return [fields.join(','), ...rows.map((r) => fields.map((f) => csvCell(r[f])).join(','))].join('\n') + '\n'
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return []
  const split = (line) => {
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') q = false
        else cur += ch
      } else if (ch === '"') q = true
      else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  }
  const header = split(lines[0])
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [header[i], v])))
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}

const codeKey = (setCode) => setCode.replace(/-/g, '').toLowerCase()
const prefixOf = (setCode) => `${setCode.replace(/-/g, '').toUpperCase()}-`
const isParallel = (n) => /p\d+$/.test(n)
function numKey(cardNumber) {
  const m = cardNumber.match(/^([^-]*)-(\d+)(?:p(\d+))?$/)
  return [m ? m[1] : cardNumber, m ? Number(m[2]) : 0, m && m[3] ? Number(m[3]) : 0]
}
function compareNumbers(a, b) {
  const [as, an, ap] = numKey(a)
  const [bs, bn, bp] = numKey(b)
  return as.localeCompare(bs) || an - bn || ap - bp || a.localeCompare(b)
}

// ---------------------------------------------------------------- Limitless parsing

const stripTags = (s) => clean(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))

/**
 * Human name for a parallel print. Official rarity labels on a parallel
 * (Special Card, Treasure Rare) are the variant; style labels (Alternate Art,
 * Manga Art, Pirate Foil, Full Art, Textured Foil, …) pass through as written.
 * Limitless's untranslated `card.style.*` keys and blank labels become the
 * plain word "Parallel" rather than a guessed style name. Base prints: blank.
 */
function variantOf(cardNumber, base, printLabel) {
  if (cardNumber === base) return ''
  if (!printLabel || /^card\.style\./i.test(printLabel)) return 'Parallel'
  return printLabel
}

/** Category, colour, cost/life, stats, text, traits, artist and legality from one card-page-main block. */
function parseAttributes(b) {
  const textHtml = b.slice(b.indexOf('<div class="card-text">'), b.indexOf('<div class="card-legality">'))
  const type = textHtml.match(/<p class="card-text-type">(.*?)<\/p>/s)?.[1] ?? ''
  const category = type.match(/data-tooltip="Category">([^<]+)</)?.[1]?.trim() ?? ''
  const color = type.match(/data-tooltip="Color">([^<]+)</)?.[1]?.trim() ?? ''
  const cost = type.match(/(\d+)\s*Cost/)?.[1] ?? ''
  const life = type.match(/(\d+)\s*Life/)?.[1] ?? ''
  const stats = textHtml.match(/<p class="card-text-section">(.*?)<\/p>/s)?.[1] ?? ''
  const power = stats.match(/(\d+)\s*Power/)?.[1] ?? ''
  const counter = stats.match(/\+(\d+)\s*Counter/)?.[1] ?? ''
  const attribute = stats.match(/data-tooltip="Attribute">([^<]+)</)?.[1]?.trim() ?? ''
  const types = textHtml.match(/data-tooltip="Type">([^<]+)</)?.[1]?.trim() ?? ''
  const artist = stripTags(textHtml.match(/card-text-artist">\s*Illustrated by(.*?)<\/div>/s)?.[1] ?? '')
  const effects = []
  const triggers = []
  for (const m of textHtml.matchAll(/<div class="card-text-section(?: [^"]*)?">(.*?)<\/div>/gs)) {
    const inner = m[1]
    if (/card-text-title|data-tooltip="Type"|Illustrated by/.test(inner) || /card-text-artist/.test(m[0])) continue
    const text = stripTags(inner)
    if (!text) continue
    if (/^\[Trigger\]/.test(text)) triggers.push(text)
    else effects.push(text)
  }
  const legality = b.slice(b.indexOf('<div class="card-legality">'), b.indexOf('<div class="card-prints">'))
  const block = legality.match(/regulation-mark">\s*Block\s*(\d+)/)?.[1] ?? ''
  const legal = (format) => {
    const m = legality.match(new RegExp(`<div>${format}</div>\\s*<div class="(legal|not-legal)">`))
    return m ? (m[1] === 'legal' ? 'legal' : 'not legal') : ''
  }
  return {
    category, color, cost, life, power, counter, attribute, types,
    effect: effects.join('\n'), trigger: triggers.join('\n'), artist, block,
    standard: legal('Standard'), extra: legal('Extra'),
  }
}

function parseBlocks(page) {
  const blocks = page.split('<div class="card-page-main">').slice(1)
  const out = []
  for (const b of blocks) {
    const img = b.match(/card-image">\s*<img[^>]*src="([^"]+)"/)
    const name = b.match(/card-text-name"><a href="\/cards\/en\/([^"]+)">(.*?)<\/a>/)
    const label = b.match(/prints-current-details">\s*<span class="text-lg">(.*?)<\/span>\s*<span>(.*?)<\/span>/s)
    if (!img || !name || !label) continue
    const m = img[1].match(/\/([A-Z0-9]+-\d+)(?:_p(\d+))?_EN\.webp$/)
    if (!m) continue
    const base = m[1]
    const cardNumber = m[2] ? `${base}p${m[2]}` : base
    const cur = b.match(/<tr\s+class="current"\s*>(.*?)<\/tr>/s)
    const usd = cur?.[1].match(/card-price usd"[^>]*>\$([\d,]+\.\d{2})<\/a>/)
    // The USD link is a TCGPlayer partner URL wrapping the product page; keep the product id for provenance / backfill.
    const product = cur?.[1].match(/tcgplayer\.com%2Fproduct%2F(\d+)/i) ?? cur?.[1].match(/tcgplayer\.com\/product\/(\d+)/i)
    out.push({
      cardNumber,
      base,
      name: clean(name[2]),
      setLabel: clean(label[1]),
      printLabel: clean(label[2]),
      imageUrl: img[1],
      usd: usd ? usd[1].replace(/,/g, '') : null,
      tcgplayerProductId: product ? product[1] : null,
      variant: variantOf(cardNumber, base, clean(label[2])),
      attributes: parseAttributes(b),
    })
  }
  return out
}

// ---------------------------------------------------------------- build

function loadSeededBaseRarities() {
  const map = new Map()
  for (const f of readdirSync(DATA).filter((f) => f.endsWith('-en-seed.csv'))) {
    for (const r of parseCsv(readFileSync(join(DATA, f), 'utf8'))) {
      if (!isParallel(r.card_number) && r.rarity) map.set(r.card_number, r.rarity)
    }
  }
  return map
}

function buildRows(set, prints, seededBase) {
  const own = prefixOf(set.setCode)
  const pageBase = new Map()
  for (const p of prints) if (p.cardNumber === p.base) pageBase.set(p.base, RARITY[p.printLabel] ?? null)

  const rows = []
  const seen = new Set()
  const unmapped = []
  const noPrice = []
  for (const p of prints) {
    if (seen.has(p.cardNumber)) continue
    seen.add(p.cardNumber)
    const rarity =
      RARITY[p.printLabel] ??
      (p.cardNumber !== p.base ? pageBase.get(p.base) : null) ??
      seededBase.get(p.base) ??
      (p.base.startsWith('P-') ? 'P' : null)
    if (!rarity) {
      unmapped.push(`${p.cardNumber} (${p.printLabel || 'no label'})`)
      continue
    }
    if (p.usd === null) noPrice.push(p.cardNumber)
    rows.push({
      set_code: set.setCode,
      set_name: set.setName,
      card_number: p.cardNumber,
      name: p.name,
      rarity,
      language: 'EN',
      image_url: p.imageUrl,
      market_usd: p.usd ?? '',
      as_of: p.usd ? AS_OF : '',
      variant: p.variant,
    })
  }
  rows.sort((a, b) => {
    const ao = a.card_number.startsWith(own)
    const bo = b.card_number.startsWith(own)
    if (ao !== bo) return ao ? -1 : 1
    return compareNumbers(a.card_number, b.card_number)
  })
  return { rows, unmapped, noPrice }
}

/**
 * data/card-attributes/{code}.csv: what each print is and does (category,
 * colour, cost / life, power, counter, attribute, traits, effect and trigger
 * text, illustrator, regulation block, Standard / Extra legality) plus the
 * human variant name. Same rows as the set's seed CSV, in the same order.
 * Loaded lazily per set by the app.
 */
function writeAttributes(setCode, rows, prints) {
  mkdirSync(ATTR_DIR, { recursive: true })
  const byNumber = new Map(prints.map((p) => [p.cardNumber, p]))
  const out = rows.map((r) => {
    const p = byNumber.get(r.card_number)
    return { card_number: r.card_number, variant: r.variant, ...(p?.attributes ?? {}) }
  })
  const missing = out.filter((o) => !o.category).map((o) => o.card_number)
  if (!DRY) writeFileSync(join(ATTR_DIR, `${codeKey(setCode)}.csv`), toCsv(out, ATTR_FIELDS))
  return missing
}

const HISTORY_FIELDS = ['card_number', 'as_of', 'market_usd', 'source']

function appendHistory(setCode, rows) {
  mkdirSync(HISTORY_DIR, { recursive: true })
  const file = join(HISTORY_DIR, `${codeKey(setCode)}.csv`)
  // Rows written before the `source` column existed were all Limitless reads.
  const raw = existsSync(file) ? parseCsv(readFileSync(file, 'utf8')) : []
  const existing = raw.map((r) => ({ ...r, source: r.source || 'limitless' }))
  // One row per card per day; a re-run on the same day replaces that day's value.
  const byKey = new Map(existing.map((r) => [`${r.card_number}|${r.as_of}`, r]))
  let changed = raw.some((r) => !r.source) ? 1 : 0 // legacy header: rewrite once with the source column
  for (const r of rows) {
    if (r.market_usd === '') continue
    const key = `${r.card_number}|${r.as_of}`
    const prev = byKey.get(key)
    if (prev && prev.market_usd === r.market_usd && prev.source === 'limitless') continue
    byKey.set(key, { card_number: r.card_number, as_of: r.as_of, market_usd: r.market_usd, source: 'limitless' })
    changed++
  }
  if (changed === 0) return 0
  const all = [...byKey.values()].sort(
    (a, b) => compareNumbers(a.card_number, b.card_number) || a.as_of.localeCompare(b.as_of),
  )
  if (!DRY) writeFileSync(file, toCsv(all, HISTORY_FIELDS))
  return changed
}

/**
 * data/tcgplayer-products.csv: card_number → TCGPlayer product id, as linked
 * from each print's current-price row on Limitless. Provenance for the seed
 * price and the key for `npm run seed:backfill`. Never rendered as a link.
 */
function upsertProductIds(rowsBySet) {
  const file = join(DATA, 'tcgplayer-products.csv')
  const byCard = new Map((existsSync(file) ? parseCsv(readFileSync(file, 'utf8')) : []).map((r) => [r.card_number, r]))
  let changed = 0
  for (const [setCode, prints] of rowsBySet) {
    for (const p of prints) {
      if (!p.tcgplayerProductId) continue
      const prev = byCard.get(p.cardNumber)
      if (prev && prev.tcgplayer_product_id === p.tcgplayerProductId) continue
      byCard.set(p.cardNumber, { card_number: p.cardNumber, set_code: setCode, tcgplayer_product_id: p.tcgplayerProductId })
      changed++
    }
  }
  if (changed === 0) return 0
  const all = [...byCard.values()].sort((a, b) => a.set_code.localeCompare(b.set_code) || compareNumbers(a.card_number, b.card_number))
  if (!DRY) writeFileSync(file, toCsv(all, ['card_number', 'set_code', 'tcgplayer_product_id']))
  return changed
}

/**
 * data/box-price-history.csv: the EN booster box market price per set per day,
 * from TCGCSV (https://tcgcsv.com, a once-a-day mirror of TCGplayer's own API;
 * usage guidelines: identify with a User-Agent, pull once a day, sleep between
 * requests). Decision 3.1 (5 Sep 2026): automated, no hand reads. Each roster
 * row names its box with tcgplayerProductId / tcgplayerGroupId; the as_of is
 * TCGCSV's build date, so a same-day re-run replaces that day's row.
 */
const BOX_HISTORY_FIELDS = ['set_code', 'as_of', 'market_usd', 'low_usd', 'source']
const TCGCSV = 'https://tcgcsv.com'
const TCGCSV_CATEGORY = 68 // One Piece Card Game
const TCGCSV_HEADERS = { 'User-Agent': 'Piecebook/1.0 (+https://github.com/najibjuraimi-glitch/piecebook)' }

async function tcgcsvJson(path) {
  const res = await fetch(`${TCGCSV}${path}`, { headers: TCGCSV_HEADERS })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

async function fetchBoxPrices(rosterSets) {
  const built = (await fetch(`${TCGCSV}/last-updated.txt`, { headers: TCGCSV_HEADERS }).then((r) => r.text())).trim()
  const asOf = built.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`TCGCSV last-updated unreadable: "${built}"`)
  const file = join(DATA, 'box-price-history.csv')
  const byKey = new Map((existsSync(file) ? parseCsv(readFileSync(file, 'utf8')) : []).map((r) => [`${r.set_code}|${r.as_of}`, r]))
  const pricesByGroup = new Map()
  let changed = 0
  const missing = []
  for (const s of rosterSets) {
    if (!s.tcgplayerProductId || !s.tcgplayerGroupId) continue
    if (!pricesByGroup.has(s.tcgplayerGroupId)) {
      pricesByGroup.set(s.tcgplayerGroupId, (await tcgcsvJson(`/tcgplayer/${TCGCSV_CATEGORY}/${s.tcgplayerGroupId}/prices`)).results)
      await new Promise((r) => setTimeout(r, 120))
    }
    const rows = pricesByGroup.get(s.tcgplayerGroupId).filter((r) => r.productId === s.tcgplayerProductId)
    const price = rows.find((r) => r.subTypeName === 'Normal') ?? rows[0]
    if (!price || price.marketPrice == null) {
      missing.push(s.setCode)
      continue
    }
    const row = {
      set_code: s.setCode,
      as_of: asOf,
      market_usd: String(price.marketPrice),
      low_usd: price.lowPrice == null ? '' : String(price.lowPrice),
      source: 'tcgcsv',
    }
    const prev = byKey.get(`${s.setCode}|${asOf}`)
    if (prev && prev.market_usd === row.market_usd && prev.low_usd === row.low_usd) continue
    byKey.set(`${s.setCode}|${asOf}`, row)
    changed++
  }
  if (changed) {
    const order = new Map(rosterSets.map((s, i) => [s.setCode, i]))
    const all = [...byKey.values()].sort((a, b) => (order.get(a.set_code) ?? 999) - (order.get(b.set_code) ?? 999) || a.as_of.localeCompare(b.as_of))
    if (!DRY) writeFileSync(file, toCsv(all, BOX_HISTORY_FIELDS))
  }
  return { asOf, changed, missing }
}

// ---------------------------------------------------------------- upcoming sets (7.5)

const ROSTER_FILE = join(DATA, 'sets-roster-en.json')
let rosterDirty = false

function saveRoster(rosterFile) {
  if (!rosterDirty || DRY) return
  writeFileSync(ROSTER_FILE, JSON.stringify(rosterFile, null, 2) + '\n')
  rosterDirty = false
}

/** Bandai's product families and the code series each one numbers: the only classification the refresh makes. */
function seriesFor(productName) {
  if (/extra booster/i.test(productName)) return 'EB'
  if (/premium booster/i.test(productName)) return 'PRB'
  return 'OP'
}

/** "Extra Booster: One Piece Heroines Edition Vol.2 - Booster Box" → the set's name as TCGplayer writes it. */
const setNameFromBox = (productName) => productName.replace(/\s*[-–:]?\s*Booster Box$/i, '').trim()

const isPresaleBox = (p) => /Booster Box$/i.test(p.name.trim()) && !/Case/i.test(p.name) && p.presaleInfo?.isPresale === true

/** `OP18-021` → `OP-18`, `EB05-007` → `EB-05`, `PRB01-001` → `PRB-01`, `ST23-001` → `ST-23`; null for promos (`P-001`) and anything else. */
function codeFromCardNumber(number) {
  const m = String(number ?? '').trim().toUpperCase().match(/^([A-Z]{2,4})(\d{2,3})-\d{3}/)
  return m ? `${m[1]}-${m[2]}` : null
}

/** TCGCSV's group `abbreviation` in the roster's spelling when it is a plain code (`OP18`, `EB-05`); null when it is not one (`EB-03-04`). */
function codeFromAbbreviation(abbreviation) {
  const m = String(abbreviation ?? '').trim().toUpperCase().match(/^([A-Z]{2,4})-?(\d{2,3})$/)
  return m ? `${m[1]}-${m[2]}` : null
}

/**
 * The set code as TCGCSV states it. The source is the group's own cards: the
 * revealed singles carry their card numbers in extendedData `Number`, and the
 * majority prefix is the code (OP18-021, OP18-031, OP18-119 → OP-18; a reprint
 * such as OP17-119 in the same group is outvoted). The group's abbreviation is
 * the cross-check when TCGCSV has one, and stands in alone when no single is
 * listed yet. Null when the group has neither; the caller then falls back to a
 * provisional code by sequence.
 */
function codeFromGroup(group, products) {
  const votes = new Map()
  for (const p of products) {
    const code = codeFromCardNumber((p.extendedData ?? []).find((e) => e.name === 'Number')?.value)
    if (code) votes.set(code, (votes.get(code) ?? 0) + 1)
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const abbreviation = codeFromAbbreviation(group.abbreviation)
  const notes = []
  // A majority, not a plurality tie: two codes with the same count decide nothing.
  if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
    const [code, n] = ranked[0]
    const total = [...votes.values()].reduce((a, b) => a + b, 0)
    notes.push(`${n} of ${total} card number${total === 1 ? '' : 's'} read ${code}`)
    if (group.abbreviation) notes.push(abbreviation === code ? `abbreviation ${group.abbreviation} agrees` : `abbreviation ${group.abbreviation} DISAGREES`)
    return { code, source: 'tcgcsv-cards', notes, disagrees: Boolean(group.abbreviation) && abbreviation !== code }
  }
  if (abbreviation) return { code: abbreviation, source: 'tcgcsv-abbreviation', notes: [`no card numbers listed yet; abbreviation ${group.abbreviation}`], disagrees: false }
  return null
}

/**
 * Scan every TCGCSV group in the One Piece category for a presale booster box
 * whose group is not on the roster, and add it as a pending row. Only groups
 * published within the last 30 days or in the future are probed for products:
 * a presale ends at release, so anything older cannot be one, and the daily
 * request count stays small. Groups without such a box (a Deck Set, promos,
 * release event cards) are logged as warnings and never added.
 *
 * Rows still provisional from an earlier run are re-read from their own group
 * first: the day TCGCSV lists the set's singles, the code is confirmed (and
 * corrected if the sequence guessed wrong).
 */
async function discoverUpcoming(roster) {
  const groups = (await tcgcsvJson(`/tcgplayer/${TCGCSV_CATEGORY}/groups`)).results
  const known = new Set(roster.map((s) => s.tcgplayerGroupId).filter(Boolean))
  const horizon = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const candidates = groups
    .filter((g) => !known.has(g.groupId) && (!g.publishedOn || g.publishedOn.slice(0, 10) >= horizon))
    .sort((a, b) => (a.publishedOn ?? '').localeCompare(b.publishedOn ?? '') || a.groupId - b.groupId)
  const added = []
  const confirmed = []
  const warnings = []
  // Next number per series counts the rows added in this run too, so two new OP sets get consecutive codes.
  const nextNumber = (series) => {
    const nums = roster.map((s) => s.setCode.match(new RegExp(`^${series}-(\\d+)$`))).filter(Boolean).map((m) => Number(m[1]))
    return String(Math.max(0, ...nums) + 1).padStart(2, '0')
  }

  for (const s of roster) {
    if (s.codeProvisional !== true || !s.tcgplayerGroupId) continue
    const group = groups.find((g) => g.groupId === s.tcgplayerGroupId) ?? { abbreviation: null }
    const products = (await tcgcsvJson(`/tcgplayer/${TCGCSV_CATEGORY}/${s.tcgplayerGroupId}/products`)).results
    await sleep(120)
    const read = codeFromGroup(group, products)
    if (!read) continue
    if (read.code !== s.setCode) {
      if (roster.some((o) => o !== s && o.setCode === read.code)) {
        warnings.push(`${s.setCode}: TCGCSV group ${s.tcgplayerGroupId} reads as ${read.code}, which another roster row already carries; left provisional`)
        continue
      }
      renameBoxRows(s.setCode, read.code)
      confirmed.push(`${s.setCode} → ${read.code} (the sequence guessed wrong) · ${read.notes.join(' · ')}`)
      s.setCode = read.code
    } else {
      confirmed.push(`${s.setCode} · ${read.notes.join(' · ')}`)
    }
    s.codeProvisional = false
    s.codeSource = read.source
    rosterDirty = true
    if (read.disagrees) warnings.push(`${s.setCode}: TCGCSV's abbreviation for group ${s.tcgplayerGroupId} disagrees with its card numbers; the cards were kept`)
  }

  for (const g of candidates) {
    const products = (await tcgcsvJson(`/tcgplayer/${TCGCSV_CATEGORY}/${g.groupId}/products`)).results
    await sleep(120)
    const box = products.find(isPresaleBox)
    if (!box) {
      warnings.push(`TCGCSV group ${g.groupId} "${g.name}" (${g.publishedOn?.slice(0, 10) ?? 'no date'}) has no booster box on presale; not classifiable as a set, not added`)
      continue
    }
    const read = codeFromGroup(g, products)
    const series = seriesFor(box.name)
    const setCode = read ? read.code : `${series}-${nextNumber(series)}`
    if (roster.some((s) => s.setCode === setCode)) {
      warnings.push(`TCGCSV group ${g.groupId} "${g.name}" reads as ${setCode}, which is already on the roster; not added`)
      continue
    }
    if (read && !setCode.startsWith(`${series}-`)) warnings.push(`${setCode}: the box is named "${box.name}" but its cards are numbered ${setCode}; the cards were kept`)
    if (read?.disagrees) warnings.push(`${setCode}: TCGCSV's abbreviation ${g.abbreviation} disagrees with the group's card numbers; the cards were kept`)
    const enReleased = (box.presaleInfo?.releasedOn ?? g.publishedOn ?? '').slice(0, 10) || null
    const row = {
      setCode,
      setName: setNameFromBox(box.name),
      product: 'booster_box',
      language: 'EN',
      enReleased,
      cardSeedStatus: 'pending',
      codeProvisional: !read,
      codeSource: read ? read.source : 'sequence',
      sgAskSgd: null,
      usMarketUsd: null,
      boxArtUrl: null,
      asOf: AS_OF,
      usSource: `https://www.tcgplayer.com/product/${box.productId}/one-piece-card-game?Language=English`,
      tcgplayerProductId: box.productId,
      tcgplayerGroupId: g.groupId,
      tcgplayerProductName: box.name,
    }
    // Boosters stay together in the file: the new row goes after the last booster, before the starter decks.
    let at = roster.length
    for (let i = roster.length - 1; i >= 0; i--) if (roster[i].product !== 'starter_deck') { at = i + 1; break }
    roster.splice(at, 0, row)
    rosterDirty = true
    const how = read ? read.notes.join(' · ') : `provisional by sequence: no card numbers and no abbreviation in group ${g.groupId}`
    added.push(`${setCode}${read ? '' : ' (provisional)'} "${row.setName}" · ${enReleased ?? 'no date'} · box ${box.productId} · group ${g.groupId} · ${how}`)
  }
  return { added, confirmed, warnings, probed: candidates.length }
}

/** A provisional code the cards corrected: the box's daily rows follow the set to its real code. */
function renameBoxRows(from, to) {
  const file = join(DATA, 'box-price-history.csv')
  if (!existsSync(file)) return
  const rows = parseCsv(readFileSync(file, 'utf8'))
  if (!rows.some((r) => r.set_code === from)) return
  for (const r of rows) if (r.set_code === from) r.set_code = to
  if (!DRY) writeFileSync(file, toCsv(rows, BOX_HISTORY_FIELDS))
}

/**
 * Limitless confirms a provisional code: `/cards/{code}` answers 200 with the
 * set's title carrying the code once the set is listed (`… (OP18) – Limitless
 * One Piece`), 404 until then. A 200 whose title carries another set's name
 * means the sequence guessed wrong and is reported, not written.
 */
async function probeLimitless(roster) {
  const confirmed = []
  const pending = []
  const warnings = []
  for (const s of roster) {
    if (s.codeProvisional !== true) continue
    const key = codeKey(s.setCode)
    const res = await fetch(`${BASE}/cards/${key}`, { headers: { 'User-Agent': UA } })
    await sleep(DELAY_MS)
    if (res.status === 404) {
      pending.push(s.setCode)
      continue
    }
    if (!res.ok) {
      warnings.push(`${s.setCode}: Limitless answered HTTP ${res.status} for /cards/${key}; left provisional`)
      continue
    }
    const title = decode((await res.text()).match(/<title>(.*?)<\/title>/s)?.[1] ?? '')
    if (title.includes(`(${key.toUpperCase()})`)) {
      s.codeProvisional = false
      s.codeSource = 'limitless'
      rosterDirty = true
      confirmed.push(`${s.setCode} · Limitless title "${title.replace(/\s*–\s*Limitless.*$/, '')}"`)
    } else {
      warnings.push(`${s.setCode}: Limitless /cards/${key} is live but titled "${title}"; the code guess may be wrong, left provisional`)
    }
  }
  return { confirmed, pending, warnings }
}

function repinSeedVersion(counts) {
  const file = join(DATA, 'SEED-VERSION.txt')
  const lines = readFileSync(file, 'utf8').split('\n')
  const kept = lines.filter((l) => !/^[a-z]+\d+=\d+$/.test(l) && l.trim() !== '')
  const order = JSON.parse(readFileSync(join(DATA, 'sets-roster-en.json'), 'utf8')).sets.map((s) => codeKey(s.setCode))
  const merged = new Map()
  for (const l of lines) {
    const m = l.match(/^([a-z]+\d+)=(\d+)$/)
    if (m) merged.set(m[1], Number(m[2]))
  }
  for (const [k, v] of counts) merged.set(k, v)
  const body = order.filter((k) => merged.has(k)).map((k) => `${k}=${merged.get(k)}`)
  if (!DRY) writeFileSync(file, [...kept, ...body].join('\n') + '\n')
}

// ---------------------------------------------------------------- main

const rosterFile = JSON.parse(readFileSync(ROSTER_FILE, 'utf8'))
const roster = rosterFile.sets

/** The TCGCSV step: discover upcoming sets, probe Limitless for their codes, then snapshot every roster box's price (new rows included). */
async function refreshBoxes() {
  try {
    const found = await discoverUpcoming(roster)
    for (const c of found.confirmed) console.log(`  upcoming: code confirmed from TCGCSV cards ${c}`)
    for (const a of found.added) console.log(`  upcoming: added ${a}`)
    for (const w of found.warnings) console.warn(`  warn: ${w}`)
    if (!found.added.length) console.log(`  upcoming: no new presale booster box in ${found.probed} unlisted group(s)`)
  } catch (e) {
    console.error(`  upcoming: discovery skipped (${e.message})`)
  }
  try {
    const probe = await probeLimitless(roster)
    for (const c of probe.confirmed) console.log(`  upcoming: code confirmed ${c}`)
    for (const w of probe.warnings) console.warn(`  warn: ${w}`)
    if (probe.pending.length) console.log(`  upcoming: not on Limitless yet: ${probe.pending.join(' ')}`)
  } catch (e) {
    console.error(`  upcoming: Limitless probe skipped (${e.message})`)
  }
  saveRoster(rosterFile)
  const { asOf, changed, missing } = await fetchBoxPrices(roster)
  console.log(`  box-price-history.csv: ${changed} row(s) added or changed for ${asOf} (TCGCSV)${missing.length ? ' · no price: ' + missing.join(' ') : ''}`)
}

if (BOXES_ONLY) {
  await refreshBoxes()
  console.log(DRY ? 'Dry run, nothing written.' : 'Done.')
  process.exit(0)
}

const targets = roster.filter((s) => !ONLY || ONLY.includes(s.setCode.toUpperCase()))
if (targets.length === 0) {
  console.error('No roster sets matched --sets')
  process.exit(1)
}

console.log(`Refreshing ${targets.length} set(s), as_of ${AS_OF}${DRY ? ' (dry run)' : ''}`)

const index = await fetchText(`${BASE}/cards/en`)
const slugs = new Map()
for (const m of index.matchAll(/href="\/cards\/en\/([a-z]+\d+-[a-z0-9-]+)"/g)) {
  const code = m[1].split('-')[0].toUpperCase().replace(/^([A-Z]+)(\d+)$/, '$1-$2')
  if (!slugs.has(code)) slugs.set(code, m[1])
}

// Sets with their own page are fetched; hosted sets (no page) are assembled
// from their numbers on every page fetched in this run plus the roster's hosts.
const hosted = targets.filter((s) => !slugs.has(s.setCode))
const toFetch = new Map()
for (const s of targets) if (slugs.has(s.setCode)) toFetch.set(s.setCode, slugs.get(s.setCode))
if (hosted.length > 0) {
  // A hosted set's prints live on other sets' pages; fetch every page to find them.
  for (const s of roster) if (slugs.has(s.setCode)) toFetch.set(s.setCode, slugs.get(s.setCode))
}

const pages = new Map()
for (const [code, slug] of toFetch) {
  process.stdout.write(`  fetch ${code} … `)
  const html = await fetchText(`${BASE}/cards/en/${slug}?display=full&show=all&per-page=all`)
  const prints = parseBlocks(html)
  pages.set(code, prints)
  console.log(`${prints.length} prints`)
  await sleep(DELAY_MS)
}

const seededBase = loadSeededBaseRarities()
const counts = new Map()
const printsBySet = new Map()
let failures = 0
for (const set of targets) {
  let prints
  if (slugs.has(set.setCode)) {
    prints = pages.get(set.setCode)
    if (!REPRINT_SETS.test(set.setCode)) prints = prints.filter((p) => p.cardNumber.startsWith(prefixOf(set.setCode)))
  } else {
    const own = prefixOf(set.setCode)
    prints = [...pages.values()].flat().filter((p) => p.cardNumber.startsWith(own))
  }
  printsBySet.set(set.setCode, prints)
  const { rows, unmapped, noPrice } = buildRows(set, prints, seededBase)
  if (rows.length === 0) {
    // An upcoming set (7.5) has nothing on Limitless until the day it is listed; that is the expected state, not a failure.
    if (set.cardSeedStatus === 'pending') {
      console.log(`  ${set.setCode}: not on Limitless yet, still pending`)
      continue
    }
    console.log(`  ${set.setCode}: no rows found, skipped`)
    failures++
    continue
  }
  const file = join(DATA, `${codeKey(set.setCode)}-en-seed.csv`)
  const before = existsSync(file) ? parseCsv(readFileSync(file, 'utf8')).length : 0
  if (!DRY) writeFileSync(file, toCsv(rows, FIELDS))
  if (set.cardSeedStatus === 'pending') {
    // The checklist exists now: the roster row turns ready on its own (7.5). A page of its own on the
    // Limitless index is filed under the code, so finding one also confirms a provisional code.
    set.cardSeedStatus = 'ready'
    if (set.codeProvisional === true && slugs.has(set.setCode)) {
      set.codeProvisional = false
      set.codeSource = 'limitless'
    }
    rosterDirty = true
    console.log(`  ${set.setCode}: checklist seeded, roster row now ready${set.codeProvisional === true ? ' (code still provisional)' : ''}`)
  }
  const added = NO_HISTORY ? 0 : appendHistory(set.setCode, rows)
  const noCategory = writeAttributes(set.setCode, rows, prints)
  counts.set(codeKey(set.setCode), rows.length)
  const notes = []
  if (before && before !== rows.length) notes.push(`was ${before}`)
  if (noCategory.length) notes.push(`no attributes: ${noCategory.join(' ')}`)
  if (noPrice.length) notes.push(`no price: ${noPrice.join(' ')}`)
  if (unmapped.length) notes.push(`UNMAPPED: ${unmapped.join(' ')}`)
  console.log(`  ${set.setCode}: ${rows.length} rows, ${added} history points${notes.length ? ' · ' + notes.join(' · ') : ''}`)
}
repinSeedVersion(counts)
const ids = upsertProductIds(printsBySet)
if (ids) console.log(`  tcgplayer-products.csv: ${ids} product id(s) added or changed`)
saveRoster(rosterFile)
if (!NO_HISTORY) {
  try {
    await refreshBoxes()
  } catch (e) {
    console.error(`  box prices: ${e.message}`)
    failures++
  }
}
console.log(DRY ? 'Dry run, nothing written.' : 'Done.')
process.exit(failures ? 1 : 0)
