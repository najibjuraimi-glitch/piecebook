import { CUTOFFS, useReaderCutoff, type CutoffId } from '../store/readerCutoff'

/**
 * How far the reader has finished. Hairline chips, 44px targets, wrapping.
 * Debut arc is the default and unlocks no fruits. The three-line explanation
 * lives on the portal only — rooms keep the chips.
 */
export function ReaderCutoff({ className = '', explain = false }: { className?: string; explain?: boolean }) {
  const { id, setId } = useReaderCutoff()
  return (
    <div className={className}>
      <p className="text-meta font-medium uppercase tracking-[0.08em] text-muted">How far have you read</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="How far have you read">
        {CUTOFFS.map((c) => {
          const on = c.id === id
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => setId(c.id as CutoffId)}
              className={`flex h-11 items-center rounded-full px-0.5`}
            >
              <span
                className={`flex h-8 items-center rounded-full border px-2.5 text-[13px] font-medium transition-colors duration-150 ease-out ${
                  on ? 'border-ink bg-ink text-paper' : 'border-line text-muted hover:bg-white hover:text-ink'
                }`}
              >
                {c.label}
              </span>
            </button>
          )
        })}
      </div>
      {explain && (
        <p className="mt-2 max-w-[60ch] text-meta text-ink">
          Fruits stay behind the last arc you have finished. On a saga chip, a name we cannot place before that chapter
          is hidden. Who they are on a page you open follows the same chapter. The story list is titles and ranges only.
        </p>
      )}
    </div>
  )
}
