#!/usr/bin/env node
/**
 * Sanity checks on the seed data, run in CI and before a refresh PR is opened.
 * Fails (exit 1) on anything that would put wrong or invented data in front of
 * a collector; warns on the merely odd.
 *
 *   - every roster set with cardSeedStatus ready has a CSV, and vice versa (a
 *     pending upcoming set has none; codeSource names where its code came from,
 *     and only a code still assigned by sequence is provisional and warned about)
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
 *   - set-intros.json stories (7.1): a ready booster set without a line is
 *     warned about; a line must cite Bandai's EN page, run to 22 words at most,
 *     be one sentence with no exclamation mark, avoid rarity / alt-art /
 *     campaign / anniversary words and superlatives, and name every one of the
 *     set's leaders or none of them
 *   - wiki/lines.json (7.7): CC BY-SA 3.0 notice, fetchedAt an ISO day (warn
 *     after 3 silent days), every stored line ≤22 words and without !
 *   - fx-usd-sgd.json (5.4): ECB source, positive rate equal to EUR/SGD ÷
 *     EUR/USD, asOf an ISO day; missing or older than 4 weekdays fails
 *   - health.json (9.1): asOf an ISO day; warn if missing or more than 8 days old
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
/** Where a roster row's set code was read (7.5): TCGCSV's card numbers, its group abbreviation alone, Limitless, or assigned by sequence. */
const CODE_SOURCES = new Set(['tcgcsv-cards', 'tcgcsv-abbreviation', 'limitless', 'sequence'])

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
/** Leader names per set (base prints), collected from the seed and attributes for the story check. */
const leaderNames = new Map()

