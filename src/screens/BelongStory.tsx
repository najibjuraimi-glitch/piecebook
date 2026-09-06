import { BackBar, Screen } from '../components/Screen'
import { ReaderCutoff } from '../components/ReaderCutoff'
import { WikiLicence } from '../components/WikiLicence'
import { STORY_ARCS } from '../data/wiki'
import { useReaderCutoff } from '../store/readerCutoff'
import { arcTitle, mediaLine, summaryVisible } from '../lib/belong'

/**
 * Chapter and anime index: every main arc, its chapter and episode range, and
 * the wiki Story Arcs paragraph once the reader has finished that arc.
 */
export function BelongStoryScreen() {
  const reader = useReaderCutoff()
  const anySummary = STORY_ARCS.some((a) => summaryVisible(a, reader) && a.summary)

  return (
    <Screen>
      <BackBar crumbs={[{ label: 'World', to: '/belong' }, { label: 'Story' }]} fallbackTo="/belong" />
      <header className="mb-6">
        <h1 className="text-display text-ink">Story</h1>
        <p className="mt-1 max-w-[60ch] text-body text-muted">
          Main arcs in manga order. Chapter pages on the wiki are titles. Official episode synopses are not licensed.
          The paragraph is the wiki’s, shown after you finish the arc.
        </p>
      </header>
      <ReaderCutoff className="mb-8" />
      <ol className="max-w-[60ch] divide-y divide-line">
        {STORY_ARCS.map((arc) => {
          const open = summaryVisible(arc, reader) && Boolean(arc.summary)
          return (
            <li key={arc.name} className="py-5 first:pt-0">
              <h2 className="text-title text-ink">{arcTitle(arc.name)}</h2>
              <p className="tabular mt-1 text-meta text-ink">{mediaLine(arc)}</p>
              {open ? (
                <p className="mt-2 text-body text-ink">{arc.summary}</p>
              ) : (
                <p className="mt-2 text-body text-muted">
                  {reader.unlocksStory ? 'Finish this arc to read the summary.' : 'Pick how far you have read to unlock the summary.'}
                </p>
              )}
            </li>
          )
        })}
      </ol>
      {anySummary && <WikiLicence className="mt-8" />}
    </Screen>
  )
}
