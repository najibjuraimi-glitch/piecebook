#!/usr/bin/env node
/**
 * Fetch, gate and cache one wiki line per card name (growth-map task 7.7).
 *
 *   npm run wiki:refresh -- --all                       # every Character / Leader name in every seed
 *   npm run wiki:refresh -- --sets OP-01,OP-09          # the names printed in those sets
 *   npm run wiki:refresh -- --names Shanks,Nami         # printed card names, as on the card
 *   npm run wiki:refresh -- --leaders                   # add every Leader name in any set
 *   npm run wiki:refresh -- --sets OP-01 --dry-run      # report only, write nothing
 *
 * Source: the One Piece Wiki (https://onepiece.fandom.com), MediaWiki API,
 * text under CC BY-SA 3.0. Two parse calls per name, 120 ms apart, under the
 * User-Agent below, never an image:
 *   (a) action=parse&page=<title>&prop=wikitext|revid|categories&section=0&redirects=1
 *   (b) action=parse&page=Template:<title>_Tabs_Top&prop=wikitext&section=0&redirects=1
 *       only when section 0 transcludes a {{… Tabs Top}} template or carries
 *       no {{Char Box}} of its own (Gol D. Roger, Yamato and Uta keep the box
 *       in the article itself; Shanks, Nami and Kaidou keep it in Tabs Top).
 * Plus one call for the arc list: action=parse&page=Story_Arcs.
 *
 * Names. Character and Leader cards from data/{code}-en-seed.csv (column
 * name) joined by card_number to data/card-attributes/{code}.csv (column
 * category); Event and Stage names are recorded as unmapped without a
 * request, since only a character has a Char Box. Card names use Bandai's
 * dotted form, which the wiki does not redirect, so the mapping is a rule:
 *   - a name with "&" is two characters on one card: unmapped "pair"
 *   - quoted epithets go: Eustass"Captain"Kid → Eustass Kid
 *   - a codename card (Mr. / Ms. / Miss …) carries the real name in
 *     parentheses and that is the title: Mr.1(Daz.Bonez) → Daz Bonez; any
 *     other parenthesis is a disambiguator and is dropped: Zephyr (Navy) → Zephyr
 *   - a leading "St. " goes (the wiki titles Jaygarcia Saturn, not St. …)
 *   - dots become spaces, a single-letter part or an honorific keeps its dot:
 *     Monkey.D.Luffy → Monkey D. Luffy, Tony Tony.Chopper → Tony Tony Chopper,
 *     X.Drake → X. Drake, Mr.9 → Mr. 9; a name that is only initials (A.O.)
 *     stays as written
 *   - redirects=1 does the rest (Kaido → Kaidou, Ms. Wednesday → Nefertari Vivi)
 * A missing title is data (unmapped "no page"), not an error.
 *
 * Gate (docs: the PM memo's spoiler policy, implemented as written):
 *   1. Inputs: sentence one of paragraph one of section 0; first, birth and
 *      status from the {{Char Box}}. No Char Box, Category:Unreleased Content,
 *      a pair or no page: nothing stored.
 *   2. Debut D: the first [[Chapter N]] in `first`, else its Qref's chap=.
 *      Cutoff C: the last chapter of the arc whose range holds D, from the
 *      wiki's Story Arcs page (data/wiki/arcs.json); an ongoing arc passes
 *      everything. No D or no arc: the gate cannot run, no line, birth kept.
 *   3. The bold subject and its aliases before the first finite verb go with
 *      their citations, and the printed card name becomes the subject. The
 *      predicate splits at each {{Qref}}; a clause passes iff its closing
 *      citation resolves to a chapter ≤ C: chap=N directly, name=X through a
 *      {{Qref|name=X|chap=N…}} definition in section 0 or Tabs Top (a name
 *      defined without chap=, an undefined name or no citation fails; adjacent
 *      citations count as one group, the earliest chapter of the group is the
 *      one tested). Keep the longest passing run from the start.
 *   4. A past-tense main verb (was, were) claims a death and passes only if
 *      `status` carries a chap= ≤ C; else that clause and the rest go.
 *   5. Trailing clauses go until the line is ≤ 22 words; under six words or
 *      no finite verb, no line. Never paraphrase, never add a word.
 * Cleaning: templates go ({{Nihongo|X|…}} keeps X, its English term, since
 * the wiki wraps words such as Zoro's "master swordsman" in it), links keep
 * their label, bold and italics go, parenthetical Japanese goes, comma-set
 * "also known as …" asides go, trailing commas and double spaces go.
 *
 * Writes data/wiki/lines.json (slim, bundled by the app: name, title, revid
 * permalink, fetch date, debut, cutoff, arc, line, word count, birth) under a
 * CC BY-SA 3.0 notice; data/wiki/audit.json (the same plus the raw sentence,
 * every clause with its chapter and verdict, the reason when no line results,
 * raw birth and status, and the unmapped names with reasons); and
 * data/wiki/arcs.json. Entries are keyed by printed name, so a re-run
 * replaces what it fetched and keeps the rest. Nothing is written on --dry-run.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')
const ATTR_DIR = join(DATA, 'card-attributes')
const WIKI_DIR = join(DATA, 'wiki')
const API = 'https://onepiece.fandom.com/api.php'
const WIKI = 'https://onepiece.fandom.com/wiki/'
const UA = 'Piecebook/1.0 (+https://github.com/najibjuraimi-glitch/piecebook)'
const DELAY_MS = 120
const RETRY_MS = 2000
const ARC_PAGE = 'Story Arcs'
const MAX_WORDS = 22
const MIN_WORDS = 6
const LICENCE = {
  source: 'One Piece Wiki (onepiece.fandom.com)',
  licence: 'CC BY-SA 3.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
}

// ---------------------------------------------------------------- args

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const DRY = args.includes('--dry-run')
const ALL = args.includes('--all')
const LEADERS = args.includes('--leaders')
const SETS = flag('--sets')?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
const NAMES = flag('--names')?.split(',').map((s) => s.trim()).filter(Boolean)
const TODAY = new Date().toISOString().slice(0, 10)

if (!ALL && !LEADERS && !SETS && !NAMES) {
  console.error('Usage: node scripts/wiki-refresh.mjs [--all | --sets OP-01,OP-09 | --names Shanks,Nami] [--leaders] [--dry-run]')
  process.exit(1)
}

// ---------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

const codeKey = (setCode) => setCode.replace(/-/g, '').toLowerCase()

let requests = 0

/** One API GET; a 5xx or a network failure is retried once after two seconds. The API answers a missing title with 200 and an error body, which the caller reads as data. */
async function apiGet(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  for (let attempt = 0; ; attempt++) {
    requests++
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status >= 500 && attempt === 0) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
      const json = await res.json()
      await sleep(DELAY_MS)
      return json
    } catch (e) {
      if (attempt > 0) throw e
      console.warn(`  warn: ${e.message}; retrying in ${RETRY_MS / 1000} s`)
      await sleep(RETRY_MS)
    }
  }
}

