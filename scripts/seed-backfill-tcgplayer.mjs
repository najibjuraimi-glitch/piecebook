#!/usr/bin/env node
/**
 * One-off backfill of price history from TCGPlayer's product-page chart data.
 *
 *   npm run seed:backfill                    # every card in data/tcgplayer-products.csv
 *   npm run seed:backfill -- --sets OP-09    # one or more sets
 *   npm run seed:backfill -- --dry-run       # report only
 *   npm run seed:backfill -- --range quarter # quarter | semi-annual | annual (default)
 *
 * For each print, GET https://infinite-api.tcgplayer.com/price/history/{productId}/detailed?range=…
 * returns weekly buckets ({ bucketStartDate, marketPrice, … }) per SKU. We take
 * the English / Near Mint SKU (variant "Normal" when several), skip buckets
 * with no market price, and append the rest to data/price-history/{code}.csv
 * as `source=tcgplayer`, dated by bucketStartDate. Days that already have a
 * Limitless reading are left alone; the daily refresh keeps adding forward.
 *
 * This endpoint is what TCGPlayer's own product pages call; it is not a
 * published API. Approved by Jib on 5 Sep 2026 as a single backfill (see
 * docs/V1-WATCHLIST-AND-CHARTS.md). Be polite: one request at a time with a
 * pause, retries with backoff, and no re-fetch of sets already backfilled
 * unless --force is given.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')
const HISTORY_DIR = join(DATA, 'price-history')
const HISTORY_FIELDS = ['card_number', 'as_of', 'market_usd', 'source']
const UA = 'Mozilla/5.0 (Piecebook seed backfill; github.com/najibjuraimi-glitch/piecebook)'
const DELAY_MS = 350
const RETRIES = 4

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const DRY = args.includes('--dry-run')
const FORCE = args.includes('--force')
const RANGE = flag('--range') ?? 'annual'
const ONLY = flag('--sets')?.split(',').map((s) => s.trim().toUpperCase())

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const codeKey = (c) => c.replace(/-/g, '').toLowerCase()

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows, fields) => [fields.join(','), ...rows.map((r) => fields.map((f) => csvCell(r[f])).join(','))].join('\n') + '\n'
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return []
  const header = lines[0].split(',')
  return lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [header[i], v])))
}
function numKey(n) {
  const m = n.match(/^([^-]*)-(\d+)(?:p(\d+))?$/)
  return [m ? m[1] : n, m ? Number(m[2]) : 0, m && m[3] ? Number(m[3]) : 0]
}
const compareNumbers = (a, b) => {
  const [as, an, ap] = numKey(a)
  const [bs, bn, bp] = numKey(b)
  return as.localeCompare(bs) || an - bn || ap - bp || a.localeCompare(b)
}

async function fetchHistory(productId) {
  const url = `https://infinite-api.tcgplayer.com/price/history/${productId}/detailed?range=${RANGE}`
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (res.status === 404) return null
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (attempt >= RETRIES) throw err
      await sleep(1000 * 2 ** attempt)
    }
  }
}

/** Weekly points from the English Near Mint SKU; "Normal" variant preferred when there are several. */
function pointsFrom(payload) {
  const skus = (payload?.result ?? []).filter((s) => (s.language ?? 'English') === 'English' && (s.condition ?? 'Near Mint') === 'Near Mint')
  if (skus.length === 0) return []
  const sku = skus.find((s) => s.variant === 'Normal') ?? skus[0]
  const out = []
  for (const b of sku.buckets ?? []) {
    const usd = Number(b.marketPrice)
    if (!b.bucketStartDate || !Number.isFinite(usd) || usd <= 0) continue
    out.push({ as_of: b.bucketStartDate, market_usd: usd.toFixed(2) })
  }
  return out
}

const products = parseCsv(readFileSync(join(DATA, 'tcgplayer-products.csv'), 'utf8'))
const bySet = new Map()
for (const p of products) {
  if (ONLY && !ONLY.includes(p.set_code.toUpperCase())) continue
  if (!bySet.has(p.set_code)) bySet.set(p.set_code, [])
  bySet.get(p.set_code).push(p)
}
if (bySet.size === 0) {
  console.error('No products matched --sets')
  process.exit(1)
}

console.log(`Backfilling ${[...bySet.values()].reduce((n, l) => n + l.length, 0)} prints across ${bySet.size} set(s), range=${RANGE}${DRY ? ' (dry run)' : ''}`)
mkdirSync(HISTORY_DIR, { recursive: true })

let totalAdded = 0
let failures = 0
for (const [setCode, list] of bySet) {
  const file = join(HISTORY_DIR, `${codeKey(setCode)}.csv`)
  const existing = (existsSync(file) ? parseCsv(readFileSync(file, 'utf8')) : []).map((r) => ({ ...r, source: r.source || 'limitless' }))
  if (!FORCE && existing.some((r) => r.source === 'tcgplayer')) {
    console.log(`  ${setCode}: already has tcgplayer points, skipped (use --force to redo)`)
    continue
  }
  const byKey = new Map(existing.map((r) => [`${r.card_number}|${r.as_of}`, r]))
  let added = 0
  let noData = 0
  let errors = 0
  for (const p of list) {
    try {
      const payload = await fetchHistory(p.tcgplayer_product_id)
      const points = payload ? pointsFrom(payload) : []
      if (points.length === 0) noData++
      for (const pt of points) {
        const key = `${p.card_number}|${pt.as_of}`
        if (byKey.has(key)) continue // a Limitless reading for that day wins
        byKey.set(key, { card_number: p.card_number, as_of: pt.as_of, market_usd: pt.market_usd, source: 'tcgplayer' })
        added++
      }
    } catch (err) {
      errors++
      failures++
      console.log(`  ${setCode} ${p.card_number} (product ${p.tcgplayer_product_id}): ${err.message}`)
    }
    await sleep(DELAY_MS)
  }
  const all = [...byKey.values()].sort((a, b) => compareNumbers(a.card_number, b.card_number) || a.as_of.localeCompare(b.as_of))
  if (!DRY && added > 0) writeFileSync(file, toCsv(all, HISTORY_FIELDS))
  totalAdded += added
  console.log(`  ${setCode}: ${list.length} prints, ${added} weekly points added${noData ? `, ${noData} with no chart data` : ''}${errors ? `, ${errors} errors` : ''}`)
}
console.log(`${DRY ? 'Dry run. Would add' : 'Added'} ${totalAdded} points.${failures ? ` ${failures} request(s) failed; re-run with --force for those sets.` : ''}`)
process.exit(failures ? 1 : 0)
