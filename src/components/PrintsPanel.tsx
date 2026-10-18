import { matchPrints } from '../lib/printPanel'
import type { LegalGrade } from '../lib/boughtBook'
import { formatDate, formatSgd, formatUsd } from '../lib/format'

const STALE = ' · Stale, older than 7 days'

function SourceName({ source, url }: { source: string; url: string | null }) {
  if (!url) return source
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-line underline-offset-2">
      {source}
    </a>
  )
}

interface Props {
  code: string
  grade?: LegalGrade | null
  exactPrint?: string | null
  /** A watch row's code is the print id. A holding is pinned only by exactPrint. */
  codeIsPin?: boolean
  /** Copies of one holding are pinned to different prints. */
  mixed?: boolean
}

/**
 * Every seed print of this card number. Collapsed until opened.
 * A Japanese figure is labeled JP and is not the value.
 */
export function PrintsPanel({ code, grade = null, exactPrint = null, codeIsPin = false, mixed = false }: Props) {
  const panel = matchPrints({ code, exactPrint, grade, codeIsPin })
  if (!panel.base) return null
  return (
    <details className="mt-2" data-testid="prints">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-meta text-muted">
        Prints
        <span className="tabular ml-2">{panel.prints.length}</span>
      </summary>
      {(panel.exactMissing || mixed) && (
        <p className="mt-1 text-meta text-ink" role="status">
          {mixed ? 'Copies are pinned to different prints.' : 'No exact print set.'}
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {panel.prints.map((print) => (
          <li key={print.cardNumber} className="flex gap-2" data-pinned={print.pinned ? 'true' : 'false'}>
            {print.imageUrl ? (
              <img src={print.imageUrl} alt="" className="h-11 w-8 shrink-0 rounded-md bg-[#EFEBE3] object-cover" />
            ) : (
              <span className="h-11 w-8 shrink-0 rounded-md bg-[#EFEBE3]" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-meta text-ink">
                <span className="tabular font-medium">{print.cardNumber}</span>
                {print.pinned ? ' · Pinned' : ''}
              </p>
              <p className="text-meta text-muted">
                {print.rarityLabel}
                {print.variant ? ` · ${print.variant}` : ''}
              </p>
              <p className="tabular text-meta text-ink">
                {print.english ? (
                  <>
                    {formatSgd(print.english.sgd)}
                    {' · '}
                    <SourceName source={print.english.source} url={print.english.url} />
                    {` · ${formatDate(print.english.asOf)}`}
                    {print.english.stale ? STALE : ''}
                  </>
                ) : (
                  'no price'
                )}
              </p>
              {print.japanese.map((note) => (
                <p key={`${note.grade}-${note.asOf}`} className="tabular text-meta text-muted">
                  JP · {note.grade} · {formatUsd(note.usd)}
                  {' · '}
                  <SourceName source={note.source} url={note.url} />
                  {` · ${formatDate(note.asOf)}`}
                  {note.stale ? STALE : ''}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </details>
  )
}
