#!/usr/bin/env node
/**
 * Fetch the Belong page's wiki rooms (draft 11): arc summaries and episode
 * ranges from Story Arcs, and Devil Fruit fields from each mapped name's
 * Char Box. One Piece Wiki, CC BY-SA 3.0. Never an image.
 *
 *   npm run wiki:belong
 *   npm run wiki:belong -- --dry-run
 *
 * Writes data/wiki/summaries.json and data/wiki/fruits.json. 120 ms between
 * requests under User-Agent: Piecebook/1.0. Fruit later-names that sit in
 * <small> or after <br> (Nika on Luffy) are dropped, not stored.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WIKI_DIR = join(ROOT, 'data/wiki')
const API = 'https://onepiece.fandom.com/api.php'
const WIKI = 'https://onepiece.fandom.com/wiki/'
const UA = 'Piecebook/1.0 (+https://github.com/najibjuraimi-glitch/piecebook)'
const DELAY_MS = 120
const RETRY_MS = 2000
const ARC_PAGE = 'Story Arcs'
const DRY = process.argv.includes('--dry-run')
const TODAY = new Date().toISOString().slice(0, 10)
const LICENCE = {
  source: 'One Piece Wiki (onepiece.fandom.com)',
  licence: 'CC BY-SA 3.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
}

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

let requests = 0

async function apiGet(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  for (let attempt = 0; ; attempt++) {
    requests++
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status >= 500 && attempt === 0) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
      const json = await res.json()
      await new Promise((ok) => setTimeout(ok, DELAY_MS))
      return json
    } catch (e) {
      if (attempt > 0) throw e
      console.warn(`  warn: ${e.message}; retrying in ${RETRY_MS / 1000} s`)
      await new Promise((ok) => setTimeout(ok, RETRY_MS))
    }
  }
}

async function parsePage(page, { section = 0 } = {}) {
  const params = { action: 'parse', page, prop: 'wikitext|revid', redirects: 1 }
  if (section !== null) params.section = String(section)
  const json = await apiGet(params)
  if (json.error) {
    if (['missingtitle', 'invalidtitle', 'nosuchsection'].includes(json.error.code)) return null
    throw new Error(`${page}: ${json.error.code} ${json.error.info}`)
  }
  const p = json.parse
  return { title: p.title, revid: p.revid ?? null, wikitext: p.wikitext?.['*'] ?? '' }
}

function matchClose(text, start) {
  const stack = []
  let i = start
  while (i < text.length) {
    if (text.startsWith('{{', i)) {
      stack.push('}}')
      i += 2
    } else if (text.startsWith('[[', i)) {
      stack.push(']]')
      i += 2
    } else if ((text.startsWith('}}', i) || text.startsWith(']]', i)) && stack[stack.length - 1] === text.slice(i, i + 2)) {
      stack.pop()
      i += 2
      if (stack.length === 0) return i
    } else i++
  }
  return -1
}

function splitParams(inner) {
  const parts = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2)
    if (two === '{{' || two === '[[') {
      depth++
      cur += two
      i++
    } else if (two === '}}' || two === ']]') {
      depth--
      cur += two
      i++
    } else if (inner[i] === '|' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += inner[i]
  }
  parts.push(cur)
  return parts
}

function parseTemplate(tpl) {
  const inner = tpl.slice(2, -2)
  const [name, ...params] = splitParams(inner)
  const positional = []
  const named = {}
  for (const p of params) {
    const eq = p.indexOf('=')
    if (eq > 0 && /^[\w\s-]+$/.test(p.slice(0, eq))) named[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim()
    else positional.push(p.trim())
  }
  return { name: name.trim(), positional, named }
}

function findCharBox(text) {
  const m = /\{\{\s*Char Box\b/i.exec(text)
  if (!m) return null
  const end = matchClose(text, m.index)
  if (end < 0) return null
  return parseTemplate(text.slice(m.index, end)).named
}

const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '')
const stripRefs = (s) => s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')

function cleanText(raw) {
  let s = stripRefs(stripComments(raw ?? ''))
  let guard = 0
  for (;;) {
    const m = /\{\{/.exec(s)
    if (!m || guard++ > 200) break
    const end = matchClose(s, m.index)
    if (end < 0) {
      s = s.slice(0, m.index) + s.slice(m.index + 2)
      continue
    }
    const tpl = s.slice(m.index, end)
    const { name, positional } = parseTemplate(tpl)
    let keep = ''
    if (/^(nihongo|ruby)$/i.test(name)) keep = positional[0] ?? ''
    else if (/^(w|wp|wikipedia)$/i.test(name)) keep = (positional[1] ?? positional[0] ?? '').replace(/#.*$/, '')
    s = s.slice(0, m.index) + keep + s.slice(end)
  }
  s = s.replace(/\[\[[^\]]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1')
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  s = decode(s).replace(/'''''|'''|''/g, '')
  s = s.replace(/\s*\([^()]*[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef][^()]*\)/g, '')
  s = s.replace(/\s+([,.;:])/g, '$1').replace(/\s+/g, ' ').trim()
  return s
}

/** First displayed line of a Char Box fruit field: drop <br>/<small> later-names (Nika). */
function fruitFirstLine(value) {
  if (!value) return ''
  let s = String(value)
  s = s.split(/<br\s*\/?>/i)[0]
  s = s.replace(/<small>[\s\S]*$/i, '')
  s = s.replace(/\{\{[^}]*\}\}/g, ' ')
  s = s.replace(/\[\[[^\]]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1')
  s = s.replace(/<[^>]+>/g, '')
  return decode(s).replace(/'''''|'''|''/g, '').replace(/\s+/g, ' ').trim()
}

/** Drop localizer credits and keep one English name (`Slip-Slip Fruit`, not `Slip-Slip Fruit (Viz, 4Kids)`). */
function tidyFruitName(s) {
  if (!s) return ''
  let t = s.replace(/\s*\((?:Viz|VIZ|4Kids|Funimation|Odex|Grand Adventure)[^)]*\)/gi, '')
  t = t.replace(/\s*;\s*/g, ' ')
  t = t.replace(/\s*\([^)]* no Mi[^)]*\)\s*$/i, '')
  t = t.replace(/\s+/g, ' ').replace(/[;,.]+$/, '').trim()
  const first = t.match(/^(.+?(?:Fruit|Jutsu|SMILE))(?:\s|$)/i)
  return (first ? first[1] : t).trim()
}

