import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ALL_CARDS, getCard, type Card } from '../data/seed'
import { useAllAttributes, type CardAttributes } from '../data/attributes'
import { useDecks } from '../store/decks'
import { useCollection } from '../store/collection'
import { useWatchlist } from '../store/watchlist'
import { checkDeck, DECK_SIZE, exportDeckText, MAX_COPIES, parseDeckText, splitColours, type Deck } from '../lib/deck'
import { matchesSearch } from '../lib/query'
import { formatUsd } from '../lib/format'
import { BackBar, Screen } from '../components/Screen'
import { CardArt } from '../components/CardArt'
import { SearchField } from '../components/SearchField'
import { DangerGhostButton, GhostButton } from '../components/Buttons'
import { NotFoundScreen } from './NotFound'

const CATEGORY_ORDER = ['Character', 'Event', 'Stage'] as const

/** "OP01-001, OP01-006, OP01-013, OP01-024 and 5 more" */
function listSome(items: string[], max = 4): string {
  if (items.length <= max) return items.join(', ')
  return `${items.slice(0, max).join(', ')} and ${items.length - max} more`
}

/** Base print of a number (parallels are the same card). */
function baseCard(cardNumber: string): Card | undefined {
  return getCard(cardNumber.replace(/p\d+$/i, '')) ?? getCard(cardNumber)
}

export function DeckBuilderScreen() {
  const { id } = useParams()
  const { getDeck } = useDecks()
  const deck = id ? getDeck(id) : undefined
  if (!deck) return <NotFoundScreen title="Deck not found" message="That deck isn’t on this device." />
  return <DeckBuilder key={deck.id} deck={deck} />
}

/**
 * The deck builder (6.2) with the collection gap (6.3) and legality (6.4) in
 * one column: leader, the count and every issue in words, the fifty by
 * category with quiet steppers, then adding by name or number filtered to the
 * leader's colours, then what the collection covers, then text export / import.
 * Local-only; nothing leaves the browser.
 */
