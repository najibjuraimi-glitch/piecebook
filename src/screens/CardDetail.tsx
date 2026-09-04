import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { getCard, type Card } from '../data/seed'
import { useCollection, type CostLot } from '../store/collection'
import { BackBar, BLEED, Screen } from '../components/Screen'
import { CardArt } from '../components/CardArt'
import { RarityChip } from '../components/RarityChip'
import { CheckIcon } from '../components/CardCell'
import { DangerGhostButton, GhostButton, PrimaryButton } from '../components/Buttons'
import { formatDate, formatUsd, todayIso } from '../lib/format'
import { NotFoundScreen } from './NotFound'

export function CardDetailScreen() {
  const { cardNumber } = useParams()
  const card = getCard(cardNumber ? decodeURIComponent(cardNumber) : undefined)
  if (!card) return <NotFoundScreen message="That card isn’t in the seed." />
  return <CardDetail key={card.cardNumber} card={card} />
}

interface LotDraft {
  id?: string
  paidUsd: string
  paidOn: string
  qty: string
  note: string
}

function emptyDraft(): LotDraft {
  return { paidUsd: '', paidOn: todayIso(), qty: '1', note: '' }
}

function draftFrom(lot: CostLot): LotDraft {
  return { id: lot.id, paidUsd: lot.paidUsd.toFixed(2), paidOn: lot.paidOn, qty: String(lot.qty), note: lot.note ?? '' }
}