const today = new Date().toISOString().slice(0, 10)
for (const set of roster) {
  const f = `${codeKey(set.setCode)}-en-seed.csv`
  // A pending row with no seed file is the normal state of an upcoming set (7.5); only a ready row must have its CSV.
  if (set.cardSeedStatus === 'ready' && !files.includes(f)) fail(`${set.setCode} is ready on the roster but ${f} is missing`)
  if (set.cardSeedStatus !== 'ready' && files.includes(f)) warn(`${set.setCode} has ${f} but is not ready on the roster`)
  // Set codes (7.5): read from the group's card numbers on TCGCSV (or Limitless); a code still assigned by
  // sequence is provisional, never displayed, and the only kind worth a warning.
  if (set.codeProvisional !== undefined && typeof set.codeProvisional !== 'boolean') fail(`${set.setCode}: codeProvisional "${set.codeProvisional}" is not true / false`)
  if (set.codeSource !== undefined && !CODE_SOURCES.has(set.codeSource)) fail(`${set.setCode}: codeSource "${set.codeSource}" is not one of ${[...CODE_SOURCES].join(' / ')}`)
  if (set.codeProvisional === true && set.codeSource !== undefined && set.codeSource !== 'sequence') fail(`${set.setCode}: codeProvisional is true but codeSource is "${set.codeSource}"; a code read from TCGCSV or Limitless is not provisional`)
  if (set.codeProvisional !== true && set.codeSource === 'sequence') fail(`${set.setCode}: codeSource is sequence but the row is not marked codeProvisional`)
  if (set.codeProvisional === true) {
    if (set.cardSeedStatus === 'ready') warn(`${set.setCode}: codeProvisional is still true on a ready set; Limitless lists the set, so the code can be confirmed`)
    if (!set.tcgplayerProductId || !set.tcgplayerGroupId) fail(`${set.setCode}: an upcoming set needs tcgplayerProductId and tcgplayerGroupId (the refresh found it through TCGCSV)`)
    warn(`${set.setCode}: code assigned by sequence; TCGCSV lists no card numbers for the group yet and Limitless has not confirmed it (never displayed)`)
    if (set.enReleased && set.enReleased < today) warn(`${set.setCode}: provisional code and the release date ${set.enReleased} has passed`)
  }
  if (set.cardSeedStatus === 'pending' && set.codeProvisional === false && set.codeSource === undefined) warn(`${set.setCode}: a pending row with a confirmed code should say where it came from (codeSource)`)
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
      if (category === 'Leader' && variant === '' && rows[i] && num.startsWith(own)) {
        if (!leaderNames.has(set.setCode)) leaderNames.set(set.setCode, new Set())
        leaderNames.get(set.setCode).add(rows[i][3])
      }
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

// Set stories (7.1): one line per booster set in set-intros.json, ours, written from Bandai's EN
// product page (or its EN card list where Bandai has no page) and never quoted. The refresh never
// writes prose, so a new set is warned about until someone writes its line.
const STORY_WORDS = 22
const STORY_BANNED = /\b(rare|rares|rarity|rarities|secret|parallel|parallels|alt-art|alt art|alternate|campaign|anniversary|treasure|foil|manga|SP|SEC|SR)\b/i
const STORY_SUPERLATIVE = /\b(most|best|greatest|strongest|biggest|largest|highest|ultimate|ever|legendary)\b/i
const BANDAI_EN = /^https:\/\/en\.onepiece-cardgame\.com\//
const intros = JSON.parse(readFileSync(join(DATA, 'set-intros.json'), 'utf8'))
for (const intro of intros) {
  if (!roster.some((s) => s.setCode === intro.setCode)) warn(`set-intros.json: ${intro.setCode} is not on the roster`)
}
/** Does the story name this leader? Matches the printed name, the name without a quoted epithet (Eustass"Captain"Kid → Eustass Kid) and its last token (Luffy), on letter boundaries. */
function namesLeader(story, name) {
  const plain = name.replace(/"[^"]*"/g, ' ').replace(/\s+/g, ' ').trim()
  const forms = new Set([name, plain, plain.split(/[. ]/).pop()])
  return [...forms].some((f) => f && new RegExp(`(^|[^A-Za-z])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z])`).test(story))
}
for (const set of roster) {
  if (set.product === 'starter_deck') continue
  const intro = intros.find((i) => i.setCode === set.setCode)
  const story = typeof intro?.introTheme === 'string' ? intro.introTheme.trim() : ''
  if (!story) {
    if (set.cardSeedStatus === 'ready') warn(`${set.setCode}: ready set without a story line (introTheme in set-intros.json)`)
    continue
  }
  const where = `set-intros.json ${set.setCode}`
  if (typeof intro.introSource !== 'string' || !BANDAI_EN.test(intro.introSource)) fail(`${where}: a story needs introSource, the Bandai EN page it was written from`)
  const words = story.split(/\s+/).length
  if (words > STORY_WORDS) fail(`${where}: story runs to ${words} words; the rule is ${STORY_WORDS}`)
  if (story.includes('!')) fail(`${where}: story has an exclamation mark`)
  if (!story.endsWith('.') || (story.match(/[.!?](\s|$)/g) ?? []).length !== 1) fail(`${where}: story must be one sentence ending in a full stop`)
  const banned = story.match(STORY_BANNED)
  if (banned) fail(`${where}: story uses "${banned[0]}" (no rarity, alt-art, campaign or anniversary words)`)
  const superlative = story.match(STORY_SUPERLATIVE)
  if (superlative) fail(`${where}: story uses the superlative "${superlative[0]}"`)
  const leaders = leaderNames.get(set.setCode)
  if (leaders && leaders.size > 0) {
    const named = [...leaders].filter((n) => namesLeader(story, n))
    if (named.length > 0 && named.length < leaders.size) {
      fail(`${where}: story names ${named.join(', ')} but not ${[...leaders].filter((n) => !named.includes(n)).join(', ')}; name every leader or none`)
    }
  }
}

// Wiki lines (7.7): the gated first sentence cache. The refresh writes it;
// a line over 22 words fails the build; three silent days is a warning.
const WIKI_WORDS = 22
const wikiPath = join(DATA, 'wiki/lines.json')
if (existsSync(wikiPath)) {
  const wiki = JSON.parse(readFileSync(wikiPath, 'utf8'))
  if (wiki.licence !== 'CC BY-SA 3.0') fail('wiki/lines.json: licence must be CC BY-SA 3.0')
  if (typeof wiki.licenceUrl !== 'string' || !wiki.licenceUrl.includes('creativecommons.org')) {
    fail('wiki/lines.json: licenceUrl must point at the Creative Commons licence')
  }
  const fetched = typeof wiki.fetchedAt === 'string' ? wiki.fetchedAt : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fetched)) fail('wiki/lines.json: fetchedAt must be an ISO day')
  else {
    const age = (Date.now() - Date.parse(`${fetched}T00:00:00Z`)) / 86_400_000
    if (age > 3) warn(`wiki/lines.json last fetched ${fetched}, ${Math.floor(age)} days ago`)
  }
  const entries = Array.isArray(wiki.entries) ? wiki.entries : []
  for (const e of entries) {
    const line = typeof e?.line === 'string' ? e.line.trim() : ''
    if (!line) continue
    const words = line.split(/\s+/).length
    if (words > WIKI_WORDS) fail(`wiki/lines.json ${e.name}: line runs to ${words} words; the rule is ${WIKI_WORDS}`)
    if (line.includes('!')) fail(`wiki/lines.json ${e.name}: line has an exclamation mark`)
  }
} else {
  warn('wiki/lines.json is missing; run npm run wiki:refresh')
}