function DeckBuilder({ deck }: { deck: Deck }) {
  const { renameDeck, deleteDeck, setLeader, setCardQty, replaceCards } = useDecks()
  const { isOwned, ownedQty } = useCollection()
  const watch = useWatchlist()
  const attrs = useAllAttributes()
  const navigate = useNavigate()
  const check = useMemo(() => checkDeck(deck, attrs), [deck, attrs])
  const leader = deck.leader ? baseCard(deck.leader) : undefined
  const leaderAttrs = deck.leader && attrs ? attrs.get(deck.leader) : undefined

  // The fifty, grouped by category from the attributes; unknown categories sit last.
  const groups = useMemo(() => {
    const byCat = new Map<string, { card: Card; qty: number; a?: CardAttributes }[]>()
    for (const [n, qty] of Object.entries(deck.cards)) {
      const card = baseCard(n)
      if (!card) continue
      const a = attrs?.get(n)
      const cat = a?.category || 'Other'
      const list = byCat.get(cat) ?? []
      list.push({ card, qty, a })
      byCat.set(cat, list)
    }
    for (const list of byCat.values()) list.sort((x, y) => (x.a?.cost ?? 99) - (y.a?.cost ?? 99) || x.card.name.localeCompare(y.card.name))
    const order = [...CATEGORY_ORDER, ...[...byCat.keys()].filter((k) => !(CATEGORY_ORDER as readonly string[]).includes(k))]
    return order.filter((k) => byCat.has(k)).map((k) => ({ category: k, items: byCat.get(k)! }))
  }, [deck.cards, attrs])

  // 6.3: what the collection covers, by base number (any print counts).
  const gap = useMemo(() => {
    const need = [...(deck.leader ? [[deck.leader, 1] as const] : []), ...Object.entries(deck.cards)]
    let owned = 0
    let total = 0
    let cost: number | null = 0
    const missing: { card: Card; need: number; have: number; each: number | null }[] = []
    for (const [n, q] of need) {
      const card = baseCard(n)
      if (!card) continue
      const prints = ALL_CARDS.filter((c) => c.baseNumber === card.baseNumber)
      const have = prints.reduce((s, p) => s + (isOwned(p.cardNumber) ? ownedQty(p.cardNumber) : 0), 0)
      total += q
      owned += Math.min(have, q)
      if (have < q) {
        const each = card.marketUsd
        missing.push({ card, need: q, have, each })
        if (each === null) cost = cost === null ? null : cost
        else if (cost !== null) cost += each * (q - have)
        if (each === null) cost = null
      }
    }
    return { owned, total, missing, cost }
  }, [deck, isOwned, ownedQty])

  // Adding cards: name or number, filtered to the leader's colours unless the player widens it.
  const [query, setQuery] = useState('')
  const [allColours, setAllColours] = useState(false)
  const [pickLeader, setPickLeader] = useState(!deck.leader)
  const results = useMemo(() => {
    const q = query.trim()
    if (q.length < 2) return []
    const seen = new Set<string>()
    const out: Card[] = []
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
      seen.add(base)
      out.push(baseCard(base) ?? c)
      if (out.length >= 24) break
    }
    return out
  }, [query, attrs, pickLeader, allColours, check.colours])

  const [showText, setShowText] = useState(false)
  const [text, setText] = useState('')
  const [importNote, setImportNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(exportDeckText(deck))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setShowText(true)
      setText(exportDeckText(deck))
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
    replaceCards(deck.id, cards, newLeader)
    const notes = []
    if (unknown.length) notes.push(`not in the seed: ${unknown.join(', ')}`)
    if (unreadable.length) notes.push(`could not read ${unreadable.length} ${unreadable.length === 1 ? 'line' : 'lines'}`)
    setImportNote(notes.length ? notes.join(' · ') : `Imported ${entries.length} ${entries.length === 1 ? 'line' : 'lines'}.`)
  }

  const starMissing = () => {
    for (const m of gap.missing) if (!watch.isWatchingCard(m.card.cardNumber)) watch.toggleCard(m.card.cardNumber)
  }
  const missingUnstarred = gap.missing.filter((m) => !watch.isWatchingCard(m.card.cardNumber)).length

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

      {/* Leader */}
      <section aria-label="Leader" className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">Leader</p>
        {leader ? (
          <div className="mt-2 flex items-center gap-3">
            <Link to={`/cards/${encodeURIComponent(leader.cardNumber)}`} className="w-14 shrink-0">
              <CardArt card={leader} className="rounded-md" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-ink">{leader.name}</p>
              <p className="tabular text-meta text-muted">
                {leader.cardNumber}
                {leaderAttrs?.color && ` · ${leaderAttrs.color}`}
                {leaderAttrs?.life !== null && leaderAttrs?.life !== undefined && ` · Life ${leaderAttrs.life}`}
              </p>
            </div>
            <button type="button" onClick={() => { setPickLeader(true); setQuery('') }} className="shrink-0 rounded-full px-3 py-2 text-meta font-medium text-ink hover:bg-paper">
              Change
            </button>
          </div>
        ) : (
          <p className="mt-1 text-body text-muted">Search for a leader below to start the deck.</p>
        )}
      </section>

      {/* Count and every issue, in words */}
      <section aria-label="Deck check" className="mt-4 px-1">
        <p className="tabular text-title text-ink">
          {check.count} of {DECK_SIZE} cards
          {check.complete && check.standard !== false && <span className="text-muted"> · ready to play</span>}
          {check.complete && check.standard === false && <span className="text-muted"> · Extra only</span>}
        </p>
        <ul className="mt-1 space-y-0.5 text-meta text-muted">
          {check.issues.map((i) => (
            <li key={i.text}>{i.text}</li>
          ))}
          {attrs && deck.leader && check.standard !== null && (
            <li>
              {check.standard ? (
                'Standard legal'
              ) : (
                <>
                  <span className="font-medium text-bad">Not Standard legal</span>: {listSome(check.notStandard)}
                </>
              )}
              {check.extra ? ' · Extra legal' : ''}
            </li>
          )}
          {!attrs && <li>Reading card attributes…</li>}
        </ul>
      </section>

      {/* The fifty, by category */}
      {groups.map((g) => (
        <section key={g.category} aria-label={g.category} className="mt-6">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-muted">{g.category}s</h2>
            <span className="tabular text-meta text-muted">{g.items.reduce((n, i) => n + i.qty, 0)}</span>
          </div>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
            {g.items.map(({ card, qty, a }) => (
              <li key={card.baseNumber} className="flex items-center gap-3 px-3 py-2">
                <Link to={`/cards/${encodeURIComponent(card.cardNumber)}`} className="w-10 shrink-0">
                  <CardArt card={card} className="rounded-md" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium leading-5 text-ink">{card.name}</p>
                  <p className="tabular truncate text-meta text-muted">
                    {card.baseNumber}
                    {a?.cost !== null && a?.cost !== undefined && ` · Cost ${a.cost}`}
                    {a?.power !== null && a?.power !== undefined && ` · ${a.power}`}
                  </p>
                </div>
                <Stepper value={qty} max={MAX_COPIES} onChange={(n) => setCardQty(deck.id, card.baseNumber, n)} compact />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Add cards */}
      <section aria-label={pickLeader ? 'Choose a leader' : 'Add cards'} className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-muted">{pickLeader ? 'Choose a leader' : 'Add cards'}</h2>
          {!pickLeader && check.colours.length > 0 && (
            <div role="group" aria-label="Colours" className="flex gap-1">
              {[
                { key: false, label: check.colours.join(' / ') },
                { key: true, label: 'All colours' },
              ].map((o) => (
                <button
                  key={String(o.key)}
                  type="button"
                  aria-pressed={allColours === o.key}
                  onClick={() => setAllColours(o.key)}
                  className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors duration-150 ease-out ${allColours === o.key ? 'bg-ink text-white' : 'text-muted hover:bg-white hover:text-ink'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {pickLeader && deck.leader && (
            <button type="button" onClick={() => setPickLeader(false)} className="rounded-full px-3 py-1 text-meta font-medium text-ink hover:bg-paper">
              Keep {deck.leader}
            </button>
          )}
        </div>
        <SearchField value={query} onChange={setQuery} placeholder={pickLeader ? 'Leader name or number' : 'Card name or number'} className="mt-3 tablet:max-w-[560px]" />
        {results.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {results.map((card) => {
              const a = attrs?.get(card.baseNumber)
              const qty = deck.cards[card.baseNumber] ?? 0
              return (
                <li key={card.baseNumber} className="flex items-center gap-3 px-3 py-2">
                  <div className="w-10 shrink-0">
                    <CardArt card={card} className="rounded-md" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium leading-5 text-ink">{card.name}</p>
                    <p className="tabular truncate text-meta text-muted">
                      {card.baseNumber}
                      {a?.category && ` · ${a.category}`}
                      {a?.color && ` · ${a.color}`}
                      {a?.cost !== null && a?.cost !== undefined && ` · Cost ${a.cost}`}
                    </p>
                  </div>
                  {pickLeader ? (
                    <button
                      type="button"
                      onClick={() => { setLeader(deck.id, card.baseNumber); setPickLeader(false); setQuery('') }}
                      className="shrink-0 rounded-full border border-line px-3 py-1.5 text-meta font-medium text-ink hover:bg-paper"
                    >
                      Lead
                    </button>
                  ) : (
                    <Stepper value={qty} max={MAX_COPIES} onChange={(n) => setCardQty(deck.id, card.baseNumber, n)} compact />
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {query.trim().length >= 2 && results.length === 0 && <p className="mt-3 px-1 text-body text-muted">No cards match.</p>}
      </section>

      {/* 6.3 From your collection */}
      {gap.total > 0 && (
        <section aria-label="From your collection" className="mt-8 rounded-2xl border border-line bg-surface p-4">
          <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">From your collection</p>
          <p className="tabular mt-1 text-body text-ink">
            You own {gap.owned} of {gap.total}
            {gap.missing.length > 0 && (
              <span className="text-muted">
                {' '}· {gap.total - gap.owned} missing{gap.cost !== null ? ` · ${formatUsd(gap.cost)} to complete at seed prices` : ''}
              </span>
            )}
          </p>
          {gap.missing.length > 0 && (
            <>
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {gap.missing.map((m) => (
                  <li key={m.card.baseNumber} className="flex items-center justify-between gap-3 py-2 text-meta">
                    <span className="min-w-0 truncate text-ink">
                      {m.card.name} <span className="tabular text-muted">{m.card.baseNumber}</span>
                    </span>
                    <span className="tabular shrink-0 text-muted">
                      need {m.need - m.have}
                      {m.each !== null && ` · ${formatUsd(m.each)} each`}
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
        </section>
      )}

      {/* Text export / import */}
      <section aria-label="Deck list as text" className="mt-8">
        <div className="flex flex-wrap gap-2">
          <GhostButton className="tablet:max-w-[220px]" onClick={copyText}>
            {copied ? 'Copied' : 'Copy as text'}
          </GhostButton>
          <GhostButton className="tablet:max-w-[220px]" onClick={() => { setShowText((v) => !v); setImportNote(null) }}>
            {showText ? 'Hide text' : 'Paste a list'}
          </GhostButton>
        </div>
        {showText && (
          <div className="mt-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              aria-label="Deck list text"
              placeholder={'1xOP09-001\n4xOP09-004\n…'}
              className="tabular w-full rounded-xl border border-line bg-surface p-3 text-[14px] text-ink focus:border-ink focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <GhostButton className="tablet:max-w-[220px]" onClick={importFrom} disabled={!text.trim()}>
                Replace the list with this
              </GhostButton>
              {importNote && <p className="text-meta text-muted">{importNote}</p>}
            </div>
          </div>
        )}
      </section>

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
    </Screen>
  )
}

function Stepper({ value, max, onChange, compact = false }: { value: number; max: number; onChange: (n: number) => void; compact?: boolean }) {
  const btn = `flex ${compact ? 'h-8 w-8' : 'h-9 w-9'} items-center justify-center rounded-full border border-line text-ink transition-colors duration-150 ease-out hover:bg-paper active:bg-[#F0ECE4] disabled:opacity-40`
  return (
    <div className="flex shrink-0 items-center gap-1.5" aria-label="Copies">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label="One fewer">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path d="M3.5 8h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <span className="tabular min-w-[1.5ch] text-center text-body font-semibold text-ink" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="One more">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
