interface Props {
  label: string
  /** One figure, or two stacked lines (e.g. SGD and USD costs that must not be summed). */
  value: string | string[]
  tone?: 'ink' | 'good' | 'bad'
  /** Quiet one-liner under the figure, e.g. why a value is "—". */
  subline?: string
}

export function StatBlock({ label, value, tone = 'ink', subline }: Props) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink'
  const lines = Array.isArray(value) ? value : [value]
  const size = lines.length > 1 ? 'text-[24px] leading-[30px]' : 'text-[32px] leading-[38px]'
  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-5">
      <p className="text-meta font-medium text-muted">{label}</p>
      <div className="mt-1">
        {lines.map((line, i) => (
          <p key={`${line}-${i}`} className={`tabular font-semibold tracking-[-0.02em] ${size} ${color}`}>
            {line}
          </p>
        ))}
      </div>
      {subline && <p className="mt-2 text-meta text-muted">{subline}</p>}
    </div>
  )
}