/** Section 0 (or a whole page when section is null) as { title, revid, wikitext, categories, redirects }, or null when the title is missing. */
async function parsePage(page, { section = 0, categories = false } = {}) {
  const props = ['wikitext', 'revid']
  if (categories) props.push('categories')
  const params = { action: 'parse', page, prop: props.join('|'), redirects: 1 }
  if (section !== null) params.section = String(section)
  const json = await apiGet(params)
  if (json.error) {
    if (['missingtitle', 'invalidtitle', 'nosuchsection'].includes(json.error.code)) return null
    throw new Error(`${page}: ${json.error.code} ${json.error.info}`)
  }
  const p = json.parse
  return {
    title: p.title,
    revid: p.revid ?? null,
    wikitext: p.wikitext?.['*'] ?? '',
    categories: (p.categories ?? []).map((c) => String(c['*']).replace(/_/g, ' ')),
    redirects: (p.redirects ?? []).map((r) => `${r.from} → ${r.to}`),
  }
}

// ---------------------------------------------------------------- names

const HONORIFIC = /(^|\s)(Mr|Ms|Mrs|Dr|Jr|Sr)$/i
const INITIAL = /(^|\s)[A-Za-z]$/
const CODENAME = /^(Mr|Ms|Mrs|Miss)\b/i

/** Printed card name → wiki title to ask for, or null for a two-character card. */
function titleFor(name) {
  if (name.includes('&')) return null
  let s = name.replace(/"[^"]*"/g, ' ')
  const paren = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
  if (paren) {
    const outside = paren[1].trim()
    const inside = paren[2].trim()
    s = CODENAME.test(outside) && inside ? inside : outside
  }
  s = s.replace(/^St\.\s+/, '')
  if (s.includes('.')) {
    const parts = s.split('.').map((p) => p.trim())
    if (!parts.every((p) => p.length <= 1)) {
      s = parts
        .map((p, i) => (i < parts.length - 1 && (INITIAL.test(p) || HONORIFIC.test(p)) ? `${p}.` : p))
        .filter(Boolean)
        .join(' ')
    }
  }
  return s.replace(/\s+/g, ' ').trim()
}