// Wiki belong rooms (11.1): Story Arcs summaries and fruit fields. Licence
// required; 33 main arcs starting at chapter 1; no localizer junk in a fruit
// name; Imu / "The Devil's Fruit" stay out.
const summariesPath = join(DATA, 'wiki/summaries.json')
if (existsSync(summariesPath)) {
  const summaries = JSON.parse(readFileSync(summariesPath, 'utf8'))
  if (summaries.licence !== 'CC BY-SA 3.0') fail('wiki/summaries.json: licence must be CC BY-SA 3.0')
  if (typeof summaries.licenceUrl !== 'string' || !summaries.licenceUrl.includes('creativecommons.org')) {
    fail('wiki/summaries.json: licenceUrl must point at the Creative Commons licence')
  }
  const arcs = Array.isArray(summaries.arcs) ? summaries.arcs : []
  if (arcs.length !== 33) fail(`wiki/summaries.json: expected 33 main arcs, got ${arcs.length}`)
  if (arcs[0]?.firstChapter !== 1) fail('wiki/summaries.json: first arc must open at chapter 1')
  for (const a of arcs) {
    const words = typeof a?.summary === 'string' ? a.summary.trim().split(/\s+/).filter(Boolean).length : 0
    if (words < 6) fail(`wiki/summaries.json ${a?.name}: summary is under 6 words`)
    if (typeof a?.firstEpisode !== 'number') fail(`wiki/summaries.json ${a?.name}: missing firstEpisode`)
  }
} else {
  warn('wiki/summaries.json is missing; run npm run wiki:belong')
}

