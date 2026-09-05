import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ALL_CARDS, getCard, type Card } from '../data/seed'
import { useAllAttributes, type CardAttributes } from '../data/attributes'
import { useDecks } from '../store/decks'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { checkDeck, DECK_SIZE, exportDeckText, MAX_COPIES, mention, parseDeckText, splitColours, type Deck, type DeckIssue } from '../lib/deck'
import { matchesSearch } from '../lib/query'
import { formatDate, formatUsd, formatUsMarketUsd } from '../lib/format'
import { BackBar, CONTENT_COLUMN, Screen } from '../components/Screen'
import { CardArt } from '../components/CardArt'
import { SearchField } from '../components/SearchField'
import { DangerGhostButton, GhostButton } from '../components/Buttons'
import { NotFoundScreen } from './NotFound'

const CATEGORY_ORDER = ['Character', 'Event', 'Stage'] as const
const RESULT_LIMIT = 24
const UNDO_MS = 8000

/** Base print of a number (parallels are the same card). */
function baseCard(cardNumber: string): Card | undefined {
  return getCard(cardNumber.replace(/p\d+$/i, '')) ?? getCard(cardNumber)
}

const nameOf = (cardNumber: string) => baseCard(cardNumber)?.name

/** Every print of a base number, so any copy a collector holds counts. */
const PRINTS_BY_BASE: Map<string, Card[]> = (() => {
  const m = new Map<string, Card[]>()
  for (const c of ALL_CARDS) m.set(c.baseNumber, [...(m.get(c.baseNumber) ?? []), c])
  return m
})()

/** The base print's seed price. A parallel's price is that print's, not the card's, so it is not shown for the card. */
const seedPrice = (card: Card): number | null => (card.isParallel ? null : card.marketUsd)

/** "US $2.18" as one unbreakable token, so a row never splits the currency from the figure. */
const usMoney = (value: number) => formatUsMarketUsd(value).replace(' ', '\u00a0')

export function DeckBuilderScreen() {
  const { id } = useParams()
  const { getDeck } = useDecks()
  const deck = id ? getDeck(id) : undefined
  if (!deck) return <NotFoundScreen title="Deck not found" message="That deck isn’t on this device." />
  return <DeckBuilder key={deck.id} deck={deck} />
}

interface Undo {
  label: string
  cards: Record<string, number>
  leader: string | null
}

/**
 * The deck builder (6.2) with the collection gap (6.3) and legality (6.4).
 * Order after research: leader, then the check (count, every issue naming its
 * cards, legality in a sentence), then adding cards right under it, then the
 * fifty by category, then what the collection covers, then text in and out,
 * then delete. A strip pinned above the tab bar keeps count · legality and a
 * copy action under the thumb while editing. Local-only; nothing leaves the browser.
 */
