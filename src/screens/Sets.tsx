import React, { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ROSTER } from '../data/roster'
import { Screen, ScreenTitle } from '../components/Screen'
import { SetTile } from '../components/SetTile'
import { EmptyState } from '../components/EmptyState'
import { SearchField } from '../components/SearchField'
import { SearchResults } from '../components/SearchResults'
import { resolveCardNumber, searchAll } from '../lib/search'

/**
 * Every EN set on Cards' roster, oldest EN release first. The roster, not the
 * card CSVs, decides membership. One search field above the tiles searches
 * every set at once (`?q=`); the tiles step aside for as long as there is a
 * query, and results are grouped by set so the tree stays visible. Enter on a
 * full card number opens the card.
 */
export function SetsScreen() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const query = params.get('q') ?? ''
  const searching = query.trim() !== ''
  const results = useMemo(() => searchAll(query), [query])

  const setQuery = (q: string) => {
    const next = new URLSearchParams(params)
    if (q.trim()) next.set('q', q)
    else next.delete('q')
    setParams(next, { replace: true })
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const card = resolveCardNumber(query)
    if (card) navigate(`/cards/${encodeURIComponent(card.cardNumber)}`)
  }

  return (
    <Screen>
      <ScreenTitle title="Sets" subline="EN sets" />

      <form role="search" onSubmit={onSubmit} className="mb-6">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search every set by name or number"
          className="tablet:max-w-[560px]"
        />
      </form>

      {results ? (
        <SearchResults results={results} />
      ) : searching ? (
        <p className="px-1 pt-10 text-center text-body text-muted">Keep typing to search every set.</p>
      ) : ROSTER.length === 0 ? (
        <EmptyState message="No sets loaded yet." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 wide:grid-cols-3">
          {ROSTER.map((set) => (
            <li key={set.setCode}>
              <SetTile set={set} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
