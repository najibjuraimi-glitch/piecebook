import { ALL_CARDS } from '../data/seed'
import { STORY_ARCS, WIKI_FRUITS, getWiki, type StoryArc, type WikiFruit } from '../data/wiki'
import type { CardAttributes } from '../data/attributes'
import type { ReaderCutoff } from '../store/readerCutoff'

export function arcTitle(name: string): string {
  return name.replace(/\s+Arc$/, '')
}

export function chapterRange(arc: Pick<StoryArc, 'firstChapter' | 'lastChapter'>): string {
  if (arc.lastChapter == null) return `Chapters ${arc.firstChapter}–`
  if (arc.firstChapter === arc.lastChapter) return `Chapter ${arc.firstChapter}`
  return `Chapters ${arc.firstChapter}–${arc.lastChapter}`
}

export function episodeRange(arc: Pick<StoryArc, 'firstEpisode' | 'lastEpisode'>): string | null {
  if (arc.firstEpisode == null) return null
  if (arc.lastEpisode == null) return `Episodes ${arc.firstEpisode}–`
  if (arc.firstEpisode === arc.lastEpisode) return `Episode ${arc.firstEpisode}`
  return `Episodes ${arc.firstEpisode}–${arc.lastEpisode}`
}

export function mediaLine(arc: StoryArc): string {
  const ep = episodeRange(arc)
  return ep ? `${chapterRange(arc)} · ${ep}` : chapterRange(arc)
}

export function fruitVisible(fruit: WikiFruit, reader: ReaderCutoff): boolean {
  if (!reader.unlocksStory) return false
  if (reader.finished) return true
  if (reader.chapter == null) return false
  if (fruit.firstChapter == null) return false
  return fruit.firstChapter <= reader.chapter
}

/** The stored fruit on a printed name, if the Char Box gave us one. */
export function fruitForPerson(name: string): WikiFruit | undefined {
  return WIKI_FRUITS.find((f) => f.eaters.some((e) => e.name === name))
}

export function personDebut(name: string): number | null {
  return getWiki(name)?.debutChapter ?? null
}

/**
 * Stored log line for a printed name: fruit when the cutoff has opened
 * fruits, debut chapter when we have one. Nothing is invented.
 */
export function personLogLine(name: string, reader: ReaderCutoff): string | null {
  const parts: string[] = []
  const fruit = fruitForPerson(name)
  if (fruit && fruitVisible(fruit, reader)) parts.push(fruit.name)
  const debut = personDebut(name)
  if (debut != null && (reader.finished || reader.chapter == null || debut <= reader.chapter)) {
    parts.push(`ch ${debut}`)
  }
  return parts.length ? parts.join(' · ') : null
}

export function personVisible(name: string, reader: ReaderCutoff): boolean {
  // Debut arc and Now: the full print book. A saga chip can only keep a name
  // we have a debut chapter for, at or before that chapter — unknown debuts
  // would otherwise leak later people (ten reviewers, draft 11).
  if (reader.finished || reader.chapter == null) return true
  const wiki = getWiki(name)
  if (!wiki || wiki.debutChapter == null) return false
  return wiki.debutChapter <= reader.chapter
}

/** The last finished arc at this cutoff — the portal's featured index row. Now still uses the last closed arc, not Elbaph. */
export function featuredArc(reader: ReaderCutoff): StoryArc | null {
  if (!reader.unlocksStory) return null
  const cap = reader.finished ? Number.POSITIVE_INFINITY : reader.chapter
  if (cap == null) return null
  const done = STORY_ARCS.filter((a) => a.lastChapter != null && a.lastChapter <= cap)
  return done[done.length - 1] ?? null
}

export interface PrintedPerson {
  name: string
  prints: number
  sets: number
  letter: string
}

export function letterOf(name: string): string {
  const ch = name.replace(/^[^A-Za-z]+/, '')[0]
  return ch ? ch.toUpperCase() : '#'
}

/**
 * Distinct Character / Leader names on EN prints. Needs every set's attributes;
 * a name with no category on file is left out rather than guessed.
 */
export function printedPeople(attrs: Map<string, CardAttributes>): PrintedPerson[] {
  const byName = new Map<string, { prints: number; sets: Set<string> }>()
  for (const card of ALL_CARDS) {
    const row = attrs.get(card.cardNumber)
    if (!row || (row.category !== 'Character' && row.category !== 'Leader')) continue
    const entry = byName.get(card.name) ?? { prints: 0, sets: new Set<string>() }
    entry.prints++
    entry.sets.add(card.setCode)
    byName.set(card.name, entry)
  }
  return [...byName.entries()]
    .map(([name, v]) => ({ name, prints: v.prints, sets: v.sets.size, letter: letterOf(name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

