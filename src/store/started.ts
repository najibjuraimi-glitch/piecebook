/**
 * Start here (8.1) is shown once: on a first visit to `/` with nothing owned,
 * the app redirects to `/start`, and never again once a door or "Just show me
 * the sets" has been taken. The flag is local like everything else; a second
 * session-scoped marker keeps the redirect from firing twice in one visit if
 * the visitor leaves `/start` by the tab bar instead. Deep links never redirect.
 */
const STORAGE_KEY = 'piecebook.started.v1'
const SESSION_KEY = 'piecebook.started.session'

export function hasStarted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return true
  }
}

/** Set when a door or Skip is taken; after this, `/` is Sets home for good. */
export function markStarted(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, new Date().toISOString())
  } catch {
    // Storage unavailable: the session marker below still stops a loop.
  }
}

/** True the first time it is asked in a browser session; false after, so one visit sees Start here at most once. */
export function claimFirstShowing(): boolean {
  try {
    if (window.sessionStorage.getItem(SESSION_KEY) !== null) return false
    window.sessionStorage.setItem(SESSION_KEY, '1')
    return true
  } catch {
    return false
  }
}
