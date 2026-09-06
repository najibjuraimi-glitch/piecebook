import wikiSeed from '../../data/wiki/lines.json'

/**
 * One mapped name from `data/wiki/lines.json`: the wiki title, a revid
 * permalink, a birthday when the Char Box parsed one, and a spoiler-gated
 * first sentence when the gate kept one. Clauses are the cleaned sentence
 * split at citations so a later reader cutoff can recompute the line; the
 * default `line` is the debut-arc cutoff.
 */
export interface WikiBirth {
  month: number
  day: number
}

export interface WikiClause {
  text: string
  chapter: number | null
  late: boolean
}

export interface WikiEntry {
  name: string
  title: string
  revid: number
  url: string
  fetchedAt: string
  debutChapter: number | null
  cutoffChapter: number | null
  arc: string | null
  line: string | null
  lineWords: number | null
  birth: WikiBirth | null
  clauses: WikiClause[]
  sentenceWords: number | null
}

export const WIKI_LICENCE = wikiSeed.licence
export const WIKI_LICENCE_URL = wikiSeed.licenceUrl
export const WIKI_SOURCE = wikiSeed.source

type Row = Partial<WikiEntry> & { name?: unknown }

function birth(v: unknown): WikiBirth | null {
  if (!v || typeof v !== 'object') return null
  const m = Number((v as WikiBirth).month)
  const d = Number((v as WikiBirth).day)
  if (!Number.isInteger(m) || m < 1 || m > 12) return null
  if (!Number.isInteger(d) || d < 1 || d > 31) return null
  return { month: m, day: d }
}

function clauses(v: unknown): WikiClause[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((c) => {
    if (!c || typeof c !== 'object') return []
    const text = typeof (c as WikiClause).text === 'string' ? (c as WikiClause).text.trim() : ''
    if (!text) return []
    const chapter = typeof (c as WikiClause).chapter === 'number' ? (c as WikiClause).chapter : null
    return [{ text, chapter, late: Boolean((c as WikiClause).late) }]
  })
}

function toEntry(row: Row): WikiEntry | null {
  if (typeof row.name !== 'string' || !row.name) return null
  return {
    name: row.name,
    title: typeof row.title === 'string' ? row.title : row.name,
    revid: typeof row.revid === 'number' ? row.revid : 0,
    url: typeof row.url === 'string' ? row.url : '',
    fetchedAt: typeof row.fetchedAt === 'string' ? row.fetchedAt : '',
    debutChapter: typeof row.debutChapter === 'number' ? row.debutChapter : null,
    cutoffChapter: typeof row.cutoffChapter === 'number' ? row.cutoffChapter : null,
    arc: typeof row.arc === 'string' ? row.arc : null,
    line: typeof row.line === 'string' && row.line.trim() ? row.line.trim() : null,
    lineWords: typeof row.lineWords === 'number' ? row.lineWords : null,
    birth: birth(row.birth),
    clauses: clauses(row.clauses),
    sentenceWords: typeof row.sentenceWords === 'number' ? row.sentenceWords : null,
  }
}

const ENTRIES: WikiEntry[] = (wikiSeed.entries as Row[]).flatMap((r) => {
  const e = toEntry(r)
  return e ? [e] : []
})

const BY_NAME = new Map(ENTRIES.map((e) => [e.name, e]))

export const WIKI_ENTRIES: readonly WikiEntry[] = ENTRIES

/** The mapped wiki row for a printed card name, or undefined when the pipeline stored nothing. */
export function getWiki(name: string | undefined): WikiEntry | undefined {
  if (!name) return undefined
  return BY_NAME.get(name)
}

/** True when the entry has a line or a birthday worth showing. */
export function hasWikiContent(entry: WikiEntry | undefined): entry is WikiEntry {
  return Boolean(entry && (entry.line || entry.birth))
}
