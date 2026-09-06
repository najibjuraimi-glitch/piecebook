import { BackBar, Screen } from '../components/Screen'
import { ReaderCutoff } from '../components/ReaderCutoff'
import { WikiLicence } from '../components/WikiLicence'
import { STORY_ARCS, WIKI_STORY_REVID, WIKI_STORY_TITLE } from '../data/wiki'
import { arcTitle, mediaLine } from '../lib/belong'

/**
 * Story index: every main arc, its chapter and episode range. No plot.
 */
export function BelongStoryScreen() {
  return (
    <Screen>
      <BackBar crumbs={[{ label: 'World', to: '/belong' }, { label: 'Story' }]} fallbackTo="/belong" />
      <header className="mb-6">
        <h1 className="text-display text-ink">Story</h1>
        <p className="mt-1 max-w-[60ch] text-body text-muted">
          Main arcs in manga order. Name, chapters, and episodes. No plot. Chapter pages on the wiki are titles. Official
          episode synopses are not licensed.
        </p>
      </header>
      <ReaderCutoff className="mb-8" />
      <ol className="max-w-[60ch] divide-y divide-line">
        {STORY_ARCS.map((arc) => (
          <li key={arc.name} className="py-5 first:pt-0">
            <h2 className="text-title text-ink">{arcTitle(arc.name)}</h2>
            <p className="tabular mt-1 text-meta text-ink">{mediaLine(arc)}</p>
          </li>
        ))}
      </ol>
      <WikiLicence className="mt-8" work={WIKI_STORY_TITLE} revid={WIKI_STORY_REVID} />
    </Screen>
  )
}
