import React from 'react'
import { Link, useNavigate } from 'react-router-dom'

interface ScreenProps {
  children: React.ReactNode
  className?: string
}

/**
 * Content column. Phone: 480px max, 16px sides, room for the tab bar below.
 * From tablet up it grows per docs/V1-DESKTOP-LAYOUT.md with 24px sides and
 * plain paper margins either side (no sidebar).
 */
export const CONTENT_COLUMN = 'mx-auto w-full max-w-phone px-4 tablet:max-w-tablet tablet:px-6 desktop:max-w-desktop wide:max-w-wide'

/** Negative-margin bleed to the column edge, for sticky/scroll strips. */
export const BLEED = '-mx-4 px-4 tablet:-mx-6 tablet:px-6'

export function Screen({ children, className = '' }: ScreenProps) {
  return (
    <main
      className={`${CONTENT_COLUMN} pt-6 ${className}`}
      style={{ paddingBottom: 'calc(var(--tabbar-h) + var(--safe-bottom) + 32px)' }}
    >
      {children}
    </main>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[17px] font-bold leading-6 tracking-[-0.01em] text-ink ${className}`} aria-label="Piecebook">
      Piecebook
    </p>
  )
}

interface TitleProps {
  title: string
  subline?: string
}

export function ScreenTitle({ title, subline }: TitleProps) {
  return (
    <header className="mb-6">
      {/* The TopBar carries the wordmark from tablet up. */}
      <Wordmark className="tablet:hidden" />
      <h1 className="mt-4 text-display text-ink tablet:mt-0">{title}</h1>
      {subline && <p className="mt-1 text-body text-muted">{subline}</p>}
    </header>
  )
}

export interface Crumb {
  label: string
  /** Omit on the current page. */
  to?: string
}

interface BackBarProps {
  title?: string
  subline?: string
  /** One quiet ink line under the subline, e.g. "You own 12 of 151". */
  meta?: string
  /** Path from home to here, e.g. Sets › OP-09 › OP09-004p1. Rendered in place of the title. */
  crumbs?: Crumb[]
  fallbackTo: string
  /** Optional single quiet action on the right (e.g. the watchlist star). */
  action?: React.ReactNode
}

/** Quiet text breadcrumb: ink links, muted separators, current item in ink without a link. */
function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 pt-3">
      <ol className="tabular flex min-w-0 flex-wrap items-center gap-x-1.5 text-meta text-muted">
        {crumbs.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-x-1.5">
            {i > 0 && <span aria-hidden="true">›</span>}
            {c.to ? (
              <Link to={c.to} className="truncate rounded-sm text-ink hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-ink">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Detail-screen header: in-app chevron (uses history when available) + optional title or breadcrumb + one right-side action. */
export function BackBar({ title, subline, meta, crumbs, fallbackTo, action }: BackBarProps) {
  const navigate = useNavigate()
  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(fallbackTo)
  }
  return (
    <header className="mb-5 flex items-start gap-2">
      <button
        type="button"
        onClick={goBack}
        aria-label="Back"
        className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-out hover:bg-white active:bg-[#F0ECE4]"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
          <path d="M14.5 5.5L8 12l6.5 6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {title && (
        <div className="min-w-0 flex-1 pt-1.5">
          <h1 className="tabular truncate text-title text-ink">{title}</h1>
          {subline && <p className="truncate text-meta text-muted">{subline}</p>}
          {meta && <p className="tabular mt-0.5 truncate text-meta text-ink">{meta}</p>}
        </div>
      )}
      {!title && crumbs && (
        <div className="min-w-0 flex-1">
          <Breadcrumb crumbs={crumbs} />
        </div>
      )}
      {action && <div className={`${title || crumbs ? '' : 'ml-auto'} -mr-2 shrink-0`}>{action}</div>}
    </header>
  )
}