/** Distinct Character / Leader names from the seeds named by the flags, plus the names the flags skip with the reason. */
function collectNames() {
  const wanted = new Map() // name → source note
  const skipped = new Map() // name → reason
  const seedFiles = readdirSync(DATA).filter((f) => f.endsWith('-en-seed.csv'))
  const readSet = (file) => {
    const code = file.replace('-en-seed.csv', '')
    const seed = parseCsv(readFileSync(join(DATA, file), 'utf8'))
    const attrFile = join(ATTR_DIR, `${code}.csv`)
    const category = new Map(existsSync(attrFile) ? parseCsv(readFileSync(attrFile, 'utf8')).map((a) => [a.card_number, a.category]) : [])
    return seed.map((r) => ({ name: r.name, category: category.get(r.card_number) ?? '' }))
  }
  const files = ALL ? seedFiles : SETS ? seedFiles.filter((f) => SETS.includes(f.replace('-en-seed.csv', '').replace(/^([a-z]+)(\d+)$/, (_, a, b) => `${a.toUpperCase()}-${b}`))) : []
  if (SETS) {
    for (const code of SETS) {
      if (!files.some((f) => f.startsWith(`${codeKey(code)}-`))) console.warn(`  warn: no seed file for ${code}`)
    }
  }
  for (const f of files) {
    for (const { name, category } of readSet(f)) {
      if (category === 'Character' || category === 'Leader') wanted.set(name, f)
      else if (!wanted.has(name)) skipped.set(name, `not a character card (${category || 'no category'})`)
    }
  }
  if (LEADERS) {
    for (const f of seedFiles) for (const { name, category } of readSet(f)) if (category === 'Leader') wanted.set(name, f)
  }
  for (const n of NAMES ?? []) wanted.set(n, '--names')
  for (const n of wanted.keys()) skipped.delete(n)
  return { names: [...wanted.keys()].sort((a, b) => a.localeCompare(b)), skipped }
}

// ---------------------------------------------------------------- wikitext

const T_OPEN = '\uE000'
const T_CLOSE = '\uE001'
const TOKEN = /\uE000(\d+)\uE001/g

/** Index just past the }} or ]] that closes the template or link opening at `start`, or -1. */
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

/** Replace every outermost {{…}} and [[…]] with a token so that punctuation inside them cannot be mistaken for sentence structure. */
function protect(text) {
  const items = []
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text.startsWith('{{', i) || text.startsWith('[[', i)) {
      const end = matchClose(text, i)
      if (end < 0) {
        out += text[i]
        i++
        continue
      }
      items.push(text.slice(i, end))
      out += `${T_OPEN}${items.length - 1}${T_CLOSE}`
      i = end
    } else {
      out += text[i]
      i++
    }
  }
  return { text: out, items }
}

const restore = (text, items) => text.replace(TOKEN, (_, n) => items[Number(n)])

/** Top-level `|` split of a template's inside (name and parameters), honouring nested templates and links. */
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

/** `{{Name|a|k=v}}` → { name, positional: [a], named: { k: v } } (keys lower-cased, values trimmed). */
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

const isQref = (tpl) => /^\{\{\s*qref\s*(\||\}\})/i.test(tpl)

/** Every template in `text`, outermost and nested, as raw strings. */
function allTemplates(text) {
  const out = []
  let i = 0
  while (i < text.length) {
    if (text.startsWith('{{', i)) {
      const end = matchClose(text, i)
      if (end < 0) break
      out.push(text.slice(i, end))
      i += 2
    } else i++
  }
  return out
}

const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '')
const stripRefs = (s) => s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')

