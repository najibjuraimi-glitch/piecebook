#!/usr/bin/env node
/**
 * Sanity checks on the seed data, run in CI and before a refresh PR is opened.
 * Fails (exit 1) on anything that would put wrong or invented data in front of
 * a collector; warns on the merely odd.
 *
 *   - every roster set with cardSeedStatus ready has a CSV, and vice versa
 *   - CSV header is exactly the documented contract
 *   - set_code on every row equals the file's set; regular sets hold only
 *     same-set numbers (PRB reprint sets may hold any)
 *   - card numbers unique within a file; base checklist has no gaps
 *   - rarity is a known code; market_usd is blank or a non-negative number;
 *     as_of is blank iff market_usd is blank, else an ISO date
 *   - image_url is on the Limitless CDN (nothing else is ever hotlinked)
 *   - SEED-VERSION.txt row counts match the files
 *   - price-history files parse, with one row per card per day
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const HEADER = 'set_code,set_name,card_number,name,rarity,language,image_url,market_usd,as_of'
const RARITIES = new Set(['L', 'C', 'UC', 'R', 'SR', 'SEC', 'SP', 'TR', 'P'])
const CDN = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/'
const REPRINT = /^PRB-/

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

for (const set of roster) {
  const f = `${codeKey(set.setCode)}-en-seed.csv`
  if (set.cardSeedStatus === 'ready' && !files.includes(f)) fail(`${set.setCode} is ready on the roster but ${f} is missing`)
  if (set.cardSeedStatus !== 'ready' && files.includes(f)) warn(`${set.setCode} has ${f} but is not ready on the roster`)
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
    const [setCode, setName, num, name, rarity, lang, img, usd, asOf] = r
    if (r.length !== 9) fail(`${f}:${line}: ${r.length} fields`)
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
}

const version = readFileSync(join(DATA, 'SEED-VERSION.txt'), 'utf8')
for (const [key, n] of counts) {
  const m = version.match(new RegExp(`^${key}=(\\d+)$`, 'm'))
  if (!m) fail(`SEED-VERSION.txt has no line for ${key}`)
  else if (Number(m[1]) !== n) fail(`SEED-VERSION.txt says ${key}=${m[1]} but the file has ${n} rows`)
}

const historyDir = join(DATA, 'price-history')
if (existsSync(historyDir)) {
  for (const f of readdirSync(historyDir).filter((f) => f.endsWith('.csv'))) {
    const { header, rows } = parseCsv(readFileSync(join(historyDir, f), 'utf8'))
    if (header !== 'card_number,as_of,market_usd') fail(`price-history/${f}: header "${header}"`)
    const seen = new Set()
    rows.forEach((r, i) => {
      const [num, asOf, usd] = r
      const key = `${num}|${asOf}`
      if (seen.has(key)) fail(`price-history/${f}:${i + 2}: duplicate ${key}`)
      seen.add(key)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) fail(`price-history/${f}:${i + 2}: as_of "${asOf}"`)
      if (!/^\d+(\.\d{1,2})?$/.test(usd)) fail(`price-history/${f}:${i + 2}: market_usd "${usd}"`)
    })
  }
}

for (const w of warnings) console.warn(`warn: ${w}`)
for (const e of errors) console.error(`FAIL: ${e}`)
console.log(`${files.length} seed files, ${[...counts.values()].reduce((a, b) => a + b, 0)} rows, ${errors.length} errors, ${warnings.length} warnings`)
process.exit(errors.length ? 1 : 0)
