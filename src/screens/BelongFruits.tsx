import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'
import { ReaderCutoff } from '../components/ReaderCutoff'
import { WikiLicence } from '../components/WikiLicence'
import { WIKI_FRUITS } from '../data/wiki'
import { useReaderCutoff } from '../store/readerCutoff'
import { fruitVisible, letterOf } from '../lib/belong'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Fruit Pokédex: Devil Fruits the wiki Char Box records on a mapped printed
 * name. Later-names after a line break (Nika) are not stored.
 */
export function BelongFruitsScreen() {
  const reader = useReaderCutoff()
  const [letter, setLetter] = useState<string | null>(null)
  const fruits = useMemo(() => WIKI_FRUITS.filter((f) => fruitVisible(f, reader)), [reader])
  const visible = useMemo(
    () => fruits.filter((f) => !letter || letterOf(f.name) === letter),
    [fruits, letter],
  )
  const present = useMemo(() => new Set(fruits.map((f) => letterOf(f.name))), [fruits])

  return (
    <Screen>
      <BackBar crumbs={[{ label: 'World', to: '/belong' }, { label: 'Fruits' }]} fallbackTo="/belong" />
      <header className="mb-6">
        <h1 className="text-display text-ink">Fruits</h1>
        <p className="mt-1 max-w-[60ch] text-body text-muted">
          {WIKI_FRUITS.length} Devil Fruits on the names we have asked the wiki. A later name that sits after a line
          break is not stored. The rest of the roster has not been fetched yet.
        </p>
      </header>
      <ReaderCutoff className="mb-6" />

      {!reader.unlocksStory ? (
        <p className="max-w-[60ch] text-body text-ink">Pick how far you have read to open the dex.</p>
      ) : (
        <>
          <nav aria-label="Jump to a letter" className="flex flex-wrap items-center gap-x-1">
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
            {visible.length} {visible.length === 1 ? 'fruit' : 'fruits'}
            {fruits.length !== WIKI_FRUITS.length && ` · ${WIKI_FRUITS.length} asked`}
          </p>
          <ol className="mt-2 divide-y divide-line">
            {visible.map((f) => (
              <li key={f.name} className="py-4">
                <p className="text-[15px] font-medium text-ink">{f.name}</p>
                <p className="mt-0.5 text-meta text-muted">
                  {[f.jname, f.type].filter(Boolean).join(' · ')}
                </p>
                <ul className="mt-1">
                  {f.eaters
                    .filter((e) => reader.finished || reader.chapter == null || e.debutChapter == null || e.debutChapter <= reader.chapter)
                    .map((e) => (
                      <li key={e.name}>
                        <Link
                          to={`/characters/${encodeURIComponent(e.name)}`}
                          className="-mx-1 inline-flex min-h-11 items-center rounded-lg px-1 text-[15px] text-ink underline decoration-line underline-offset-2 hover:bg-white hover:decoration-ink"
                        >
                          {e.name}
                        </Link>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
          {visible.length === 0 && <p className="mt-6 text-body text-muted">No fruits at this chapter.</p>}
          {visible.length > 0 && <WikiLicence className="mt-8" />}
        </>
      )}
    </Screen>
  )
}