/** Chapter number a Qref points at: chap=N directly, else name=X through the page's definitions. */
function chapterOf(qref, defs) {
  const { named } = parseTemplate(qref)
  if (named.chap) {
    const n = Number.parseInt(named.chap, 10)
    if (Number.isFinite(n)) return { chapter: n, via: 'chap=' }
    return { chapter: null, via: `chap=${named.chap} unreadable` }
  }
  if (named.name) {
    const def = defs.get(named.name)
    if (def === undefined) return { chapter: null, via: `name=${named.name} undefined` }
    if (def === null) return { chapter: null, via: `name=${named.name} defined without chap=` }
    return { chapter: def, via: `name=${named.name}` }
  }
  const keys = Object.keys(named).filter((k) => !['page', 'text'].includes(k))
  return { chapter: null, via: keys.length ? `no chap= (${keys.join(', ')})` : 'no chap=' }
}

/** name → chapter for every {{Qref|name=X|chap=N…}} definition in the text; a name defined without chap= maps to null (first definition wins). */
function collectDefinitions(text, defs = new Map()) {
  for (const tpl of allTemplates(text)) {
    if (!isQref(tpl)) continue
    const { named } = parseTemplate(tpl)
    if (!named.name) continue
    const hasBody = Object.keys(named).length > 1
    if (!hasBody) continue
    if (defs.get(named.name) != null) continue
    const n = named.chap ? Number.parseInt(named.chap, 10) : NaN
    defs.set(named.name, Number.isFinite(n) ? n : null)
  }
  return defs
}

// ---------------------------------------------------------------- infobox