function CardDetail({ card }: { card: Card }) {
  const { isOwned, ownedQty, markOwned, removeOwned, setQty, lotsFor, saveLot, removeLot } = useCollection()
  const owned = isOwned(card.cardNumber)
  const qty = ownedQty(card.cardNumber)
  const lots = lotsFor(card.cardNumber)

  const [draft, setDraft] = useState<LotDraft | null>(null)
  const editing = draft !== null

  const paid = Number(draft?.paidUsd)
  const draftQty = Number(draft?.qty)
  const draftValid =
    !!draft && draft.paidUsd.trim() !== '' && Number.isFinite(paid) && paid >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.paidOn) && draftQty >= 1

  const onSave = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!draft || !draftValid) return
    saveLot({
      id: draft.id,
      cardNumber: card.cardNumber,
      qty: Math.floor(draftQty),
      paidUsd: Math.round(paid * 100) / 100,
      paidOn: draft.paidOn,
      note: draft.note,
    })
    setDraft(null)
  }

  const onRemoveLot = () => {
    if (draft?.id) removeLot(draft.id)
    setDraft(null)
  }

  const onRemoveOwned = () => {
    removeOwned(card.cardNumber)
    setDraft(null)
  }

  return (
    <Screen>
      <BackBar fallbackTo={`/sets/${encodeURIComponent(card.setCode)}`} />

      {/* Stacked on phone/tablet; from desktop up, art on the left (~40%) and meta + actions on the right. */}
      <div className="desktop:grid desktop:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] desktop:items-start desktop:gap-12">
        <div className="mx-auto w-full max-w-[340px] desktop:sticky desktop:top-6 desktop:mx-0 desktop:max-w-[480px]">
          <CardArt card={card} large eager className="shadow-paper" />
        </div>

        <div className="min-w-0">
          <section className="mt-6 desktop:mt-0">
            <h1 className="text-display text-ink">{card.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
              <span className="tabular">{card.cardNumber}</span>
              <span aria-hidden="true">·</span>
              <RarityChip rarity={card.rarity} size="md" />
              <span aria-hidden="true">·</span>
              <span>{card.language}</span>
              {card.isParallel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Parallel</span>
                </>
              )}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-line bg-surface px-5 py-4">
            <p className="text-meta font-medium text-muted">Market (seed)</p>
            {card.marketUsd === null ? (
              <p className="mt-1 text-title text-muted">No seed price</p>
            ) : (
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="tabular text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-ink">
                  {formatUsd(card.marketUsd)}
                </p>
                {card.asOf && <p className="tabular text-meta text-muted">as of {formatDate(card.asOf)}</p>}
              </div>
            )}
          </section>

          {owned && (
            <section className="mt-6 rounded-2xl border border-line bg-surface px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white">
                    <CheckIcon />
                  </span>
                  <p className="text-body font-semibold text-ink">Owned</p>
                </div>
                <QtyStepper value={qty} onChange={(n) => setQty(card.cardNumber, n)} />
              </div>
              <DangerGhostButton className="mt-4" onClick={onRemoveOwned}>
                Remove from collection
              </DangerGhostButton>
            </section>
          )}

          <section className="mt-6">
            <h2 className="px-1 text-meta font-medium uppercase tracking-[0.08em] text-muted">Cost basis</h2>

            {lots.length > 0 && !editing && (
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {lots.map((lot) => (
                  <li key={lot.id}>
                    <button
                      type="button"
                      onClick={() => setDraft(draftFrom(lot))}
                      className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
                      aria-label={`Edit cost, ${formatUsd(lot.paidUsd)} on ${formatDate(lot.paidOn)}`}
                    >
                      <div className="min-w-0">
                        <p className="tabular text-body font-semibold text-ink">
                          {formatUsd(lot.paidUsd)}
                          {lot.qty > 1 && <span className="ml-2 text-meta font-medium text-muted">×{lot.qty}</span>}
                        </p>
                        <p className="tabular truncate text-meta text-muted">
                          {formatDate(lot.paidOn)}
                          {lot.note ? ` · ${lot.note}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-meta font-medium text-muted">Edit cost</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {editing && draft ? (
              <form onSubmit={onSave} className="mt-3 space-y-4 rounded-2xl border border-line bg-surface px-5 py-5">
                <Field label="Amount paid (USD)" htmlFor="paid">
                  <input
                    id="paid"
                    inputMode="decimal"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    autoFocus
                    placeholder="0.00"
                    value={draft.paidUsd}
                    onChange={(e) => setDraft({ ...draft, paidUsd: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Date" htmlFor="date">
                  <input
                    id="date"
                    type="date"
                    required
                    max={todayIso()}
                    value={draft.paidOn}
                    onChange={(e) => setDraft({ ...draft, paidOn: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Qty" htmlFor="qty">
                  <input
                    id="qty"
                    inputMode="numeric"
                    type="number"
                    step="1"
                    min="1"
                    value={draft.qty}
                    onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Note (optional)" htmlFor="note">
                  <input
                    id="note"
                    type="text"
                    maxLength={80}
                    placeholder="e.g. Carousell, meetup, sealed lot"
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <div className="flex gap-3 pt-1">
                  <GhostButton onClick={() => setDraft(null)}>Cancel</GhostButton>
                  {draft.id && <DangerGhostButton onClick={onRemoveLot}>Remove</DangerGhostButton>}
                </div>
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
              </form>
            ) : (
              <GhostButton className="mt-3" onClick={() => setDraft(emptyDraft())}>
                Add cost basis
              </GhostButton>
            )}
          </section>

          {(editing || !owned) && (
            <div
              className={`sticky z-10 mt-8 bg-gradient-to-t from-paper via-paper/95 to-paper/0 pb-2 pt-6 ${BLEED} desktop:static desktop:mx-0 desktop:bg-none desktop:px-0 desktop:pb-0 desktop:pt-0`}
              style={{ bottom: 'calc(var(--tabbar-h) + var(--safe-bottom))' }}
            >
              {editing ? (
                <PrimaryButton onClick={() => onSave()} disabled={!draftValid}>
                  Save cost
                </PrimaryButton>
              ) : (
                <PrimaryButton onClick={() => markOwned(card.cardNumber)}>Mark owned</PrimaryButton>
              )}
            </div>
          )}
        </div>
      </div>
    </Screen>
  )
}

const inputClass =
  'tabular block h-12 w-full rounded-xl border border-line bg-paper px-3.5 text-body text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none'

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-meta font-medium text-muted">
        {label}
      </label>
      {children}
    </div>
  )
}

function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const btn =
    'flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition-colors duration-150 ease-out hover:bg-paper active:bg-[#F0ECE4] disabled:opacity-40'
  return (
    <div className="flex items-center gap-2" aria-label="Quantity">
      <span className="mr-1 text-meta text-muted">Qty</span>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Decrease quantity">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path d="M3.5 8h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <span className="tabular min-w-[1.5ch] text-center text-body font-semibold text-ink" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} aria-label="Increase quantity">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
