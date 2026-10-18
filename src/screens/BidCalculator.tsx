import { useEffect, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'
import { allIn, maxHammer, PREMIUM_PRESETS, watchBidTarget, type AllInResult, type PremiumPresetId } from '../lib/allIn'
import { parseMoney } from '../lib/boughtBook'
import { formatDate, formatSgd, formatUsd, todayIso } from '../lib/format'
import { getWatchlist } from '../lib/watchlistClient'
import type { ValuedWatchItem } from '../lib/watchlist'

const field =
  'mt-1.5 block h-11 w-full rounded-xl border border-line bg-paper/60 px-3.5 text-body text-ink placeholder:text-muted/70 focus:border-ink focus:bg-surface focus:outline-none'
const label = 'block text-meta font-medium text-muted'
const CURRENCIES = ['USD', 'SGD', 'EUR', 'GBP', 'JPY']

type Mode = 'all-in' | 'max'
type Money = number | 'blank' | 'bad'

function moneyOf(raw: string): Money {
  if (!raw.trim()) return 'blank'
  const n = parseMoney(raw)
  if (n == null || n < 0) return 'bad'
  return n
}

function amount(value: Money, blank: number): number | null {
  if (value === 'bad') return null
  if (value === 'blank') return blank
  return value
}

function formatForeign(amount: number, currency: string): string {
  if (currency === 'SGD') return formatSgd(amount)
  if (currency === 'USD') return formatUsd(amount)
  return `${currency} ${amount.toFixed(2)}`
}

function rateText(fx: number): string {
  const digits = fx.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  return digits
}

/**
 * All-in from a hammer, or the max hammer under a target all-in.
 * The rate is typed. A watch row can prefill the target.
 */
export function BidCalculator() {
  const ids = useId()
  const [params] = useSearchParams()
  const itemId = params.get('item')?.trim() || ''
  const [mode, setMode] = useState<Mode>(itemId ? 'max' : 'all-in')
  const [preset, setPreset] = useState<PremiumPresetId | 'custom'>('ebay')
  const [customPercent, setCustomPercent] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [hammer, setHammer] = useState('')
  const [shipping, setShipping] = useState('')
  const [forwarder, setForwarder] = useState('')
  const [fx, setFx] = useState('')
  const [fxDate, setFxDate] = useState('')
  const [gst, setGst] = useState(true)
  const [target, setTarget] = useState('')
  const [linked, setLinked] = useState<ValuedWatchItem | null>(null)
  const [linkNote, setLinkNote] = useState<string | null>(itemId ? 'Loading the watch row…' : null)

  useEffect(() => {
    if (!itemId) return
    const ac = new AbortController()
    getWatchlist(ac.signal)
      .then((res) => {
        if (!res.ok || !res.data) {
          setLinkNote('Sign in to use a watch row.')
          return
        }
        const found = res.data.items.find((item) => item.id === itemId) ?? null
        if (!found) {
          setLinkNote('That watch row is not in this book.')
          return
        }
        setLinked(found)
        const bid = watchBidTarget(
          {
            targetSgd: found.targetSgd,
            marketSgd: found.marketSgd ?? null,
            marketSource: found.marketSource ?? null,
            marketAsOf: found.marketAsOf ?? null,
          },
          todayIso(),
        )
        if (!bid) {
          setLinkNote(`${found.code} · ${found.grade}. No target or manual English price.`)
          return
        }
        setTarget((current) => (current.trim() ? current : String(bid.targetSgd)))
        setLinkNote(null)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setLinkNote('Sign in to use a watch row.')
      })
    return () => ac.abort()
  }, [itemId])

  const premiumPercent = preset === 'custom' ? moneyOf(customPercent) : PREMIUM_PRESETS.find((item) => item.id === preset)!.percent
  const shippingN = amount(moneyOf(shipping), 0)
  const forwarderN = amount(moneyOf(forwarder), 0)
  const targetN = moneyOf(target)
  const fxN = currency === 'SGD' ? 1 : moneyOf(fx)
  const fxReady = currency === 'SGD' || (typeof fxN === 'number' && fxN > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fxDate))
  const percentReady = typeof premiumPercent === 'number'
  const badField = premiumPercent === 'bad' || shippingN == null || forwarderN == null || fxN === 'bad'
  const shared =
    percentReady && shippingN != null && forwarderN != null && typeof fxN === 'number' && fxReady
      ? {
          currency,
          premiumPercent,
          sellerShipping: shippingN,
          forwarderSgd: forwarderN,
          fx: fxN,
          gst,
        }
      : null

  let result: AllInResult | null = null
  let blocked: string | null = null
  if (badField) blocked = 'Use a number that is zero or more.'
  else if (currency !== 'SGD' && fxN === 'blank') blocked = null
  else if (currency !== 'SGD' && typeof fxN === 'number' && !fxDate) blocked = 'Add the day you read the rate.'
  else if (shared && mode === 'all-in') {
    const hammerN = moneyOf(hammer)
    if (hammerN === 'bad') blocked = 'Use a number that is zero or more.'
    else if (hammerN !== 'blank') result = allIn({ ...shared, hammer: hammerN })
  } else if (shared && mode === 'max') {
    if (targetN === 'bad') blocked = 'Use a number that is zero or more.'
    else if (targetN !== 'blank') {
      result = maxHammer({ ...shared, targetSgd: targetN })
      if (!result) blocked = 'Shipping and the forwarder already pass that all-in.'
    }
  }

  const bid = linked
    ? watchBidTarget(
        {
          targetSgd: linked.targetSgd,
          marketSgd: linked.marketSgd ?? null,
          marketSource: linked.marketSource ?? null,
          marketAsOf: linked.marketAsOf ?? null,
        },
        todayIso(),
      )
    : null

  return (
    <Screen>
      <BackBar
        title="All-in"
        subline="Landed cost in S$"
        fallbackTo={itemId ? '/watchlist' : '/portfolio'}
      />

      {itemId && linked && (
        <p className="mb-4 text-meta text-ink">
          <Link to={`/watchlist/${encodeURIComponent(linked.id)}`} className="font-medium underline decoration-line underline-offset-2">
            {linked.code} · {linked.grade}
          </Link>
          {bid?.from === 'target' ? ` · Target ${formatSgd(bid.targetSgd)}` : ''}
          {bid?.from === 'market' && bid.marketSgd != null ? ` · 0.9 × ${formatSgd(bid.marketSgd)}` : ''}
        </p>
      )}
      {bid?.marketSgd != null && (
        <p className="mb-4 text-meta text-muted">
          {bid.source}
          {bid.asOf ? ` · ${formatDate(bid.asOf)}` : ''}
          {bid.stale ? ' · Stale, older than 7 days' : ''}
        </p>
      )}
      {linkNote && <p className="mb-4 text-meta text-ink">{linkNote}</p>}

      <div className="mb-4 flex gap-2" role="radiogroup" aria-label="Calculator">
        {(
          [
            ['all-in', 'All-in'],
            ['max', 'Max bid'],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            onClick={() => setMode(id)}
            className={`h-11 rounded-xl px-3 text-[14px] font-medium ${mode === id ? 'bg-ink text-paper' : 'border border-line text-ink'}`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {mode === 'all-in' ? (
          <div>
            <label htmlFor={`${ids}-hammer`} className={label}>
              Hammer
            </label>
            <input id={`${ids}-hammer`} inputMode="decimal" value={hammer} onChange={(e) => setHammer(e.target.value)} className={`tabular ${field}`} />
          </div>
        ) : (
          <div>
            <label htmlFor={`${ids}-target`} className={label}>
              Target all-in SGD
            </label>
            <input id={`${ids}-target`} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={`tabular ${field}`} />
          </div>
        )}

        <div>
          <label htmlFor={`${ids}-currency`} className={label}>
            Currency
          </label>
          <select id={`${ids}-currency`} value={currency} onChange={(e) => setCurrency(e.target.value)} className={`tabular ${field}`}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className={label}>Buyer&apos;s premium</p>
          <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Buyer's premium">
            {PREMIUM_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={preset === item.id}
                onClick={() => setPreset(item.id)}
                className={`h-11 rounded-xl px-3 text-[14px] font-medium ${preset === item.id ? 'bg-ink text-paper' : 'border border-line text-ink'}`}
              >
                {item.label} {item.percent}%
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={preset === 'custom'}
              onClick={() => setPreset('custom')}
              className={`h-11 rounded-xl px-3 text-[14px] font-medium ${preset === 'custom' ? 'bg-ink text-paper' : 'border border-line text-ink'}`}
            >
              Custom
            </button>
          </div>
          {preset === 'custom' && (
            <input
              aria-label="Custom premium percent"
              inputMode="decimal"
              value={customPercent}
              onChange={(e) => setCustomPercent(e.target.value)}
              className={`tabular ${field}`}
            />
          )}
        </div>

        <div>
          <label htmlFor={`${ids}-shipping`} className={label}>
            Seller shipping, same currency
          </label>
          <input id={`${ids}-shipping`} inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} className={`tabular ${field}`} />
        </div>
        <div>
          <label htmlFor={`${ids}-forwarder`} className={label}>
            Forwarder fee SGD
          </label>
          <input id={`${ids}-forwarder`} inputMode="decimal" value={forwarder} onChange={(e) => setForwarder(e.target.value)} placeholder="Portland" className={`tabular ${field}`} />
        </div>
        {currency !== 'SGD' && (
          <>
            <div>
              <label htmlFor={`${ids}-fx`} className={label}>
                S$ per 1 {currency}
              </label>
              <input id={`${ids}-fx`} inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} className={`tabular ${field}`} />
              <p className="mt-1 text-meta text-muted">You type this. Piecebook does not look up a rate.</p>
            </div>
            <div>
              <label htmlFor={`${ids}-fx-date`} className={label}>
                Rate date
              </label>
              <input id={`${ids}-fx-date`} type="date" value={fxDate} onChange={(e) => setFxDate(e.target.value)} className={`tabular ${field}`} />
            </div>
          </>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={gst}
          onClick={() => setGst((on) => !on)}
          className={`inline-flex h-11 items-center rounded-xl px-3 text-[14px] font-medium ${gst ? 'bg-ink text-paper' : 'border border-line text-ink'}`}
        >
          GST 9% {gst ? 'on' : 'off'}
        </button>
      </div>

      {blocked && <p className="mt-4 text-meta text-ink">{blocked}</p>}
      {result && (
        <section className="mt-6 rounded-2xl border border-line bg-surface px-4 py-4" aria-live="polite">
          <p className="text-meta text-muted">{mode === 'max' ? 'Max hammer' : 'All-in'}</p>
          <p className="tabular text-[28px] font-semibold leading-8 text-ink">
            {mode === 'max' ? formatForeign(result.hammer, result.currency) : formatSgd(result.allInSgd)}
          </p>
          {mode === 'max' && (
            <p className="tabular mt-1 text-meta text-ink">
              All-in {formatSgd(result.allInSgd)}
              {typeof targetN === 'number' ? ` · target ${formatSgd(targetN)}` : ''}
            </p>
          )}
          <ul className="mt-4 space-y-2">
            <Line label="Hammer" value={formatForeign(result.hammer, result.currency)} />
            <Line label={`Buyer's premium ${trimPercent(result.premiumPercent)}%`} value={formatForeign(result.premium, result.currency)} />
            <Line label="Seller shipping" value={formatForeign(result.sellerShipping, result.currency)} />
            <Line label="Auction invoice" value={formatForeign(result.invoice, result.currency)} />
            {result.currency !== 'SGD' && (
              <Line label={`1 ${result.currency} = S$${rateText(result.fx)}${fxDate ? ` · ${formatDate(fxDate)}` : ''}`} value={formatSgd(result.paidSgd)} />
            )}
            <Line label="Forwarder" value={formatSgd(result.forwarderSgd)} />
            <Line label={result.gstOn ? 'GST 9%' : 'GST off'} value={formatSgd(result.gstSgd)} />
            <Line label="All-in" value={formatSgd(result.allInSgd)} />
          </ul>
        </section>
      )}
    </Screen>
  )
}

function trimPercent(percent: number): string {
  return String(roundPercent(percent))
}

function roundPercent(percent: number): number {
  return Math.round(percent * 1000) / 1000
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-meta">
      <span className="min-w-0 text-muted">{label}</span>
      <span className="tabular shrink-0 text-ink">{value}</span>
    </li>
  )
}