function findCharBox(text) {
  const m = /\{\{\s*Char Box\b/i.exec(text)
  if (!m) return null
  const end = matchClose(text, m.index)
  if (end < 0) return null
  return parseTemplate(text.slice(m.index, end)).named
}

/** Plain text of an infobox field: templates, tags, links and markup gone. */
function plainField(value) {
  let s = stripRefs(stripComments(value ?? ''))
  for (const tpl of allTemplates(s)) s = s.replace(tpl, ' ')
  s = s.replace(/<br\s*\/?>/gi, '; ').replace(/<[^>]+>/g, '')
  s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1')
  return decode(s.replace(/'''?/g, '').replace(/\s+/g, ' ')).trim()
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** "March 9th" / "March 9" / "9 March" → { month, day }; anything else null. */
function parseBirth(plain) {
  if (!plain) return null
  const a = plain.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/)
  const b = plain.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\b/)
  let month = -1
  let day = 0
  if (a && MONTHS.includes(a[1].toLowerCase())) {
    month = MONTHS.indexOf(a[1].toLowerCase())
    day = Number(a[2])
  } else if (b && MONTHS.includes(b[2].toLowerCase())) {
    month = MONTHS.indexOf(b[2].toLowerCase())
    day = Number(b[1])
  }
  if (month < 0 || day < 1 || day > DAYS_IN[month]) return null
  return { month: month + 1, day }
}

/** Debut chapter from `first`: the first [[Chapter N]], else the first chap= in its Qrefs. */
function parseDebut(first) {
  if (!first) return null
  const link = first.match(/\[\[\s*Chapter\s+(\d+)\s*(?:\|[^\]]*)?\]\]/i)
  if (link) return Number(link[1])
  const chap = first.match(/\bchap\s*=\s*(\d+)/i)
  return chap ? Number(chap[1]) : null
}

/** The chapter a `status` field cites, through the page's definitions. */
function statusChapter(status, defs) {
  for (const tpl of allTemplates(status ?? '')) {
    if (!isQref(tpl)) continue
    const { chapter } = chapterOf(tpl, defs)
    if (chapter != null) return chapter
  }
  return null
}

// ---------------------------------------------------------------- arcs

/** The arc list from the Story Arcs page: ====[[Name]]==== headings under "Main Story Arcs", each with a "Chapters: N (a-b)" bullet; "(1126-)" is the ongoing arc. */
function parseArcs(wikitext) {
  const arcs = []
  let inMain = false
  let current = null
  for (const line of wikitext.split('\n')) {
    const h2 = line.match(/^==([^=].*?)==\s*$/)
    if (h2) {
      inMain = /Main Story Arcs/i.test(h2[1])
      current = null
      continue
    }
    if (!inMain) continue
    const h4 = line.match(/^====\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*====\s*$/)
    if (h4) {
      current = h4[1].trim()
      continue
    }
    if (!current) continue
    const range = /^\*.*Chapters.*?\(\s*(\d+)\s*[-–—]\s*(\d+)?\s*\)/.exec(line)
    if (range) {
      arcs.push({ name: current, firstChapter: Number(range[1]), lastChapter: range[2] ? Number(range[2]) : null })
      current = null
    }
  }
  return arcs.sort((a, b) => a.firstChapter - b.firstChapter)
}

async function loadArcs() {
  const file = join(WIKI_DIR, 'arcs.json')
  try {
    const page = await parsePage(ARC_PAGE, { section: null })
    if (!page) throw new Error(`${ARC_PAGE}: missing title`)
    const arcs = parseArcs(page.wikitext)
    if (arcs.length < 10 || arcs[0].firstChapter !== 1) throw new Error(`${ARC_PAGE}: only ${arcs.length} arc(s) parsed`)
    const cache = {
      title: page.title,
      revid: page.revid,
      url: `${WIKI}${encodeURI(page.title.replace(/ /g, '_'))}?oldid=${page.revid}`,
      fetchedAt: TODAY,
      arcs,
    }
    if (!DRY) {
      mkdirSync(WIKI_DIR, { recursive: true })
      writeFileSync(file, JSON.stringify(cache, null, 2) + '\n')
    }
    return { cache, note: `${arcs.length} arcs from "${page.title}" (revid ${page.revid})` }
  } catch (e) {
    if (existsSync(file)) {
      const cache = JSON.parse(readFileSync(file, 'utf8'))
      console.warn(`  warn: ${e.message}; using cached arcs.json from ${cache.fetchedAt}`)
      return { cache, note: `cached arcs.json from ${cache.fetchedAt} (${e.message})` }
    }
    console.warn(`  warn: ${e.message}; no arc list, every gate reads "cannot run"`)
    return { cache: null, note: `no arc list (${e.message})` }
  }
}

/** The arc holding chapter D → { arc, cutoff } with cutoff null for an ongoing arc; null when no arc holds it. */
function arcFor(arcs, debut) {
  if (!arcs || debut == null) return null
  const arc = arcs.arcs.find((a) => debut >= a.firstChapter && (a.lastChapter == null || debut <= a.lastChapter))
  return arc ? { arc: arc.name, cutoff: arc.lastChapter } : null
}

// ---------------------------------------------------------------- the line

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'no', 'vol', 'vs', 'etc', 'capt', 'lt', 'gen', 'adm', 'cmdr', 'sgt', 'ch', 'ep'])

/** Paragraph one of section 0 (protected form): leading templates, comments, notes, files and blank lines skipped. */
function firstParagraph(wikitext) {
  let text = stripRefs(stripComments(wikitext))
  const { text: p, items } = protect(text)
  const lines = p.split('\n')
  let i = 0
  const isFurniture = (l) => {
    const t = l.trim()
    if (t === '') return true
    if (/^:/.test(t)) return true
    if (/^__[A-Z]+__$/.test(t)) return true
    const stripped = t.replace(TOKEN, (_, n) => (/^\{\{|^\[\[(File|Image|Category):/i.test(items[Number(n)]) ? '' : 'x')).trim()
    return stripped === ''
  }
  while (i < lines.length && isFurniture(lines[i])) i++
  const para = []
  while (i < lines.length && lines[i].trim() !== '') para.push(lines[i++])
  return { text: para.join(' ').trim(), items }
}

/** The first sentence of a protected paragraph: a full stop that is not an abbreviation, with the citations that follow it. */
function firstSentence(text) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch !== '.' && ch !== '?' && ch !== '!') continue
    if (ch === '.') {
      const before = text.slice(0, i).match(/([A-Za-z]+)$/)
      if (before && (before[1].length === 1 || ABBREVIATIONS.has(before[1].toLowerCase()))) continue
      if (/\d/.test(text[i + 1] ?? '')) continue
    }
    let j = i + 1
    for (;;) {
      const m = /^(\uE000\d+\uE001|'''|''|"|\))/.exec(text.slice(j))
      if (!m) break
      j += m[0].length
    }
    if (j >= text.length || /\s/.test(text[j])) return text.slice(0, j).trim()
  }
  return text.trim()
}

const FINITE = /\b(is|are|was|were|has|have|had)\b/
const PAST = /\b(was|were)\b/

/** Clauses of a protected predicate, split at each Qref; adjacent Qrefs form one citation group. */
function splitClauses(predicate, items) {
  const clauses = []
  let cur = ''
  let i = 0
  while (i < predicate.length) {
    const m = /^\uE000(\d+)\uE001/.exec(predicate.slice(i))
    if (m && isQref(items[Number(m[1])])) {
      const cites = []
      let j = i
      for (;;) {
        const q = /^\uE000(\d+)\uE001/.exec(predicate.slice(j))
        if (!q || !isQref(items[Number(q[1])])) break
        cites.push(items[Number(q[1])])
        j += q[0].length
      }
      clauses.push({ raw: cur, cites })
      cur = ''
      i = j
    } else if (m) {
      cur += m[0]
      i += m[0].length
    } else {
      cur += predicate[i]
      i++
    }
  }
  if (cur.replace(/[\s.,;:]/g, '') !== '') clauses.push({ raw: cur, cites: [] })
  return clauses.filter((c) => c.raw.replace(/[\s.,;:]/g, '') !== '' || c.cites.length === 0)
}

/** Wikitext → plain words: templates, links, markup, Japanese and asides gone. */
function cleanText(raw) {
  let s = raw
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
    const keep = /^nihongo$/i.test(name) ? positional[0] ?? '' : ''
    s = s.slice(0, m.index) + keep + s.slice(end)
  }
  s = s.replace(/\[\[\s*(?:File|Image|Category):[^\]]*\]\]/gi, '')
  s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1')
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  s = decode(s).replace(/'''''|'''|''/g, '')
  s = s.replace(/\s*\([^()]*[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef][^()]*\)/g, '')
  s = s.replace(/,\s*(?:(?:more|most)\s+)?(?:commonly|also|better|simply|otherwise|formerly|originally|widely|popularly|often)?\s*(?:known|referred to|called)\s+(?:as|simply as|just)\s+[^,.;]+(?=[,.;]|$)/gi, '')
  s = s.replace(/\s+([,.;:])/g, '$1').replace(/([,;:])(?=[,;:])/g, '').replace(/\s+/g, ' ').trim()
  return s
}

