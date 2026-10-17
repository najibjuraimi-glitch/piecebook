import { useCallback, useEffect, useState } from 'react'
import { PHOTO_GUIDE_SHORT, PHOTO_TIPS, photoTip, type PhotoTipId } from '../lib/photoGuide'

/** Set the first time a check runs on this device; the guide folds to one line after that. */
const USED_KEY = 'piecebook.photoGuide.used.v1'

function readUsed(): boolean {
  try {
    return localStorage.getItem(USED_KEY) === '1'
  } catch {
    return false
  }
}

export function markPhotoGuideUsed(): void {
  try {
    localStorage.setItem(USED_KEY, '1')
  } catch {
    // Private mode: the guide simply stays open next time.
  }
}

export function tipAnchor(id: PhotoTipId): string {
  return `photo-tip-${id}`
}

/**
 * The guide block on /pregrade. Open in full until the collector has run a
 * check once; after that, one line with a toggle. `openTip` expands it and
 * scrolls to a tip, used by the links next to a result.
 */
export function usePhotoGuide() {
  const [used, setUsed] = useState(readUsed)
  const [open, setOpen] = useState(() => !readUsed())
  useEffect(() => {
    if (used) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === USED_KEY && e.newValue === '1') setUsed(true)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [used])
  const markUsed = useCallback(() => {
    markPhotoGuideUsed()
    setUsed(true)
    setOpen(false)
  }, [])
  const openTip = useCallback((id: PhotoTipId) => {
    setOpen(true)
    // The list may be folded right now; scroll once it has rendered.
    window.setTimeout(() => {
      document.getElementById(tipAnchor(id))?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      document.getElementById(tipAnchor(id))?.focus({ preventScroll: true })
    }, 30)
  }, [])
  return { used, open, setOpen, markUsed, openTip }
}

export function PhotoGuide({ used, open, onToggle }: { used: boolean; open: boolean; onToggle: (open: boolean) => void }) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3" aria-labelledby="photo-guide-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="photo-guide-title" className="text-meta font-medium text-muted">
            {used ? 'Photo tips' : 'Before you shoot'}
          </h3>
          {!open && <p className="mt-1 text-body text-ink">{PHOTO_GUIDE_SHORT}</p>}
        </div>
        {used && (
          <button
            type="button"
            className="shrink-0 text-meta text-muted underline"
            aria-expanded={open}
            aria-controls="photo-guide-list"
            onClick={() => onToggle(!open)}
          >
            {open ? 'Hide' : 'Show all'}
          </button>
        )}
      </div>
      {open && (
        <ol id="photo-guide-list" className="mt-2 space-y-2.5">
          {PHOTO_TIPS.map((tip, i) => (
            <li key={tip.id} id={tipAnchor(tip.id)} tabIndex={-1} className="flex gap-3 rounded-xl outline-none focus:bg-white">
              <span className="tabular w-5 shrink-0 text-right text-meta text-muted">{i + 1}.</span>
              <div className="min-w-0">
                <p className="text-body font-medium text-ink">{tip.short}</p>
                <p className="mt-0.5 text-meta text-muted">{tip.text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** The tips a result points at, as links that open the guide at the right line. */
export function PhotoTipLinks({ tips, onOpen }: { tips: PhotoTipId[]; onOpen: (id: PhotoTipId) => void }) {
  if (!tips.length) return null
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3" aria-label="Photo tips for this result">
      <p className="text-meta font-medium text-muted">For a better read next time</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {tips.map((id) => (
          <li key={id}>
            <button type="button" className="text-body text-ink underline decoration-line underline-offset-2 hover:decoration-ink" onClick={() => onOpen(id)}>
              {photoTip(id).short}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