function isNameReveal(entry) {
  const words = (s) => String(s ?? '').replace(/[."']/g, ' ').split(/\s+/).filter(Boolean)
  return words(entry.title).length > words(entry.name).length
}

function parseRangeList(body) {
  const text = (body ?? '').trim()
  if (!text) return { first: null, last: null }
  const nums = []
  for (const m of text.matchAll(/(\d+)\s*[-–—]\s*(\d+)/g)) {
    nums.push(Number(m[1]), Number(m[2]))
  }
  for (const m of text.matchAll(/(\d+)\s*[-–—]\s*(?=\s|$)/g)) nums.push(Number(m[1]))
  for (const m of text.matchAll(/\b(\d+)\b/g)) nums.push(Number(m[1]))
  if (nums.length === 0) return { first: null, last: null }
  const open = /[-–—]\s*$/.test(text)
  return { first: Math.min(...nums), last: open ? null : Math.max(...nums) }
}

/**
 * Main-story arcs on Story Arcs: heading, the paragraph under it, then
 * Chapters (a-b) and Episodes (c-d) bullets. Filler-only arcs are skipped
 * (they sit outside "Main Story Arcs").
 */
function parseStoryArcs(wikitext) {
  const arcs = []
  let inMain = false
  let current = null
  let blurb = []
  const flush = () => {
    if (!current) return
    current.summary = cleanText(blurb.join(' '))
    current.summaryWords = current.summary ? current.summary.split(/\s+/).filter(Boolean).length : 0
    if (current.firstChapter != null) arcs.push(current)
    current = null
    blurb = []
  }
  for (const line of wikitext.split('\n')) {
    const h2 = line.match(/^==([^=].*?)==\s*$/)
    if (h2) {
      flush()
      inMain = /Main Story Arcs/i.test(h2[1])
      continue
    }
    if (!inMain) continue
    const h4 = line.match(/^====\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*====\s*$/)
    if (h4) {
      flush()
      current = {
        name: h4[1].trim(),
        firstChapter: null,
        lastChapter: null,
        firstEpisode: null,
        lastEpisode: null,
        summary: '',
        summaryWords: 0,
      }
      blurb = []
      continue
    }
    if (!current) continue
    const chapters = /^\*.*Chapters.*?\(([^)]*)\)/.exec(line)
    if (chapters) {
      const r = parseRangeList(chapters[1])
      current.firstChapter = r.first
      current.lastChapter = r.last
      continue
    }
    const episodes = /^\*.*Episodes.*?\(([^)]*)\)/.exec(line)
    if (episodes) {
      const r = parseRangeList(episodes[1])
      current.firstEpisode = r.first
      current.lastEpisode = r.last
      continue
    }
    if (line.startsWith('*') || line.startsWith('!') || line.startsWith('{|') || line.startsWith('|}')) continue
    if (line.trim() === '') continue
    if (!current.firstChapter && !current.firstEpisode) blurb.push(line)
  }
  flush()
  return arcs.sort((a, b) => (a.firstChapter ?? 0) - (b.firstChapter ?? 0))
}

const tabsTopOf = (wikitext) => /\{\{\s*([^{}|]+?)\s+Tabs Top\s*\}\}/i.exec(wikitext)?.[1]?.trim() ?? null

async function fruitFor(entry) {
  const page = await parsePage(entry.title, { section: 0 })
  if (!page) return null
  let box = findCharBox(page.wikitext)
  let tabsName = tabsTopOf(page.wikitext)
  if (!box && !tabsName) tabsName = entry.title
  if (tabsName) {
    const tabs = await parsePage(`Template:${tabsName} Tabs Top`)
    const fromTabs = tabs ? findCharBox(tabs.wikitext) : null
    if (fromTabs) box = fromTabs
  }
  if (!box) return null
  const jname = fruitFirstLine(box.dfname)
  const name = fruitFirstLine(box.dfename) || jname
  const type = fruitFirstLine(box.dftype)
  if (!name && !jname) return null
  const en = tidyFruitName(name || jname)
  const jp = tidyFruitName(jname)
  if (!en && !jp) return null
  return { name: en || jp, jname: jp && jp !== (en || jp) ? jp : jp || null, type: type || null }
}

