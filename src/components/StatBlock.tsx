interface Props {
  label: string
  value: string
  tone?: 'ink' | 'good' | 'bad'
}

export function StatBlock({ label, value, tone = 'ink' }: Props) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink'
  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-5">
      <p className="text-meta font-medium text-muted">{label}</p>
      <p className={`tabular mt-1 text-[32px] font-semibold leading-[38px] tracking-[-0.02em] ${color}`}>{value}</p>
    </div>
  )
}
