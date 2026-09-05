import React from 'react'
import { useNavigate } from 'react-router-dom'

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

interface BackBarProps {
  title?: string
  subline?: string
  fallbackTo: string
  /** Optional single quiet action on the right (e.g. the watchlist star). */
  action?: React.ReactNode
}

/** Detail-screen header: in-app chevron (uses history when available) + optional title + one right-side action. */
export function BackBar({ title, subline, fallbackTo, action }: BackBarProps) {
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
        </div>
      )}
      {action && <div className={`${title ? '' : 'ml-auto'} -mr-2 shrink-0`}>{action}</div>}
    </header>
  )
}