function DeckBuilder({ deck }: { deck: Deck }) {
  const { renameDeck, deleteDeck, setLeader, setCardQty, replaceCards } = useDecks()
  const { isOwned, ownedQty } = useCollection()
  const watch = useWatchlist()
  const attrs = useAllAttributes()
  const navigate = useNavigate()
  const check = useMemo(() => checkDeck(deck, attrs, nameOf), [deck, attrs])
  const leader = deck.leader ? baseCard(deck.leader) : undefined
  const leaderAttrs = deck.leader && attrs ? attrs.get(deck.leader) : undefined
  const empty = !deck.leader && Object.keys(deck.cards).length === 0

  const haveOf = useCallback(
    (base: string) => (PRINTS_BY_BASE.get(base) ?? []).reduce((s, p) => s + (isOwned(p.cardNumber) ? ownedQty(p.cardNumber) : 0), 0),
    [isOwned, ownedQty],
  )

  // One step back after any change, offered in the strip for a few seconds.
  const [undo, setUndo] = useState<Undo | null>(null)
  const undoTimer = useRef<number | null>(null)
  const remember = (label: string) => {
    setUndo({ label, cards: deck.cards, leader: deck.leader })
    if (undoTimer.current) window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS)
  }
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current) }, [])
  const applyUndo = () => {
    if (!undo) return
    replaceCards(deck.id, undo.cards, undo.leader)
    setUndo(null)
  }

  const changeQty = (card: Card, next: number) => {
    const from = deck.cards[card.baseNumber] ?? 0
    const to = Math.max(0, Math.min(MAX_COPIES, Math.floor(next)))
    if (to === from) return
    remember(from === 0 ? `Added ${card.name}` : to === 0 ? `Removed ${card.name}` : `${card.name} ${from} → ${to}`)
    setCardQty(deck.id, card.baseNumber, to)
  }

  // A tapped name in an issue scrolls to its row and lifts it for a moment.
  const [lifted, setLifted] = useState<string | null>(null)
  const jumpTo = (id: string, cardNumber?: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (cardNumber) {
      setLifted(cardNumber)
      window.setTimeout(() => setLifted((n) => (n === cardNumber ? null : n)), 1600)
    }
  }
  const jumpToCard = (n: string) => jumpTo(n === deck.leader ? 'deck-leader' : `deck-row-${n}`, n)

  // The fifty, grouped by category from the attributes; unknown categories sit last.
  const groups = useMemo(() => {
    const byCat = new Map<string, { card: Card; qty: number; a?: CardAttributes }[]>()
    for (const [n, qty] of Object.entries(deck.cards)) {
      const card = baseCard(n)
      if (!card) continue
      const a = attrs?.get(n)
      const cat = a?.category || 'Other'
      byCat.set(cat, [...(byCat.get(cat) ?? []), { card, qty, a }])
    }
    for (const list of byCat.values()) list.sort((x, y) => (x.a?.cost ?? 99) - (y.a?.cost ?? 99) || x.card.name.localeCompare(y.card.name))
    const order = [...CATEGORY_ORDER, ...[...byCat.keys()].filter((k) => !(CATEGORY_ORDER as readonly string[]).includes(k))]
    return order.filter((k) => byCat.has(k)).map((k) => ({ category: k, items: byCat.get(k)! }))
  }, [deck.cards, attrs])

  // 6.3: what the collection covers, by base number (any print counts), with what it would cost.
  const gap = useMemo(() => {
    const need = [...(deck.leader ? [[deck.leader, 1] as const] : []), ...Object.entries(deck.cards)]
    let owned = 0
    let total = 0
    let toComplete = 0
    let unpricedMissing = 0
    let wholeDeck = 0
    let unpricedAll = 0
    let asOf: string | null = null
    const missing: { card: Card; need: number; have: number; each: number | null }[] = []
    const held: { card: Card; need: number; have: number }[] = []
    for (const [n, q] of need) {
      const card = baseCard(n)
      if (!card) continue
      const have = haveOf(card.baseNumber)
      const each = seedPrice(card)
      total += q
      owned += Math.min(have, q)
      if (card.asOf && (!asOf || card.asOf > asOf)) asOf = card.asOf
      if (each === null) unpricedAll += q
      else wholeDeck += each * q
      if (have > 0) held.push({ card, need: q, have })
      if (have < q) {
        missing.push({ card, need: q, have, each })
        if (each === null) unpricedMissing += q - have
        else toComplete += each * (q - have)
      }
    }
    return { owned, total, missing, held, toComplete, unpricedMissing, wholeDeck, unpricedAll, asOf }
  }, [deck, haveOf])

  // Adding cards: name or number; the leader's colours unless widened; Standard only and Owned narrow further.
  const [query, setQuery] = useState('')
  const [allColours, setAllColours] = useState(false)
  const [standardOnly, setStandardOnly] = useState(false)
  const [ownedOnly, setOwnedOnly] = useState(false)
  const [pickLeader, setPickLeader] = useState(!deck.leader)
  const results = useMemo(() => {
    const q = query.trim()
    if (q.length < 2) return { cards: [] as Card[], more: false }
    const seen = new Set<string>()
    const out: Card[] = []
    let more = false
    for (const c of ALL_CARDS) {
      if (!matchesSearch(c, q)) continue
      const base = c.baseNumber
      if (seen.has(base)) continue
      const a = attrs?.get(base)
      if (pickLeader) {
        if (!a || a.category !== 'Leader') continue
      } else {
        if (a?.category === 'Leader') continue
        if (!allColours && check.colours.length && a?.color && !splitColours(a.color).some((col) => check.colours.includes(col))) continue
      }
      if (standardOnly && a?.standard !== 'legal') continue
      if (ownedOnly && haveOf(base) === 0) continue
      seen.add(base)
      if (out.length >= RESULT_LIMIT) {
        more = true
        break
      }
      out.push(baseCard(base) ?? c)
    }
    return { cards: out, more }
  }, [query, attrs, pickLeader, allColours, standardOnly, ownedOnly, check.colours, haveOf])

  const chooseLeader = (card: Card) => {
    remember(deck.leader ? `Leader was ${nameOf(deck.leader) ?? deck.leader}` : `Leader set to ${card.name}`)
    setLeader(deck.id, card.baseNumber)
    setPickLeader(false)
    setQuery('')
  }

  // Text in and out: the `4xOP09-004` form deck tools exchange.
  const [showText, setShowText] = useState(false)
  const [text, setText] = useState('')
  const [importNote, setImportNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(exportDeckText(deck))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setShowText(true)
      setText(exportDeckText(deck))
      window.setTimeout(() => jumpTo('deck-text'), 50)
    }
  }
  const importFrom = () => {
    const { entries, unreadable } = parseDeckText(text)
    const cards: Record<string, number> = {}
    let newLeader: string | null = deck.leader
    const unknown: string[] = []
    for (const e of entries) {
      const card = baseCard(e.cardNumber)
      if (!card) {
        unknown.push(e.cardNumber)
        continue
      }
      const a = attrs?.get(card.baseNumber)
      if (a?.category === 'Leader') newLeader = card.baseNumber
      else cards[card.baseNumber] = Math.min(MAX_COPIES, (cards[card.baseNumber] ?? 0) + e.qty)
    }
    if (entries.length) remember('List replaced')
    replaceCards(deck.id, cards, newLeader)
    if (newLeader) setPickLeader(false)
    const notes = []
    if (unknown.length) notes.push(`not in the seed: ${unknown.join(', ')}`)
    if (unreadable.length) notes.push(`could not read ${unreadable.length} ${unreadable.length === 1 ? 'line' : 'lines'}`)
    setImportNote(notes.length ? notes.join(' · ') : `Read ${entries.length} ${entries.length === 1 ? 'line' : 'lines'}.`)
  }

  const starMissing = () => {
    for (const m of gap.missing) if (!watch.isWatchingCard(m.card.cardNumber)) watch.toggleCard(m.card.cardNumber)
  }
  const missingUnstarred = gap.missing.filter((m) => !watch.isWatchingCard(m.card.cardNumber)).length

  const legalityWords = (a: CardAttributes | undefined) => (a?.standard === 'not legal' ? 'not\u00a0Standard' : a?.extra === 'not legal' ? 'not\u00a0Extra' : null)
  const ownedWords = (base: string) => {
    const have = haveOf(base)
    return have === 0 ? null : have === 1 ? 'owned' : `${have}\u00a0owned`
  }
  // Colour is only worth a word when the list is not already one colour.
  const showColour = pickLeader || allColours || check.colours.length === 0

  const stripStatus = (
    <>
      {check.count} of {DECK_SIZE}
      {!deck.leader && <span className="text-muted"> · No leader</span>}
      {deck.leader && check.standard === true && <span className="text-muted"> · Standard legal</span>}
      {deck.leader && check.standard === false && <span className="text-bad"> · Not Standard legal</span>}
    </>
  )

  const pasteBlock = (label: string, buttonLabel: string) => (
    <div className="mt-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        aria-label={label}
        placeholder={'1xOP09-001\n4xOP09-004\n…'}
        className="tabular w-full rounded-xl border border-line bg-surface p-3 text-[14px] text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <GhostButton className="tablet:max-w-[260px]" onClick={importFrom} disabled={!text.trim()}>
          {buttonLabel}
        </GhostButton>
        {importNote && <p className="text-meta text-muted">{importNote}</p>}
      </div>
      <p className="mt-2 text-meta text-muted">One card a line: 4xOP09-004, 4 OP09-004 or just the number. The leader can sit anywhere in the list.</p>
    </div>
  )

  return (
    <Screen>
      <BackBar fallbackTo="/decks" crumbs={[{ label: 'Decks', to: '/decks' }, { label: deck.name }]} />

      {/* Name: a quiet inline field, so a deck can be called what the player calls it. */}
      <input
        value={deck.name}
        onChange={(e) => renameDeck(deck.id, e.target.value)}
        aria-label="Deck name"
        className="w-full bg-transparent text-display text-ink placeholder:text-muted focus:outline-none"
        placeholder="Deck name"
      />

      <div className="desktop:grid desktop:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] desktop:items-start desktop:gap-x-10">
        <div className="min-w-0">
          {/* Leader */}
          <section id="deck-leader" aria-label="Leader" className={`mt-5 rounded-2xl border border-line p-4 transition-colors duration-300 ${lifted && lifted === deck.leader ? 'bg-paper' : 'bg-surface'}`}>
            <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Leader</p>
            {leader ? (
              <div className="mt-2 flex items-center gap-3">
                <Link to={`/cards/${encodeURIComponent(leader.cardNumber)}`} className="w-14 shrink-0">
                  <CardArt card={leader} className="rounded-md" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-ink">{leader.name}</p>
                  <p className="tabular text-meta text-muted">
                    {leader.cardNumber}
                    {leaderAttrs?.color && ` · ${leaderAttrs.color}`}
                    {leaderAttrs?.life !== null && leaderAttrs?.life !== undefined && ` · Life ${leaderAttrs.life}`}
                  </p>
                  {(check.flags.get(leader.baseNumber) ?? []).length > 0 && (
                    <p className="text-meta text-muted">{check.flags.get(leader.baseNumber)!.join(' · ')}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setPickLeader(true); setQuery(''); jumpTo('deck-add') }}
                  className="shrink-0 rounded-full px-3 py-2 text-meta font-medium text-ink hover:bg-paper"
                >
                  Change
                </button>
              </div>
            ) : (
              <p className="mt-1 text-body text-muted">{empty ? 'Pick a leader below, or paste a list.' : 'Pick a leader below.'}</p>
            )}
          </section>

          {/* The check: count, every issue naming its cards, legality in a sentence */}
          <section id="deck-check" aria-label="Deck check" className="mt-5 scroll-mt-4 px-1">
            <p className="tabular text-title text-ink">
              {check.count} of {DECK_SIZE} cards
              {check.complete && check.standard !== false && <span className="text-muted"> · ready to play</span>}
              {check.complete && check.standard === false && <span className="text-muted"> · Extra only</span>}
            </p>
            <ul className="mt-1 space-y-0.5 text-meta text-muted">
              {check.issues.map((i) => (
                <li key={i.text}>
                  <IssueLine issue={i} onCard={jumpToCard} />
                </li>
              ))}
              {attrs && deck.leader && check.standard !== null && (
                <li>
                  {check.standard ? (
                    <span className="text-ink">Standard legal</span>
                  ) : (
                    <>
                      <span className="font-medium text-bad">Not Standard legal</span>
                      {': '}
                      <CardMentions cards={check.notStandard} onCard={jumpToCard} />
                    </>
                  )}
                  {check.extra ? ' · Extra legal' : ''}
                </li>
              )}
              {!attrs && <li>Reading card attributes…</li>}
            </ul>
            {attrs && deck.leader && check.standard !== null && (
              <p className="mt-2 text-meta text-muted">
                Standard is the format most events use; cards from blocks that have rotated out are not legal in it. Extra allows every card.
                Legality here is as Limitless publishes it. New to the game? <Link to="/learn" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">Learn to play</Link>.
              </p>
            )}
          </section>

          {/* Add cards / choose a leader, directly under the check */}
          <section id="deck-add" aria-label={pickLeader ? 'Choose a leader' : 'Add cards'} className="mt-6 scroll-mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-muted">{pickLeader ? 'Choose a leader' : 'Add cards'}</h2>
              {pickLeader && deck.leader && (
                <button type="button" onClick={() => setPickLeader(false)} className="rounded-full px-3 py-1 text-meta font-medium text-ink hover:bg-white">
                  Keep {nameOf(deck.leader) ?? deck.leader}
                </button>
              )}
            </div>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={pickLeader ? 'Leader name or number' : 'Card name or number'}
              className="mt-3 tablet:max-w-[560px]"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 px-1">
              {!pickLeader && check.colours.length > 0 && (
                <div role="group" aria-label="Colours" className="flex gap-1.5">
                  <Chip on={!allColours} onClick={() => setAllColours(false)}>{check.colours.join(' / ')}</Chip>
                  <Chip on={allColours} onClick={() => setAllColours(true)}>All colours</Chip>
                </div>
              )}
              <Chip on={standardOnly} onClick={() => setStandardOnly((v) => !v)}>Standard only</Chip>
              <Chip on={ownedOnly} onClick={() => setOwnedOnly((v) => !v)}>Owned</Chip>
            </div>
            {results.cards.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {results.cards.map((card) => {
                  const a = attrs?.get(card.baseNumber)
                  const qty = deck.cards[card.baseNumber] ?? 0
                  const price = seedPrice(card)
                  return (
                    <CardRow
                      key={card.baseNumber}
                      card={card}
                      a={a}
                      more={[a?.category || null, showColour ? a?.color || null : null, price !== null ? usMoney(price) : null, ownedWords(card.baseNumber), legalityWords(a)]}
                      right={
                        pickLeader ? (
                          <button
                            type="button"
                            onClick={() => chooseLeader(card)}
                            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-meta font-medium text-ink hover:bg-paper"
                          >
                            Lead
                          </button>
                        ) : (
                          <Stepper value={qty} max={MAX_COPIES} onChange={(n) => changeQty(card, n)} label={card.name} />
                        )
                      }
                    />
                  )
                })}
              </ul>
            )}
            {results.more && <p className="mt-2 px-1 text-meta text-muted">First {RESULT_LIMIT} matches · keep typing to narrow it.</p>}
            {query.trim().length >= 2 && results.cards.length === 0 && (
              <p className="mt-3 px-1 text-body text-muted">
                {standardOnly || ownedOnly || (!allColours && !pickLeader && check.colours.length > 0) ? 'No cards match with these filters.' : 'No cards match.'}
              </p>
            )}
          </section>

          {/* A new deck can start from a pasted list as readily as from a leader */}
          {empty && (
            <section id="deck-text" aria-label="Start from a list" className="mt-8 scroll-mt-4">
              <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">Or start from a list</h2>
              <p className="mt-1 px-1 text-meta text-muted">Paste a list from another deck tool; the leader and the fifty come in together.</p>
              {pasteBlock('Deck list to start from', 'Use this list')}
            </section>
          )}
        </div>

        <div className="min-w-0">
          {/* The fifty, by category */}
          {groups.map((g, gi) => (
            <section key={g.category} aria-label={g.category} className={gi === 0 ? 'mt-8 desktop:mt-5' : 'mt-6'}>
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-muted">{g.category}s</h2>
                <span className="tabular text-meta text-muted">{g.items.reduce((n, i) => n + i.qty, 0)}</span>
              </div>
              <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
                {g.items.map(({ card, qty, a }) => (
                  <CardRow
                    key={card.baseNumber}
                    id={`deck-row-${card.baseNumber}`}
                    card={card}
                    a={a}
                    more={check.flags.get(card.baseNumber) ?? []}
                    lifted={lifted === card.baseNumber}
                    right={<Stepper value={qty} max={MAX_COPIES} onChange={(n) => changeQty(card, n)} label={card.name} />}
                  />
                ))}
              </ul>
            </section>
          ))}

          {/* 6.3 From your collection */}
          {gap.total > 0 && (
            <section aria-label="From your collection" className="mt-8 rounded-2xl border border-line bg-surface p-4">
              <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">From your collection</p>
              <p className="tabular mt-1 text-body text-ink">
                You own {gap.owned} of {gap.total}
                {gap.missing.length > 0 && <span className="text-muted"> · {gap.total - gap.owned} missing</span>}
              </p>
              <p className="tabular mt-0.5 text-meta text-muted">
                {gap.missing.length > 0 && (
                  <>
                    {formatUsMarketUsd(gap.toComplete)} to complete
                    {gap.unpricedMissing > 0 && ` (${gap.unpricedMissing} ${gap.unpricedMissing === 1 ? 'card has' : 'cards have'} no seed price)`}
                    {' · '}
                  </>
                )}
                the whole deck is {formatUsMarketUsd(gap.wholeDeck)}
                {gap.unpricedAll > 0 && ` (${gap.unpricedAll} without a seed price)`}
                {gap.asOf && ` · seed prices as of ${formatDate(gap.asOf)}`}
              </p>

              {gap.missing.length > 0 && (
                <>
                  <p className="mt-4 text-meta font-medium text-ink">Missing</p>
                  <ul className="mt-1 divide-y divide-line border-t border-line">
                    {gap.missing.map((m) => (
                      <li key={m.card.baseNumber} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-meta">
                        <span className="min-w-0 text-ink">
                          {m.card.name} <span className="tabular text-muted">{m.card.baseNumber}</span>
                        </span>
                        <span className="tabular ml-auto shrink-0 text-muted">
                          need {m.need - m.have}
                          {m.each !== null ? ` · ${formatUsd(m.each)} each · ${formatUsd(m.each * (m.need - m.have))}` : ' · no seed price'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {missingUnstarred > 0 && (
                    <GhostButton className="mt-3" onClick={starMissing}>
                      Star the {missingUnstarred} missing {missingUnstarred === 1 ? 'card' : 'cards'}
                    </GhostButton>
                  )}
                </>
              )}

              {gap.held.length > 0 && (
                <>
                  <p className="mt-4 text-meta font-medium text-ink">You have</p>
                  <ul className="mt-1 divide-y divide-line border-t border-line">
                    {gap.held.map((h) => (
                      <li key={h.card.baseNumber} className="flex items-center justify-between gap-3 py-2 text-meta">
                        <span className="min-w-0 truncate text-ink">
                          {h.card.name} <span className="tabular text-muted">{h.card.baseNumber}</span>
                        </span>
                        <span className="tabular shrink-0 text-muted">
                          {Math.min(h.have, h.need)} of {h.need}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {/* Text out and in, for a deck that already has something in it */}
          {!empty && (
            <section id="deck-text" aria-label="Deck list as text" className="mt-8 scroll-mt-4">
              <div className="flex flex-wrap gap-2">
                <GhostButton className="tablet:max-w-[220px]" onClick={copyText}>
                  {copied ? 'Copied' : 'Copy as text'}
                </GhostButton>
                <GhostButton className="tablet:max-w-[220px]" onClick={() => { setShowText((v) => !v); setImportNote(null) }}>
                  {showText ? 'Hide text' : 'Paste a list'}
                </GhostButton>
              </div>
              {showText && pasteBlock('Deck list text', 'Replace the list with this')}
            </section>
          )}

          <section className="mt-10">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-body text-ink">Delete this deck?</p>
                <DangerGhostButton className="tablet:max-w-[160px]" onClick={() => { deleteDeck(deck.id); navigate('/decks') }}>
                  Delete
                </DangerGhostButton>
                <GhostButton className="tablet:max-w-[160px]" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </GhostButton>
              </div>
            ) : (
              <DangerGhostButton className="tablet:max-w-[220px]" onClick={() => setConfirmDelete(true)}>
                Delete deck
              </DangerGhostButton>
            )}
          </section>
        </div>
      </div>

      {/* Room for the strip pinned below. */}
      <div aria-hidden="true" className="h-16" />

      {/* Count · legality under the thumb while editing; tap it for the check, Copy beside it, one step of undo beneath. */}
      <div
        className="fixed inset-x-0 z-20 border-t border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85"
        style={{ bottom: 'calc(var(--tabbar-h) + var(--safe-bottom))' }}
      >
        <div className={`${CONTENT_COLUMN} flex items-center justify-between gap-3 py-2`}>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => jumpTo('deck-check')}
              aria-label={`${check.count} of ${DECK_SIZE}. Show the check`}
              className="tabular -mx-2 max-w-full truncate rounded-md px-2 py-1 text-left text-[15px] font-medium leading-5 text-ink hover:bg-white"
            >
              {stripStatus}
            </button>
            {undo && (
              <p className="tabular flex items-center gap-1 text-meta text-muted">
                <span className="min-w-0 truncate">{undo.label}</span>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={applyUndo} className="shrink-0 rounded-sm px-1 font-medium text-ink underline decoration-[#B8B1A6] underline-offset-2 hover:decoration-ink">
                  Undo
                </button>
              </p>
            )}
          </div>
          {!empty && (
            <button
              type="button"
              onClick={copyText}
              className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-1.5 text-meta font-medium text-ink transition-colors duration-150 ease-out hover:bg-paper"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>
    </Screen>
  )
}

/** A sentence from the check; each card it names is a jump to that card's row. */
function IssueLine({ issue, onCard }: { issue: DeckIssue; onCard: (n: string) => void }) {
  if (!issue.cards?.length) return <>{issue.text}</>
  return (
    <>
      {issue.lead}
      <CardMentions cards={issue.cards} onCard={onCard} />
      {issue.tail}
    </>
  )
}

function CardMentions({ cards, onCard }: { cards: { number: string; name: string }[]; onCard: (n: string) => void }) {
  return (
    <>
      {cards.map((c, k) => (
        <React.Fragment key={c.number}>
          {k > 0 && (k === cards.length - 1 ? ' and ' : ', ')}
          <button
            type="button"
            onClick={() => onCard(c.number)}
            className="rounded-sm text-left text-ink underline decoration-[#B8B1A6] underline-offset-2 hover:decoration-ink"
          >
            {mention(c)}
          </button>
        </React.Fragment>
      ))}
    </>
  )
}

/** Filled ink when on, hairline when off; the label alone says what it does. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-8 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 ease-out ${
        on ? 'border-ink bg-ink text-white' : 'border-line bg-transparent text-muted hover:bg-white hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * One card in a list: art, name, the facts that tell same-name cards apart
 * (number · cost · power · counter, never truncated), then quieter words —
 * category, colour, seed price, owned copies, legality, or the check's flags.
 */
function CardRow({
  id,
  card,
  a,
  more,
  right,
  lifted = false,
}: {
  id?: string
  card: Card
  a: CardAttributes | undefined
  more: (string | null)[]
  right: React.ReactNode
  lifted?: boolean
}) {
  const facts = [
    card.baseNumber,
    a?.life !== null && a?.life !== undefined ? `Life\u00a0${a.life}` : null,
    a?.cost !== null && a?.cost !== undefined ? `Cost\u00a0${a.cost}` : null,
    a?.power !== null && a?.power !== undefined ? `${a.power}` : null,
    a?.counter !== null && a?.counter !== undefined ? `Counter\u00a0+${a.counter}` : null,
  ].filter((f): f is string => f !== null)
  const words = more.filter((w): w is string => Boolean(w))
  // Phone: the control sits beside the name and the facts run the full width beneath, so nothing truncates.
  // From tablet up the control has its own column, centred on the row.
  return (
    <li
      id={id}
      className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 transition-colors duration-300 ${lifted ? 'bg-paper' : ''}`}
    >
      <Link to={`/cards/${encodeURIComponent(card.cardNumber)}`} className="row-span-3 w-10 self-center">
        <CardArt card={card} className="rounded-md" />
      </Link>
      <p className="col-start-2 text-[15px] font-medium leading-5 text-ink">{card.name}</p>
      <div className="col-start-3 row-start-1 flex justify-end tablet:row-span-3 tablet:self-center">{right}</div>
      <p className="tabular col-span-2 col-start-2 text-meta text-ink/80 tablet:col-span-1">{facts.join(' · ')}</p>
      {words.length > 0 && <p className="col-span-2 col-start-2 text-meta text-muted tablet:col-span-1">{words.join(' · ')}</p>}
    </li>
  )
}

/**
 * Copies of a card. The number is a field: tap it and type. The buttons stop
 * at 0 and 4, and a stopped button is drawn hollow (dashed, no fill) so the
 * limit is plain before the tap.
 */
function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = parseInt(draft, 10)
    if (Number.isFinite(n)) onChange(Math.max(0, Math.min(max, n)))
    setDraft(null)
  }
  const btn =
    'flex h-9 w-9 items-center justify-center rounded-full border text-ink transition-colors duration-150 ease-out hover:bg-paper active:bg-[#F0ECE4] ' +
    'enabled:border-line disabled:border-dashed disabled:border-[#D9D3C8] disabled:text-[#C9C3B8] disabled:hover:bg-transparent'
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Copies of ${label}`}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label="One fewer">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path d="M3.5 8h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft ?? String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(-1))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
        }}
        aria-label={`Copies of ${label}, type a number`}
        className="tabular h-9 w-8 rounded-md border border-transparent bg-transparent text-center text-body font-semibold text-ink focus:border-ink focus:bg-surface focus:outline-none"
      />
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="One more">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
