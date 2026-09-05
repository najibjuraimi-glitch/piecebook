#!/usr/bin/env node
/**
 * Sanity checks on the seed data, run in CI and before a refresh PR is opened.
 * Fails (exit 1) on anything that would put wrong or invented data in front of
 * a collector; warns on the merely odd.
 *
 *   - every roster set with cardSeedStatus ready has a CSV, and vice versa (a
 *     pending upcoming set has none; a provisional code is boolean-flagged,
 *     only on pending rows, and warned about once its release date has passed)
 *   - CSV header is exactly the documented contract
 *   - set_code on every row equals the file's set; regular sets hold only
 *     same-set numbers (PRB reprint sets may hold any)
 *   - card numbers unique within a file; base checklist has no gaps
 *   - rarity is a known code; market_usd is blank or a non-negative number;
 *     as_of is blank iff market_usd is blank, else an ISO date
 *   - image_url is on the Limitless CDN (nothing else is ever hotlinked)
 *   - SEED-VERSION.txt row counts match the files
 *   - variant is set on every parallel and blank on every base print
 *   - card-attributes/{code}.csv mirrors the seed row for row, with a known
 *     category, numeric stats and legality values
 *   - price-history files parse, with one row per card per day and a known source
 *   - tcgplayer-products.csv: unique card numbers, roster sets, numeric ids
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const HEADER = 'set_code,set_name,card_number,name,rarity,language,image_url,market_usd,as_of,variant'
const ATTR_HEADER = 'card_number,variant,category,color,cost,life,power,counter,attribute,types,effect,trigger,artist,block,standard,extra'
const CATEGORIES = new Set(['Leader', 'Character', 'Event', 'Stage'])
const RARITIES = new Set(['L', 'C', 'UC', 'R', 'SR', 'SEC', 'SP', 'TR', 'P'])
const CDN = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/'
const REPRINT = /^(PRB|ST)-/

const errors = []
const warnings = []
const fail = (m) => errors.push(m)
const warn = (m) => warnings.push(m)

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
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
  return { header: lines[0] ?? '', rows: lines.slice(1).map(split) }
}

const codeKey = (c) => c.replace(/-/g, '').toLowerCase()
const roster = JSON.parse(readFileSync(join(DATA, 'sets-roster-en.json'), 'utf8')).sets
const files = readdirSync(DATA).filter((f) => f.endsWith('-en-seed.csv'))
const counts = new Map()

const today = new Date().toISOString().slice(0, 10)
for (const set of roster) {
  const f = `${codeKey(set.setCode)}-en-seed.csv`
  // A pending row with no seed file is the normal state of an upcoming set (7.5); only a ready row must have its CSV.
  if (set.cardSeedStatus === 'ready' && !files.includes(f)) fail(`${set.setCode} is ready on the roster but ${f} is missing`)
  if (set.cardSeedStatus !== 'ready' && files.includes(f)) warn(`${set.setCode} has ${f} but is not ready on the roster`)
  // Provisional codes (7.5): a guess by sequence until Limitless lists the set; never displayed, so a stale one is worth a look.
  if (set.codeProvisional !== undefined && typeof set.codeProvisional !== 'boolean') fail(`${set.setCode}: codeProvisional "${set.codeProvisional}" is not true / false`)
  if (set.codeProvisional === true) {
    if (set.cardSeedStatus === 'ready') warn(`${set.setCode}: codeProvisional is still true on a ready set; Limitless lists the set, so the code can be confirmed`)
    if (!set.tcgplayerProductId || !set.tcgplayerGroupId) fail(`${set.setCode}: an upcoming set needs tcgplayerProductId and tcgplayerGroupId (the refresh found it through TCGCSV)`)
    if (set.enReleased && set.enReleased < today) warn(`${set.setCode}: provisional code and the release date ${set.enReleased} has passed; Limitless has not confirmed the set yet`)
  }
}
for (const f of files) {
  const key = f.replace('-en-seed.csv', '')
  if (!roster.some((s) => codeKey(s.setCode) === key)) fail(`${f} has no roster row`)
}

for (const f of files) {
  const set = roster.find((s) => codeKey(s.setCode) === f.replace('-en-seed.csv', ''))
  if (!set) continue
  const { header, rows } = parseCsv(readFileSync(join(DATA, f), 'utf8'))
  if (header !== HEADER) fail(`${f}: header is "${header}"`)
  const own = `${set.setCode.replace(/-/g, '')}-`
  const seen = new Set()
  const bases = new Set()
  rows.forEach((r, i) => {
    const line = i + 2
    const [setCode, setName, num, name, rarity, lang, img, usd, asOf, variant] = r
    if (r.length !== 10) fail(`${f}:${line}: ${r.length} fields`)
    if (/p\d+$/.test(num) !== (variant !== '')) fail(`${f}:${line}: variant "${variant}" on ${num} (parallels need one, base prints none)`)
    if (setCode !== set.setCode) fail(`${f}:${line}: set_code ${setCode}`)
    if (setName !== set.setName) warn(`${f}:${line}: set_name "${setName}" differs from roster "${set.setName}"`)
    if (!/^[A-Z0-9]+-\d+(p\d+)?$/.test(num)) fail(`${f}:${line}: card_number "${num}"`)
    if (!REPRINT.test(set.setCode) && !num.startsWith(own)) fail(`${f}:${line}: cross-set number ${num} in a regular set`)
    if (seen.has(num)) fail(`${f}:${line}: duplicate ${num}`)
    seen.add(num)
    if (num.startsWith(own) && !/p\d+$/.test(num)) bases.add(Number(num.slice(own.length)))
    if (!name) fail(`${f}:${line}: empty name`)
    if (!RARITIES.has(rarity)) fail(`${f}:${line}: rarity "${rarity}"`)
    if (lang !== 'EN') fail(`${f}:${line}: language "${lang}"`)
    if (!img.startsWith(CDN)) fail(`${f}:${line}: image_url not on the Limitless CDN`)
    if (usd !== '' && !(/^\d+(\.\d{1,2})?$/.test(usd) && Number(usd) >= 0)) fail(`${f}:${line}: market_usd "${usd}"`)
    if ((usd === '') !== (asOf === '')) fail(`${f}:${line}: market_usd and as_of must be blank together`)
    if (asOf !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) fail(`${f}:${line}: as_of "${asOf}"`)
  })
  if (bases.size > 0) {
    const max = Math.max(...bases)
    const missing = []
    for (let n = 1; n <= max; n++) if (!bases.has(n)) missing.push(n)
    if (missing.length) fail(`${f}: base checklist gaps ${missing.join(',')}`)
  }
  counts.set(f.replace('-en-seed.csv', ''), rows.length)

  // Attributes file: same card numbers, in the same order, with known categories and legality values.
  const attrFile = join(DATA, 'card-attributes', `${codeKey(set.setCode)}.csv`)
  if (!existsSync(attrFile)) {
    fail(`card-attributes/${codeKey(set.setCode)}.csv is missing`)
  } else {
    const attrs = parseCsv(readFileSync(attrFile, 'utf8'))
    if (attrs.header !== ATTR_HEADER) fail(`card-attributes/${codeKey(set.setCode)}.csv: header "${attrs.header}"`)
    if (attrs.rows.length !== rows.length) fail(`card-attributes/${codeKey(set.setCode)}.csv: ${attrs.rows.length} rows vs ${rows.length} in the seed`)
    attrs.rows.forEach((a, i) => {
      const [num, variant, category, , cost, life, power, counter, , , , , , block, standard, extra] = a
      const line = i + 2
      if (rows[i] && rows[i][2] !== num) fail(`card-attributes/${codeKey(set.setCode)}.csv:${line}: ${num} out of step with the seed (${rows[i][2]})`)
      if (rows[i] && rows[i][9] !== variant) fail(`card-attributes/${codeKey(set.setCode)}.csv:${line}: variant differs from the seed`)
      if (!CATEGORIES.has(category)) fail(`card-attributes/${codeKey(set.setCode)}.csv:${line}: category "${category}"`)
      for (const [label, v] of [['cost', cost], ['life', life], ['power', power], ['counter', counter], ['block', block]]) {
        if (v !== '' && !/^\d+$/.test(v)) fail(`card-attributes/${codeKey(set.setCode)}.csv:${line}: ${label} "${v}"`)
      }
      if (category === 'Leader' && life === '') warn(`card-attributes/${codeKey(set.setCode)}.csv:${line}: Leader without life`)
      for (const [label, v] of [['standard', standard], ['extra', extra]]) {
        if (!['', 'legal', 'not legal'].includes(v)) fail(`card-attributes/${codeKey(set.setCode)}.csv:${line}: ${label} "${v}"`)
      }
    })
  }
}

const version = readFileSync(join(DATA, 'SEED-VERSION.txt'), 'utf8')
for (const [key, n] of counts) {
  const m = version.match(new RegExp(`^${key}=(\\d+)$`, 'm'))
  if (!m) fail(`SEED-VERSION.txt has no line for ${key}`)
  else if (Number(m[1]) !== n) fail(`SEED-VERSION.txt says ${key}=${m[1]} but the file has ${n} rows`)
}

const SOURCES = new Set(['limitless', 'tcgplayer'])
const historyDir = join(DATA, 'price-history')
if (existsSync(historyDir)) {
  for (const f of readdirSync(historyDir).filter((f) => f.endsWith('.csv'))) {
    const { header, rows } = parseCsv(readFileSync(join(historyDir, f), 'utf8'))
    if (header !== 'card_number,as_of,market_usd,source') fail(`price-history/${f}: header "${header}"`)
    const seen = new Set()
    rows.forEach((r, i) => {
      const [num, asOf, usd, source] = r
      const key = `${num}|${asOf}`
      if (seen.has(key)) fail(`price-history/${f}:${i + 2}: duplicate ${key}`)
      seen.add(key)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) fail(`price-history/${f}:${i + 2}: as_of "${asOf}"`)
      if (!/^\d+(\.\d{1,2})?$/.test(usd) || Number(usd) <= 0) fail(`price-history/${f}:${i + 2}: market_usd "${usd}"`)
      if (!SOURCES.has(source)) fail(`price-history/${f}:${i + 2}: source "${source}"`)
    })
  }
}

// Box prices: daily TCGplayer market via TCGCSV (decision 3.1), one row per set per day.
const BOX_STALE_DAYS = 3
const boxHistory = join(DATA, 'box-price-history.csv')
if (existsSync(boxHistory)) {
  const { header, rows } = parseCsv(readFileSync(boxHistory, 'utf8'))
  if (header !== 'set_code,as_of,market_usd,low_usd,source') fail(`box-price-history.csv: header "${header}"`)
  const seen = new Set()
  let newest = ''
  rows.forEach((r, i) => {
    const [setCode, asOf, market, low, source] = r
    const key = `${setCode}|${asOf}`
    if (seen.has(key)) fail(`box-price-history.csv:${i + 2}: duplicate ${key}`)
    seen.add(key)
    const set = roster.find((s) => s.setCode === setCode)
    if (!set) fail(`box-price-history.csv:${i + 2}: unknown set ${setCode}`)
    else if (!set.tcgplayerProductId) fail(`box-price-history.csv:${i + 2}: ${setCode} has no tcgplayerProductId on the roster`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) fail(`box-price-history.csv:${i + 2}: as_of "${asOf}"`)
    if (!/^\d+(\.\d{1,2})?$/.test(market) || Number(market) <= 0) fail(`box-price-history.csv:${i + 2}: market_usd "${market}"`)
    if (low !== '' && !/^\d+(\.\d{1,2})?$/.test(low)) fail(`box-price-history.csv:${i + 2}: low_usd "${low}"`)
    if (source !== 'tcgcsv') fail(`box-price-history.csv:${i + 2}: source "${source}"`)
    if (asOf > newest) newest = asOf
  })
  if (newest) {
    const age = Math.floor((Date.now() - Date.parse(newest)) / 86_400_000)
    if (age > BOX_STALE_DAYS) warn(`box prices: newest TCGCSV row is ${newest}, ${age} days old; the daily feed may have stopped`)
  }
  for (const s of roster) {
    if (s.tcgplayerProductId && !rows.some((r) => r[0] === s.setCode)) warn(`box prices: ${s.setCode} has a tcgplayerProductId but no row in box-price-history.csv`)
  }
}
for (const s of roster) {
  if (s.usMarketUsd != null && !s.tcgplayerProductId) warn(`${s.setCode}: roster has a US box price but no tcgplayerProductId; the daily feed cannot update it`)
}

const productsFile = join(DATA, 'tcgplayer-products.csv')
if (existsSync(productsFile)) {
  const { header, rows } = parseCsv(readFileSync(productsFile, 'utf8'))
  if (header !== 'card_number,set_code,tcgplayer_product_id') fail(`tcgplayer-products.csv: header "${header}"`)
  const seen = new Set()
  rows.forEach((r, i) => {
    const [num, setCode, id] = r
    if (seen.has(num)) fail(`tcgplayer-products.csv:${i + 2}: duplicate ${num}`)
    seen.add(num)
    if (!roster.some((s) => s.setCode === setCode)) fail(`tcgplayer-products.csv:${i + 2}: unknown set ${setCode}`)
    if (!/^\d+$/.test(id)) fail(`tcgplayer-products.csv:${i + 2}: product id "${id}"`)
  })
}

for (const w of warnings) console.warn(`warn: ${w}`)
for (const e of errors) console.error(`FAIL: ${e}`)
console.log(`${files.length} seed files, ${[...counts.values()].reduce((a, b) => a + b, 0)} rows, ${errors.length} errors, ${warnings.length} warnings`)
process.exit(errors.length ? 1 : 0)
