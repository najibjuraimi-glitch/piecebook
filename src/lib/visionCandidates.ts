import type { Card } from '../data/seed'
import type { VisionIdentify } from './vision'
import { textNamesSp } from './copyPrice'

export interface RankedCandidate {
  card: Card
  score: number
  exact: boolean
}

const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = i
    for (let j = 1; j <= b.length; j++) {
      const cur = a[i - 1] === b[j - 1] ? row[j - 1] : 1 + Math.min(row[j - 1], row[j], prev)
      row[j - 1] = prev
      prev = cur
    }
    row[b.length] = prev
  }
  return row[b.length]
}

/** 0–100 how closely `query` matches a printed card name. */
export function nameScore(query: string, name: string): number {
  const q = normalizeName(query)
  const n = normalizeName(name)
  if (!q || !n) return 0
  if (q === n) return 100
  if (n.includes(q) || q.includes(n)) return 80
  const qc = q.replace(/ /g, '')
  const nc = n.replace(/ /g, '')
  if (qc && nc && (nc.includes(qc) || qc.includes(nc))) return 70
  const qt = q.split(' ').filter(Boolean)
  const nt = new Set(n.split(' ').filter(Boolean))
  const hit = qt.filter((t) => nt.has(t)).length
  if (hit) return 40 + (hit / qt.length) * 30
  if (q.length <= 18 && n.length <= 28) {
    const d = levenshtein(q, n)
    if (d <= 2) return 55 - d * 12
  }
  return 0
}

export function matchesPrintedCode(card: Card, printed: string): boolean {
  const want = compact(printed)
  if (!want) return false
  return compact(card.baseNumber) === want || compact(card.cardNumber) === want
}

/**
 * The model's guess when it gave one. Only with no guess does OCR text decide:
 * SP / SPECIAL CARD / SPECIAL then rank the SP print. A "base" guess is kept
 * even when the text says SPECIAL, which is also the attack attribute (F6).
 */
export function effectiveParallelGuess(identify: Pick<VisionIdentify, 'parallel_guess' | 'read_text'>): string | null {
  const guess = identify.parallel_guess?.trim() || null
  if (guess) return guess
  const text = identify.read_text ?? ''
  if (textNamesSp(text) || /\bSPECIAL\b/i.test(text)) return 'SP'
  return null
}

function parallelBoost(card: Card, guess: string | null): number {
  const g = (guess || '').toLowerCase()
  if (!g) return 0
  if (g === 'base') return card.isParallel ? -25 : 25
  if (g.includes('manga')) return /manga/i.test(card.variant ?? '') ? 35 : card.isParallel ? 5 : -5
  if (g === 'sp' || g.includes('special')) {
    return card.rarity === 'SP' || /special/i.test(card.variant ?? '') ? 35 : 0
  }
  if (g.includes('parallel') || g.includes('alt')) return card.isParallel ? 25 : -15
  return 0
}

function printedCodesIn(text: string): string[] {
  const out: string[] = []
  const re = /\b([A-Z]{1,3}\s*-?\s*\d{1,2}\s*-\s*\d{3}(?:\s*p\s*\d+)?)\b/gi
  for (const m of text.matchAll(re)) out.push(m[1])
  return out
}

/**
 * Rank seed cards for a vision identify payload.
 * Exact `set_code` hits (base + parallels) rank first; then fuzzy name / read_text.
 * Never auto-picks — the caller must wait for a confirm tap.
 */
export function rankVisionCandidates(
  identify: VisionIdentify,
  cards: readonly Card[],
  limit = 5,
): RankedCandidate[] {
  const cap = Math.min(5, Math.max(3, limit))
  const printed = identify.set_code?.trim() || ''
  const exact = printed ? cards.filter((c) => matchesPrintedCode(c, printed)) : []
  const exactIds = new Set(exact.map((c) => c.cardNumber))

  const guess = effectiveParallelGuess(identify)
  const nameQ = identify.name ?? ''
  const readQ = identify.read_text ?? ''
  const readCodes = printedCodesIn(`${nameQ} ${readQ}`)

  const scored: RankedCandidate[] = []
  for (const card of cards) {
    const isExact = exactIds.has(card.cardNumber)
    const n = nameScore(nameQ, card.name)
    const r = nameScore(readQ, card.name)
    const codeBoost = readCodes.some((code) => matchesPrintedCode(card, code)) ? 40 : 0
    const score = (isExact ? 200 : 0) + n + r * 0.45 + codeBoost + parallelBoost(card, guess)
    if (score <= 0 && !isExact) continue
    scored.push({ card, score, exact: isExact })
  }

  scored.sort((a, b) => b.score - a.score || a.card.cardNumber.localeCompare(b.card.cardNumber))

  const picked: RankedCandidate[] = []
  const seen = new Set<string>()
  for (const row of exact.sort((a, b) => {
    const da = parallelBoost(a, guess) + nameScore(nameQ, a.name)
    const db = parallelBoost(b, guess) + nameScore(nameQ, b.name)
    return db - da || a.cardNumber.localeCompare(b.cardNumber)
  })) {
    picked.push({
      card: row,
      score: 200 + nameScore(nameQ, row.name) + parallelBoost(row, guess),
      exact: true,
    })
    seen.add(row.cardNumber)
  }
  for (const row of scored) {
    if (seen.has(row.card.cardNumber)) continue
    picked.push(row)
    seen.add(row.card.cardNumber)
    if (picked.length >= cap) break
  }
  return picked.slice(0, cap)
}
