import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'
import { ReaderCutoff } from '../components/ReaderCutoff'
import { SearchField } from '../components/SearchField'
import { useAllAttributes } from '../data/attributes'
import { useReaderCutoff } from '../store/readerCutoff'
import { personVisible, printedPeople } from '../lib/belong'
import { pluralPrints } from '../lib/search'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Second character book: A–Z of printed Character and Leader names, into the
 * print pages that already exist. Not a third encyclopedia.
 */
export function BelongPeopleScreen() {
  const attrs = useAllAttributes()
  const reader = useReaderCutoff()
  const [query, setQuery] = useState('')
  const [letter, setLetter] = useState<string | null>(null)

  const people = useMemo(() => (attrs ? printedPeople(attrs) : []), [attrs])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter((p) => {
      if (!personVisible(p.name, reader)) return false
      if (letter && p.letter !== letter) return false
      if (q && !p.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [people, reader, letter, query])

  const present = useMemo(() => new Set(people.filter((p) => personVisible(p.name, reader)).map((p) => p.letter)), [people, reader])

  return (
    <Screen>
      <BackBar crumbs={[{ label: 'Belong', to: '/belong' }, { label: 'People' }]} fallbackTo="/belong" />
      <header className="mb-6">
        <h1 className="text-display text-ink">People</h1>
        <p className="mt-1 max-w-[60ch] text-body text-muted">
          Every Character and Leader on an EN print. Tap a name for the prints. Who they are lives on that page, behind
          the same chapter you picked.
        </p>
      </header>
      <ReaderCutoff className="mb-6" />

      {!attrs ? (
        <p className="px-1 text-meta text-muted">Loading…</p>
      ) : (
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Find a name" className="tablet:max-w-[560px]" />
          <nav aria-label="Jump to a letter" className="mt-3 flex flex-wrap items-center gap-x-1">
            {LETTERS.filter((L) => present.has(L)).map((L) => {
              const on = letter === L
              return (
                <button
                  key={L}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLetter(on ? null : L)}
                  className="flex h-11 items-center rounded-full px-0.5"
                >
                  <span
                    className={`flex h-8 min-w-8 items-center justify-center rounded-full border px-2.5 text-[13px] font-medium ${
                      on ? 'border-ink bg-ink text-paper' : 'border-line text-muted hover:bg-white hover:text-ink'
                    }`}
                  >
                    {L}
                  </span>
                </button>
              )
            })}
          </nav>
          <p className="tabular mt-4 text-meta text-ink">
            {visible.length} {visible.length === 1 ? 'name' : 'names'}
            {people.length !== visible.length && ` · ${people.length} printed`}
          </p>
          <ol className="mt-2 divide-y divide-line">
            {visible.map((p) => (
              <li key={p.name} id={`letter-${p.letter}`} className="scroll-mt-4">
                <Link
                  to={`/characters/${encodeURIComponent(p.name)}`}
                  className="-mx-1 flex min-h-11 items-baseline justify-between gap-3 rounded-lg px-1 py-2.5 text-ink hover:bg-white"
                >
                  <span className="min-w-0 text-[15px] font-medium">{p.name}</span>
                  <span className="tabular shrink-0 text-meta text-muted">
                    {pluralPrints(p.prints)}
                    {p.sets > 1 && ` · ${p.sets} sets`}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {visible.length === 0 && (
            <p className="mt-6 text-body text-muted">
              {query.trim() ? `No printed name matches “${query.trim()}”.` : 'No names at this chapter.'}
            </p>
          )}
        </>
      )}
    </Screen>
  )
}