const started = Date.now()
console.log(`Wiki belong refresh: ${TODAY}${DRY ? ' (dry run)' : ''}`)

const story = await parsePage(ARC_PAGE, { section: null })
if (!story) throw new Error(`${ARC_PAGE}: missing`)
const arcs = parseStoryArcs(story.wikitext)
if (arcs.length < 10 || arcs[0].firstChapter !== 1) {
  throw new Error(`${ARC_PAGE}: only ${arcs.length} arc(s) parsed`)
}
const withSummary = arcs.filter((a) => a.summaryWords >= 6).length
const withEpisodes = arcs.filter((a) => a.firstEpisode != null).length
console.log(`  Story Arcs revid ${story.revid}: ${arcs.length} arcs, ${withSummary} summaries, ${withEpisodes} episode ranges`)
for (const a of arcs) {
  const ch = a.lastChapter == null ? `${a.firstChapter}–` : `${a.firstChapter}–${a.lastChapter}`
  const ep =
    a.firstEpisode == null ? 'no episodes' : a.lastEpisode == null ? `ep ${a.firstEpisode}–` : `ep ${a.firstEpisode}–${a.lastEpisode}`
  console.log(`    ${a.name} · ch ${ch} · ${ep} · ${a.summaryWords} words`)
}

const linesFile = join(WIKI_DIR, 'lines.json')
const lines = existsSync(linesFile) ? JSON.parse(readFileSync(linesFile, 'utf8')) : { entries: [] }
const fruitsByKey = new Map()
let asked = 0
let withFruit = 0
for (const entry of lines.entries ?? []) {
  asked++
  let fruit
  try {
    fruit = await fruitFor(entry)
  } catch (e) {
    console.warn(`  ${entry.name}: ERROR ${e.message}`)
    continue
  }
  // Imu → Nerona Imu is a later-name reveal; the fruit field is "The Devil's Fruit".
  // Polo Marco / Kurozumi Kanjuro stay: the printed name is what the dex lists.
  if (!fruit || (isNameReveal(entry) && /devil/i.test(fruit.name))) continue
  withFruit++
  const key = fruit.jname || fruit.name
  const row = fruitsByKey.get(key) ?? { ...fruit, eaters: [] }
  if (!row.eaters.some((e) => e.name === entry.name)) {
    row.eaters.push({
      name: entry.name,
      debutChapter: entry.debutChapter ?? null,
      arc: entry.arc ?? null,
    })
  }
  fruitsByKey.set(key, row)
  console.log(`  ${entry.name}: ${fruit.name}${fruit.jname && fruit.jname !== fruit.name ? ` (${fruit.jname})` : ''}${fruit.type ? ` · ${fruit.type}` : ''}`)
}

const fruits = [...fruitsByKey.values()]
  .map((f) => {
    const chapters = f.eaters.map((e) => e.debutChapter).filter((n) => typeof n === 'number')
    return {
      name: f.name,
      jname: f.jname && f.jname !== f.name ? f.jname : null,
      type: f.type,
      firstChapter: chapters.length ? Math.min(...chapters) : null,
      eaters: f.eaters.sort((a, b) => a.name.localeCompare(b.name)),
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const summaries = {
  ...LICENCE,
  title: story.title,
  revid: story.revid,
  url: `${WIKI}${encodeURI(story.title.replace(/ /g, '_'))}?oldid=${story.revid}`,
  fetchedAt: TODAY,
  rules:
    'Each summary is the paragraph under the arc on the wiki Story Arcs page, cleaned, never paraphrased. Episode numbers are the same page. Chapter pages are titles, not plots; official synopses are not stored. A later-name in a fruit field after a line break is dropped.',
  arcs,
}

const fruitOut = {
  ...LICENCE,
  fetchedAt: TODAY,
  asked,
  withFruit,
  rules:
    'English and Japanese names and the type are the first displayed line of the Char Box dfename / dfname / dftype on a mapped printed name. Text after a line break or in small print is a later name and is not stored. No images.',
  fruits,
}

if (!DRY) {
  mkdirSync(WIKI_DIR, { recursive: true })
  writeFileSync(join(WIKI_DIR, 'summaries.json'), JSON.stringify(summaries, null, 2) + '\n')
  writeFileSync(join(WIKI_DIR, 'fruits.json'), JSON.stringify(fruitOut, null, 2) + '\n')
}

const seconds = ((Date.now() - started) / 1000).toFixed(1)
console.log(
  `Summary: ${arcs.length} arcs, ${fruits.length} fruits from ${withFruit}/${asked} names · ${requests} requests · ${seconds} s${DRY ? ' · dry run, nothing written' : ''}`,
)
