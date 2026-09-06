import { getWiki, hasWikiContent } from '../data/wiki'
import { bornLabel } from '../lib/fandom'
import { WikiAttribution } from './WikiAttribution'

/**
 * The who-is block for a character page (7.8): the gated wiki sentence in ink,
 * `Born 9 March` in ink when the Char Box parsed a day, then the attribution.
 * Renders nothing when the pipeline stored neither a line nor a birthday.
 */
export function WhoIs({ name, className = '' }: { name: string; className?: string }) {
  const entry = getWiki(name)
  if (!hasWikiContent(entry)) return null
  return (
    <div className={`max-w-[60ch] ${className}`}>
      {entry.line && <p className="text-body text-ink">{entry.line}.</p>}
      {entry.birth && <p className={`text-body text-ink ${entry.line ? 'mt-1' : ''}`}>Born {bornLabel(entry.birth)}</p>}
      <WikiAttribution entry={entry} className="mt-1" />
    </div>
  )
}
