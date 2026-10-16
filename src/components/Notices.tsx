import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MOVED_TO } from '../config/api'
import { downloadBackup } from '../lib/backupFile'
import { keepLocalForNow, uploadLocalData, useSync } from '../store/sync'
import { describeSummary, snapshotDocs, summariseDocs } from '../store/userData'
import { CONTENT_COLUMN } from './Screen'

const BTN = 'inline-flex min-h-[40px] items-center justify-center rounded-xl px-4 text-[15px] font-semibold transition-colors duration-150 ease-out'
const PRIMARY = `${BTN} bg-accent text-white hover:bg-[#B2511F] active:bg-[#9E4719]`
const GHOST = `${BTN} border border-line bg-transparent text-ink hover:bg-white active:bg-[#F0ECE4]`
const MOVED_DISMISSED = 'piecebook.moved.dismissed.session'

function Strip({ children, tone = 'ink' }: { children: React.ReactNode; tone?: 'ink' | 'accent' }) {
  return (
    <div className={`border-b ${tone === 'accent' ? 'border-accent/30 bg-[#FBEFE7]' : 'border-line bg-surface'}`} role="status">
      <div className={`${CONTENT_COLUMN} flex flex-col gap-3 py-3 tablet:flex-row tablet:items-center tablet:justify-between`}>{children}</div>
    </div>
  )
}

/**
 * Old-site banner, built in only when VITE_MOVED_TO is set (the GitHub Pages
 * workflow). Says where Piecebook went and hands over the backup file, which
 * the new home's "Your data" screen imports.
 */
export function MovedBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return window.sessionStorage.getItem(MOVED_DISMISSED) === '1'
    } catch {
      return false
    }
  })
  if (!MOVED_TO || hidden) return null
  let host = MOVED_TO
  try {
    host = new URL(MOVED_TO).host
  } catch {
    // Keep the raw string.
  }
  const dismiss = () => {
    try {
      window.sessionStorage.setItem(MOVED_DISMISSED, '1')
    } catch {
      // Session marker is best-effort.
    }
    setHidden(true)
  }
  return (
    <Strip tone="accent">
      <p className="text-[15px] leading-6 text-ink">
        <span className="font-semibold">Piecebook has moved to {host}.</span> Your collection stays in this browser; download it here and import it
        there (Your data).
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" className={PRIMARY} onClick={() => downloadBackup()}>
          Download my data
        </button>
        <a className={GHOST} href={MOVED_TO} rel="noopener">
          Open new home
        </a>
        <button type="button" className={GHOST} onClick={dismiss} aria-label="Hide for this visit">
          Later
        </button>
      </div>
    </Strip>
  )
}

/**
 * Sync states that need the collector: the first-login upload offer, and an
 * expired sign-in. Everything else sits quietly on the Your data screen.
 */
export function SyncNotice() {
  const sync = useSync()
  const { pathname } = useLocation()
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState('')
  useEffect(() => {
    if (sync.status === 'held') setSummary(describeSummary(summariseDocs(snapshotDocs())))
  }, [sync.status])
  if (pathname === '/your-data') return null
  if (sync.status === 'signed-out') {
    return (
      <Strip>
        <p className="text-[15px] leading-6 text-ink">Your sign-in has expired. Changes stay on this device until you sign in again.</p>
        <button type="button" className={GHOST} onClick={() => window.location.reload()}>
          Sign in again
        </button>
      </Strip>
    )
  }
  if (sync.status === 'held') {
    const upload = async () => {
      setBusy(true)
      try {
        await uploadLocalData()
      } finally {
        setBusy(false)
      }
    }
    return (
      <Strip>
        <p className="text-[15px] leading-6 text-ink">
          <span className="font-semibold">Your data is only on this device.</span> Upload it so {sync.identity ?? 'your account'} sees it everywhere
          ({summary}).
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className={PRIMARY} disabled={busy} onClick={upload}>
            {busy ? 'Uploading…' : 'Upload to cloud'}
          </button>
          <button type="button" className={GHOST} onClick={keepLocalForNow}>
            Not now
          </button>
          <Link to="/your-data" className={`${GHOST} no-underline`}>
            Details
          </Link>
        </div>
      </Strip>
    )
  }
  return null
}
