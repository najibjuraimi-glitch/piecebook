import { useId, useState } from 'react'
import { COST_CURRENCIES, type CostBasis, type CostCurrency } from '../store/collection'
import { formatDate, formatMoney, todayIso } from '../lib/format'
import { DangerGhostButton, GhostButton, PrimaryButton } from './Buttons'

interface Props {
  cost: CostBasis | undefined
  onSave: (cost: CostBasis) => void
  onClear: () => void
}

type Mode = 'view' | 'edit' | 'confirm-clear'

/**
 * Cost basis block under Own on card detail. Only rendered while the card is
 * owned. Three states: no cost (ghost Add cost basis), inline form (the only
 * accent on the screen is Save cost), saved summary (ghost Edit / Clear with an
 * inline Clear cost? confirm). Amounts stay in the currency they were paid in.
 */
export function CostBasisPanel({ cost, onSave, onClear }: Props) {
  const [mode, setMode] = useState<Mode>('view')

  if (mode === 'edit') {
    return (
      <section className="mt-4 rounded-2xl border border-line bg-surface px-5 py-4" aria-label="Cost basis">
        <CostForm
          initial={cost}
          onSave={(c) => {
            onSave(c)
            setMode('view')
          }}
          onCancel={() => setMode('view')}
        />
      </section>
    )
  }

  if (!cost) {
    return (
      <section className="mt-4" aria-label="Cost basis">
        <GhostButton onClick={() => setMode('edit')}>Add cost basis</GhostButton>
      </section>
    )
  }

  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface px-5 py-4" aria-label="Cost basis">
      <p className="text-meta font-medium text-muted">Cost basis</p>
      <p className="tabular mt-1 text-[24px] font-semibold leading-[30px] tracking-[-0.01em] text-ink">
        {formatMoney(cost.amount, cost.currency)}
      </p>
      <p className="tabular mt-1 text-meta text-muted">
        Paid {formatDate(cost.paidOn)}
        {cost.note ? ` · ${cost.note}` : null}
      </p>

      {mode === 'confirm-clear' ? (
        <div className="mt-4 border-t border-line pt-4" role="group" aria-label="Clear cost?">
          <p className="text-body font-medium text-ink">Clear cost?</p>
          <div className="mt-3 flex gap-3">
            <DangerGhostButton
              onClick={() => {
                onClear()
                setMode('view')
              }}
            >
              Clear
            </DangerGhostButton>
            <GhostButton onClick={() => setMode('view')}>Cancel</GhostButton>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-3">
          <GhostButton onClick={() => setMode('edit')}>Edit cost</GhostButton>
          <GhostButton onClick={() => setMode('confirm-clear')}>Clear cost</GhostButton>
        </div>
      )}
    </section>
  )
}

interface FormProps {
  initial: CostBasis | undefined
  onSave: (cost: CostBasis) => void
  onCancel: () => void
}

const AMOUNT_RE = /^\d+(\.\d{0,2})?$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseAmount(raw: string): number | null {
  const s = raw.replace(/,/g, '').trim()
  if (!AMOUNT_RE.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

const field =
  'block h-11 w-full rounded-xl border border-line bg-paper/60 px-3.5 text-body text-ink placeholder:text-muted/70 focus:border-ink focus:bg-surface focus:outline-none'
const label = 'block text-meta font-medium text-muted'

function CostForm({ initial, onSave, onCancel }: FormProps) {
  const ids = { amount: useId(), date: useId(), note: useId() }
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [currency, setCurrency] = useState<CostCurrency>(initial?.currency ?? 'SGD')
  const [paidOn, setPaidOn] = useState(initial?.paidOn ?? todayIso())
  const [note, setNote] = useState(initial?.note ?? '')

  const parsed = parseAmount(amount)
  const valid = parsed !== null && ISO_DATE_RE.test(paidOn)

  const submit = () => {
    if (!valid || parsed === null) return
    const trimmed = note.trim()
    onSave({ amount: parsed, currency, paidOn, ...(trimmed ? { note: trimmed } : {}) })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      noValidate
    >
      <p className="text-meta font-medium text-muted">{initial ? 'Edit cost' : 'Add cost basis'}</p>

      <div className="mt-3 grid grid-cols-1 gap-4 tablet:grid-cols-2">
        <div>
          <label htmlFor={ids.amount} className={label}>
            Amount paid
          </label>
          <div className="mt-1.5 flex items-stretch gap-2">
            <input
              id={ids.amount}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`tabular min-w-0 flex-1 ${field}`}
              aria-invalid={amount !== '' && parsed === null}
              autoFocus
            />
            <CurrencyChips value={currency} onChange={setCurrency} />
          </div>
        </div>

        <div>
          <label htmlFor={ids.date} className={label}>
            Date
          </label>
          <input
            id={ids.date}
            type="date"
            value={paidOn}
            max={todayIso()}
            onChange={(e) => setPaidOn(e.target.value)}
            className={`tabular mt-1.5 ${field}`}
          />
        </div>

        <div className="tablet:col-span-2">
          <label htmlFor={ids.note} className={label}>
            Note <span className="font-normal">(optional)</span>
          </label>
          <input
            id={ids.note}
            type="text"
            autoComplete="off"
            maxLength={120}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`mt-1.5 ${field}`}
          />
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <PrimaryButton type="submit" disabled={!valid}>
          Save cost
        </PrimaryButton>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
      </div>
    </form>
  )
}

function CurrencyChips({ value, onChange }: { value: CostCurrency; onChange: (c: CostCurrency) => void }) {
  return (
    <div role="radiogroup" aria-label="Currency" className="flex shrink-0 gap-1.5">
      {COST_CURRENCIES.map((c) => {
        const selected = c === value
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(c)}
            className={`tabular h-11 rounded-xl px-3.5 text-[14px] font-medium transition-colors duration-150 ease-out ${
              selected ? 'bg-ink text-paper' : 'border border-line bg-transparent text-ink hover:bg-white'
            }`}
          >
            {c}
          </button>
        )
      })}
    </div>
  )
}
