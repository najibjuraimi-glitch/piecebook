import { getWiki } from '../data/wiki'
import { bornLabel, visibleLine } from '../lib/fandom'
import { useReaderCutoff } from '../store/readerCutoff'

/**
 * The who-is block for a character page (7.8): the gated wiki sentence in ink
 * when the title is not a later-name reveal, and `Born 9 March` in ink when
 * the Char Box parsed a day. Attribution sits after the prints line, not here.
 */
export function WhoIs({ name, className = '' }: { name: string; className?: string }) {
  const reader = useReaderCutoff()
  const entry = getWiki(name)
  const line = visibleLine(entry, { chapter: reader.chapter, finished: reader.finished })
  if (!line && !entry?.birth) return null
  return (
    <div className={`max-w-[60ch] ${className}`}>
      {line && <p className="text-body text-ink">{line}.</p>}
      {entry?.birth && <p className={`text-body text-ink ${line ? 'mt-1' : ''}`}>Born {bornLabel(entry.birth)}</p>}
    </div>
  )
}