const wordCount = (s) => (s ? s.split(/\s+/).filter(Boolean).length : 0)

/**
 * The line for one page: subject region dropped, predicate split at its
 * citations, each clause tested against the cutoff, the longest passing
 * opening kept, death rule, word cap. Returns everything the audit wants.
 */
function buildLine({ printedName, wikitext, defs, cutoff, gateBlock, statusChap }) {
  const { text: paragraph, items } = firstParagraph(wikitext)
  const out = { rawSentence: null, clauses: [], line: null, lineWords: null, noLineReason: null }
  if (!paragraph) {
    out.noLineReason = 'no paragraph'
    return out
  }
  const sentence = firstSentence(paragraph)
  out.rawSentence = restore(sentence, items).replace(/\s+/g, ' ').trim()
  const verb = FINITE.exec(sentence)
  if (!verb) {
    out.noLineReason = 'no finite verb'
    return out
  }
  const predicate = sentence.slice(verb.index)
  const clauses = splitClauses(predicate, items)
  const limit = cutoff == null ? Number.POSITIVE_INFINITY : cutoff
  for (const c of clauses) {
    const resolved = c.cites.map((q) => chapterOf(q, defs))
    const chapters = resolved.map((r) => r.chapter).filter((n) => n != null)
    const chapter = chapters.length ? Math.min(...chapters) : null
    const text = cleanText(restore(c.raw, items))
    const entry = { text, chapter, pass: false }
    if (gateBlock) entry.reason = `gate cannot run: ${gateBlock}`
    else if (c.cites.length === 0) entry.reason = 'uncited'
    else if (chapter == null) entry.reason = `unresolved citation: ${resolved.map((r) => r.via).join('; ')}`
    else if (chapter > limit) entry.reason = `after cutoff: chapter ${chapter}, cutoff ${cutoff}`
    else if (PAST.test(text) && (statusChap == null || statusChap > limit)) {
      entry.reason = statusChap == null ? 'past tense: status carries no cited chapter' : `past tense: status chapter ${statusChap}, cutoff ${cutoff}`
    } else {
      entry.pass = true
      entry.via = resolved.filter((r) => r.chapter === chapter).map((r) => r.via).join('; ')
      if (PAST.test(text)) entry.via += `; status chapter ${statusChap}`
    }
    out.clauses.push(entry)
  }
  let kept = 0
  while (kept < out.clauses.length && out.clauses[kept].pass) kept++
  if (kept === 0) {
    out.noLineReason = out.clauses.length ? out.clauses[0].reason : 'no clauses'
    return out
  }
  const compose = (k) => cleanText(restore(clauses.slice(0, k).map((c) => c.raw).join(''), items)).replace(/[\s.,;:]+$/, '')
  let k = kept
  let line = `${printedName} ${compose(k)}`
  while (k > 0 && wordCount(line) > MAX_WORDS) {
    k--
    line = k > 0 ? `${printedName} ${compose(k)}` : ''
  }
  if (k === 0) {
    out.noLineReason = `over ${MAX_WORDS} words: the first clause alone is ${wordCount(`${printedName} ${compose(1)}`)} words`
    return out
  }
  if (k < kept) out.trimmedForLength = kept - k
  const words = wordCount(line)
  if (words < MIN_WORDS) {
    out.noLineReason = `under ${MIN_WORDS} words: "${line}"`
    return out
  }
  if (!FINITE.test(line)) {
    out.noLineReason = 'no finite verb'
    return out
  }
  out.line = line
  out.lineWords = words
  return out
}