const fruitsPath = join(DATA, 'wiki/fruits.json')
if (existsSync(fruitsPath)) {
  const fruits = JSON.parse(readFileSync(fruitsPath, 'utf8'))
  if (fruits.licence !== 'CC BY-SA 3.0') fail('wiki/fruits.json: licence must be CC BY-SA 3.0')
  if (typeof fruits.licenceUrl !== 'string' || !fruits.licenceUrl.includes('creativecommons.org')) {
    fail('wiki/fruits.json: licenceUrl must point at the Creative Commons licence')
  }
  const list = Array.isArray(fruits.fruits) ? fruits.fruits : []
  if (list.length < 1) fail('wiki/fruits.json: no fruits')
  for (const f of list) {
    const name = typeof f?.name === 'string' ? f.name : ''
    if (/\b(viz|4kids|funimation|odex)\b/i.test(name)) fail(`wiki/fruits.json ${name}: localizer credit leaked into the name`)
    if (/devil'?s fruit/i.test(name)) fail(`wiki/fruits.json ${name}: later-name reveal fruit must not be stored`)
    const eaters = Array.isArray(f?.eaters) ? f.eaters : []
    if (eaters.some((e) => e?.name === 'Imu')) fail(`wiki/fruits.json ${name}: Imu must not be listed as an eater`)
    if (eaters.length === 0) fail(`wiki/fruits.json ${name}: no eaters`)
  }
} else {
  warn('wiki/fruits.json is missing; run npm run wiki:belong')
}

// FX (5.4): dated ECB USD→SGD. Missing or older than 4 weekdays fails
// (the table is not published on TARGET holidays; weekends do not count).
const FX_WEEKDAYS = 4
const fxPath = join(DATA, 'fx-usd-sgd.json')
function weekdaysAfter(fromIso, toIso) {
  const from = Date.parse(`${fromIso}T00:00:00Z`)
  const to = Date.parse(`${toIso}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0
  let n = 0
  for (let t = from + 86_400_000; t <= to; t += 86_400_000) {
    const day = new Date(t).getUTCDay()
    if (day !== 0 && day !== 6) n++
  }
  return n
}
if (!existsSync(fxPath)) {
  fail('fx-usd-sgd.json is missing; run npm run seed:refresh')
} else {
  const fx = JSON.parse(readFileSync(fxPath, 'utf8'))
  if (fx.source !== 'ECB') fail('fx-usd-sgd.json: source must be ECB')
  if (typeof fx.sourceUrl !== 'string' || !fx.sourceUrl.includes('ecb.europa.eu')) {
    fail('fx-usd-sgd.json: sourceUrl must point at the ECB euro table')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fx.asOf ?? '')) fail('fx-usd-sgd.json: asOf must be an ISO day')
  if (typeof fx.rate !== 'number' || fx.rate <= 0) fail('fx-usd-sgd.json: rate must be a positive number')
  if (typeof fx.eurUsd !== 'number' || fx.eurUsd <= 0) fail('fx-usd-sgd.json: eurUsd must be a positive number')
  if (typeof fx.eurSgd !== 'number' || fx.eurSgd <= 0) fail('fx-usd-sgd.json: eurSgd must be a positive number')
  const expected = Math.round((fx.eurSgd / fx.eurUsd) * 10000) / 10000
  if (Math.abs(fx.rate - expected) > 0.0001) fail(`fx-usd-sgd.json: rate ${fx.rate} is not EUR/SGD ÷ EUR/USD`)
  const today = new Date().toISOString().slice(0, 10)
  const age = weekdaysAfter(fx.asOf, today)
  if (age > FX_WEEKDAYS) fail(`fx-usd-sgd.json last dated ${fx.asOf}, ${age} weekdays ago; run npm run seed:refresh`)
}

// Health (9.1): the weekly page. Warn if the file is missing or more than
// 8 calendar days old; do not invent a figure to fill it.
const HEALTH_STALE_DAYS = 8
const healthPath = join(DATA, 'health.json')
if (!existsSync(healthPath)) {
  warn('health.json is missing; run npm run seed:refresh')
} else {
  const health = JSON.parse(readFileSync(healthPath, 'utf8'))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(health.asOf ?? '')) fail('health.json: asOf must be an ISO day')
  else {
    const age = Math.floor((Date.now() - Date.parse(`${health.asOf}T00:00:00Z`)) / 86_400_000)
    if (age > HEALTH_STALE_DAYS) warn(`health.json last dated ${health.asOf}, ${age} days ago; run npm run seed:refresh`)
  }
  if (!Array.isArray(health.unpriced)) fail('health.json: unpriced must be a list')
  if (!Array.isArray(health.exclusions)) fail('health.json: exclusions must be a list')
  if (!Array.isArray(health.warnings)) fail('health.json: warnings must be a list')
}

for (const w of warnings) console.warn(`warn: ${w}`)
for (const e of errors) console.error(`FAIL: ${e}`)
console.log(`${files.length} seed files, ${[...counts.values()].reduce((a, b) => a + b, 0)} rows, ${errors.length} errors, ${warnings.length} warnings`)
process.exit(errors.length ? 1 : 0)
