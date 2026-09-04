import { useParams } from 'react-router-dom'
import { getCard, type Card } from '../data/seed'
import { useCollection } from '../store/collection'
import { BackBar, BLEED, Screen } from '../components/Screen'
import { CardArt } from '../components/CardArt'
import { RarityChip } from '../components/RarityChip'
import { CheckIcon } from '../components/CardCell'
import { DangerGhostButton, PrimaryButton } from '../components/Buttons'
import { formatDate, formatUsd } from '../lib/format'
import { NotFoundScreen } from './NotFound'

export function CardDetailScreen() {
  const { cardNumber } = useParams()
  const card = getCard(cardNumber ? decodeURIComponent(cardNumber) : undefined)
  if (!card) return <NotFoundScreen message="That card isn’t in the seed." />
  return <CardDetail key={card.cardNumber} card={card} />
}

/**
 * Thin Own: the only user action here is the owned flag (with a quiet qty
 * stepper once owned). No cost, date or note entry in V1.
 */
function CardDetail({ card }: { card: Card }) {
  const { isOwned, ownedQty, markOwned, removeOwned, setQty } = useCollection()
  const owned = isOwned(card.cardNumber)
  const qty = ownedQty(card.cardNumber)

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

          {owned ? (
            <section className="mt-6 rounded-2xl border border-line bg-surface px-5 py-4" aria-label="Ownership">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white">
                    <CheckIcon />
                  </span>
                  <p className="text-body font-semibold text-ink">Owned</p>
                </div>
                <QtyStepper value={qty} onChange={(n) => setQty(card.cardNumber, n)} />
              </div>
              <DangerGhostButton className="mt-4" onClick={() => removeOwned(card.cardNumber)}>
                Remove from collection
              </DangerGhostButton>
            </section>
          ) : (
            <div
              className={`sticky z-10 mt-8 bg-gradient-to-t from-paper via-paper/95 to-paper/0 pb-2 pt-6 ${BLEED} desktop:static desktop:mx-0 desktop:bg-none desktop:px-0 desktop:pb-0 desktop:pt-0`}
              style={{ bottom: 'calc(var(--tabbar-h) + var(--safe-bottom))' }}
            >
              <PrimaryButton onClick={() => markOwned(card.cardNumber)}>Mark owned</PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </Screen>
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