// ---------------------------------------------------------------- one name

const tabsTopOf = (wikitext) => /\{\{\s*([^{}|]+?)\s+Tabs Top\s*\}\}/i.exec(wikitext)?.[1]?.trim() ?? null

async function processName(name, arcs) {
  const title = titleFor(name)
  if (title === null) return { unmapped: 'pair' }
  const page = await parsePage(title, { categories: true })
  if (!page) return { unmapped: 'no page', title }
  const resolved = page.title
  if (page.categories.some((c) => /^Unreleased Content$/i.test(c))) return { unmapped: 'unreleased', title: resolved }
  const section0 = page.wikitext
  let tabsName = tabsTopOf(section0)
  if (!tabsName && !/\{\{\s*Char Box\b/i.test(section0)) tabsName = resolved
  let tabsText = ''
  let tabsTitle = null
  if (tabsName) {
    tabsTitle = `Template:${tabsName} Tabs Top`
    const tabs = await parsePage(tabsTitle)
    tabsText = tabs?.wikitext ?? ''
    if (!tabs) tabsTitle = `${tabsTitle} (missing)`
  }
  let box = findCharBox(tabsText)
  let boxSource = 'Tabs Top'
  if (!box) {
    box = findCharBox(section0)
    boxSource = box ? 'section 0' : null
  }
  if (!box) return { unmapped: 'no infobox', title: resolved, tabsTitle }

  const defs = collectDefinitions(tabsText, collectDefinitions(section0))
  const debut = parseDebut(box.first)
  const holder = arcFor(arcs, debut)
  const birthRaw = plainField(box.birth) || null
  const birth = parseBirth(birthRaw)
  const statusRaw = (box.status ?? '').trim() || null
  const statusChap = statusChapter(box.status, defs)
  const gateBlock = arcs == null ? 'no arc list' : debut == null ? 'no debut chapter in first' : holder == null ? `chapter ${debut} is in no arc` : null
  const built = buildLine({ printedName: name, wikitext: section0, defs, cutoff: holder?.cutoff ?? null, gateBlock, statusChap })
  return {
    entry: {
      name,
      title: resolved,
      revid: page.revid,
      url: `${WIKI}${encodeURI(resolved.replace(/ /g, '_'))}?oldid=${page.revid}`,
      fetchedAt: TODAY,
      debutChapter: debut,
      cutoffChapter: holder?.cutoff ?? null,
      arc: holder?.arc ?? null,
      line: built.line,
      lineWords: built.lineWords,
      birth,
    },
    audit: {
      askedTitle: title,
      redirects: page.redirects,
      tabsTitle,
      charBoxIn: boxSource,
      definitions: defs.size,
      firstRaw: (box.first ?? '').trim() || null,
      birthRaw,
      statusRaw,
      statusChapter: statusChap,
      rawSentence: built.rawSentence,
      clauses: built.clauses,
      trimmedForLength: built.trimmedForLength ?? 0,
      noLineReason: built.noLineReason,
    },
  }
}

// ---------------------------------------------------------------- output

function readJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback
}

const byName = (a, b) => a.name.localeCompare(b.name)

function writeOutputs(results, skipped) {
  const linesFile = join(WIKI_DIR, 'lines.json')
  const auditFile = join(WIKI_DIR, 'audit.json')
  const prevLines = readJson(linesFile, { entries: [] })
  const prevAudit = readJson(auditFile, { entries: [], unmapped: [] })
  const entries = new Map(prevLines.entries.map((e) => [e.name, e]))
  const auditEntries = new Map(prevAudit.entries.map((e) => [e.name, e]))
  const unmapped = new Map(prevAudit.unmapped.map((u) => [u.name, u]))
  for (const [name, reason] of skipped) {
    entries.delete(name)
    auditEntries.delete(name)
    unmapped.set(name, { name, reason, fetchedAt: TODAY })
  }
  for (const [name, r] of results) {
    if (r.error) continue
    if (r.unmapped) {
      entries.delete(name)
      auditEntries.delete(name)
      const u = { name, reason: r.unmapped, fetchedAt: TODAY }
      if (r.title) u.title = r.title
      unmapped.set(name, u)
    } else {
      unmapped.delete(name)
      entries.set(name, r.entry)
      auditEntries.set(name, { ...r.entry, ...r.audit })
    }
  }
  const lines = { ...LICENCE, fetchedAt: TODAY, entries: [...entries.values()].sort(byName) }
  const audit = {
    ...LICENCE,
    fetchedAt: TODAY,
    entries: [...auditEntries.values()].sort(byName),
    unmapped: [...unmapped.values()].sort(byName),
  }
  if (!DRY) {
    mkdirSync(WIKI_DIR, { recursive: true })
    writeFileSync(linesFile, JSON.stringify(lines, null, 2) + '\n')
    writeFileSync(auditFile, JSON.stringify(audit, null, 2) + '\n')
  }
  return { entries: lines.entries.length, unmapped: audit.unmapped.length }
}

// ---------------------------------------------------------------- main

const started = Date.now()
const { names, skipped } = collectNames()
console.log(`Wiki refresh: ${names.length} name(s), ${skipped.size} skipped without a request, ${TODAY}${DRY ? ' (dry run)' : ''}`)

const { cache: arcs, note: arcNote } = await loadArcs()
console.log(`  arcs: ${arcNote}`)

const results = new Map()
const tally = { mapped: 0, line: 0, unmapped: {}, noLine: {}, errors: 0 }
for (const name of names) {
  let r
  try {
    r = await processName(name, arcs)
  } catch (e) {
    r = { error: e.message }
    tally.errors++
    console.error(`  ${name}: ERROR ${e.message}`)
    results.set(name, r)
    continue
  }
  results.set(name, r)
  if (r.unmapped) {
    tally.unmapped[r.unmapped] = (tally.unmapped[r.unmapped] ?? 0) + 1
    console.log(`  ${name} → ${r.title ?? titleFor(name) ?? '(pair)'}: unmapped, ${r.unmapped}`)
    continue
  }
  tally.mapped++
  const e = r.entry
  const a = r.audit
  const gate = e.arc ? `D ${e.debutChapter} · ${e.arc} · C ${e.cutoffChapter ?? 'open'}` : `D ${e.debutChapter ?? 'none'} · no arc`
  const birth = e.birth ? `${e.birth.month}/${e.birth.day}` : `no birth (${a.birthRaw ?? 'empty'})`
  if (e.line) {
    tally.line++
    console.log(`  ${name} → ${e.title} (revid ${e.revid}, box in ${a.charBoxIn}) · ${gate} · ${birth}\n      line (${e.lineWords} words): ${e.line}`)
  } else {
    const reason = a.noLineReason ?? 'unknown'
    const category = reason.split(':')[0].trim()
    tally.noLine[category] = (tally.noLine[category] ?? 0) + 1
    console.log(`  ${name} → ${e.title} (revid ${e.revid}, box in ${a.charBoxIn}) · ${gate} · ${birth}\n      no line: ${reason}`)
  }
  if (process.env.WIKI_VERBOSE) {
    console.log(`      sentence: ${a.rawSentence}`)
    for (const c of a.clauses) console.log(`      ${c.pass ? 'PASS' : 'FAIL'} ${c.chapter ?? '-'} "${c.text}"${c.reason ? ` (${c.reason})` : ''}`)
  }
}

const written = writeOutputs(results, skipped)
const seconds = ((Date.now() - started) / 1000).toFixed(1)
console.log(
  `Summary: ${tally.mapped} mapped, ${tally.line} with a line, unmapped ${JSON.stringify(tally.unmapped)}, no line ${JSON.stringify(tally.noLine)}, ${tally.errors} error(s)`,
)
console.log(`  lines.json now ${written.entries} entries, audit.json ${written.unmapped} unmapped · ${requests} requests · ${seconds} s${DRY ? ' · dry run, nothing written' : ''}`)
process.exit(tally.errors ? 1 : 0)
