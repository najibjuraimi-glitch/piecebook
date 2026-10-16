import type { VisionCheck, VisionSection } from '../lib/vision'

/**
 * Corners / edges / surface from the vision Worker, labelled as an AI guess.
 * Photos can rule out a PSA 10; they never confirm one.
 */
export function VisionGuess({ check }: { check: VisionCheck }) {
  const c = check.condition
  if (check.coverage === 'identify_only') {
    return (
      <div className="rounded-2xl border border-line bg-surface px-4 py-3">
        <p className="text-[15px] font-medium leading-5 text-ink">
          AI read the card number only. It declined to describe the condition.
        </p>
        <p className="mt-1 text-meta text-muted">
          Nothing is ruled out by the model. Centering below comes from measuring your photos on this device.
        </p>
        {check.usage.cap > 0 && (
          <p className="tabular mt-3 text-meta text-muted">
            {check.usage.today} of {check.usage.cap} photo checks today.
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-[15px] font-medium leading-5 text-ink">
        AI guess: photos can rule out a PSA 10 but never confirm one.
      </p>
      <p className="mt-1 text-meta text-muted">{check.disclaimer}</p>
      <dl className="mt-3 space-y-2">
        <SectionRow label="Corners" section={c.corners} />
        <SectionRow label="Edges" section={c.edges} />
        <SectionRow label="Surface" section={c.surface} />
      </dl>
      <p className={`mt-3 text-body ${c.psa10_ruled_out ? 'font-medium text-bad' : 'text-ink'}`}>
        {c.psa10_ruled_out ? 'These photos rule out a PSA 10.' : 'These photos do not rule out a PSA 10. They do not confirm one.'}
      </p>
      {c.reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-meta text-ink">
          {c.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {check.usage.cap > 0 && (
        <p className="tabular mt-3 text-meta text-muted">
          {check.usage.today} of {check.usage.cap} photo checks today.
        </p>
      )}
    </div>
  )
}

function SectionRow({ label, section }: { label: string; section: VisionSection }) {
  const flags = section.flags.filter(Boolean)
  return (
    <div>
      <dt className="text-meta font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-meta text-ink">
        {flags.length ? flags.join(' · ') : 'No flag named.'}
        {section.notes ? ` — ${section.notes}` : ''}
      </dd>
    </div>
  )
}
