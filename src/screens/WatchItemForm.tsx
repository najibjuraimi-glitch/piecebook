import { useEffect, useId, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DangerGhostButton, PrimaryButton } from '../components/Buttons'
import { BackBar, Screen } from '../components/Screen'
import { parseMoney } from '../lib/boughtBook'
import { todayIso } from '../lib/format'
import { deleteWatchItem, getWatchlist, patchWatchItem, postWatchItem } from '../lib/watchlistClient'
import type { WatchGrade } from '../lib/watchlist'
import { priceLine } from './Watchlist'

const field =
  'mt-1.5 block h-11 w-full rounded-xl border border-line bg-paper/60 px-3.5 text-body text-ink placeholder:text-muted/70 focus:border-ink focus:bg-surface focus:outline-none'
const label = 'block text-meta font-medium text-muted'
const GRADES: WatchGrade[] = ['Raw', 'PSA 9', 'PSA 10']

function moneyOrNull(raw: string): number | null {
  if (!raw.trim()) return null
  const n = parseMoney(raw)
  return n != null && n >= 0 ? n : null
}

export function WatchItemForm({ mode }: { mode: 'add' | 'edit' }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const ids = useId()
  const [revision, setRevision] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [code, setCode] = useState('')
  const [grade, setGrade] = useState<WatchGrade>('Raw')
  const [target, setTarget] = useState('')
  const [notes, setNotes] = useState('')
  const [added, setAdded] = useState(todayIso())
  const [priced, setPriced] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [hit, setHit] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    getWatchlist(ac.signal)
      .then((res) => {
        if (!res.ok || !res.data) {
          setReady(true)
          return
        }
        setRevision(res.data.revision)
        if (mode === 'add') {
          setReady(true)
          return
        }
        const found = res.data.items.find((item) => item.id === id) ?? null
        setMissing(!found)
        if (found) {
          setCode(found.code)
          setGrade(found.grade)
          setTarget(String(found.targetSgd))
          setNotes(found.notes)
          setAdded(found.added)
          setPriced(priceLine(found))
          setStale(found.stale)
          setHit(found.hit)
        }
        setReady(true)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setReady(true)
      })
    return () => ac.abort()
  }, [mode, id])

  const save = async () => {
    if (revision == null) {
      setError('Sign in to save a target.')
      return
    }
    const targetSgd = moneyOrNull(target)
    if (!code.trim() || targetSgd == null) {
      setError('Add a print code and a target price.')
      return
    }
    setSaving(true)
    setError(null)
    const body = { revision, code: code.trim(), grade, targetSgd, notes: notes.trim(), added: added || null }
    const res = mode === 'add' ? await postWatchItem(body) : await patchWatchItem(id, body)
    setSaving(false)
    if (!res.ok) {
      setError(res.error === 'revision_conflict' ? 'This target changed. Go back and try again.' : 'Could not save.')
      return
    }
    navigate('/watchlist')
  }

  const remove = async () => {
    if (revision == null) {
      setError('Sign in to remove a target.')
      return
    }
    setSaving(true)
    setError(null)
    const res = await deleteWatchItem(id, revision)
    setSaving(false)
    if (!res.ok) {
      setError(res.error === 'revision_conflict' ? 'This target changed. Go back and try again.' : 'Could not remove it.')
      return
    }
    navigate('/watchlist')
  }

  const title = mode === 'add' ? 'Add a target' : 'Edit target'
  return (
    <Screen>
      <BackBar title={title} subline={mode === 'edit' && id ? id : undefined} fallbackTo="/watchlist" />
      {!ready ? (
        <p className="text-body text-muted">Loading…</p>
      ) : missing ? (
        <p className="text-body text-ink">That target is not on your list.</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div>
            <label htmlFor={`${ids}-code`} className={label}>
              Print code
            </label>
            <input id={`${ids}-code`} value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" className={field} />
          </div>
          <div>
            <p className={label}>Target grade</p>
            <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="Target grade">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={grade === g}
                  onClick={() => setGrade(g)}
                  className={`h-11 rounded-xl px-3 text-[14px] font-medium ${grade === g ? 'bg-ink text-paper' : 'border border-line text-ink'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          {mode === 'edit' && priced && (
            <p className="text-meta text-ink">
              {priced}
              {hit ? ' · At or under target' : ''}
              {stale ? ' · Stale, older than 7 days' : ''}
            </p>
          )}
          <div>
            <label htmlFor={`${ids}-target`} className={label}>
              Target price SGD
            </label>
            <input id={`${ids}-target`} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <label htmlFor={`${ids}-added`} className={label}>
              Added
            </label>
            <input id={`${ids}-added`} type="date" value={added} onChange={(e) => setAdded(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <label htmlFor={`${ids}-notes`} className={label}>
              Notes
            </label>
            <textarea id={`${ids}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${field} h-auto py-3`} />
          </div>
          {error && <p className="text-meta text-bad">{error}</p>}
          <PrimaryButton type="submit" disabled={saving}>
            Save target
          </PrimaryButton>
          {mode === 'edit' && (
            <DangerGhostButton disabled={saving} onClick={() => void remove()}>
              Remove {id}
            </DangerGhostButton>
          )}
        </form>
      )}
    </Screen>
  )
}
