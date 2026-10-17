import { useEffect, useId, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { GhostButton, PrimaryButton } from '../components/Buttons'
import { BackBar, Screen } from '../components/Screen'
import { parseMoney } from '../lib/boughtBook'
import { getHoldings, patchHolding, postHolding } from '../lib/holdingsClient'
import { bookFromHoldings } from '../lib/loadBought'
import type { ValuedCopy } from '../lib/boughtBook'
import { todayIso } from '../lib/format'

const field =
  'mt-1.5 block h-11 w-full rounded-xl border border-line bg-paper/60 px-3.5 text-body text-ink placeholder:text-muted/70 focus:border-ink focus:bg-surface focus:outline-none'
const label = 'block text-meta font-medium text-muted'

function moneyOrNull(raw: string): number | null {
  if (!raw.trim()) return null
  const n = parseMoney(raw)
  return n != null && n >= 0 ? n : null
}

function signedOrNull(raw: string): number | null {
  if (!raw.trim()) return null
  return parseMoney(raw)
}

export function HoldingFormScreen({ mode }: { mode: 'add' | 'edit' | 'sold' }) {
  const { rowId = '' } = useParams()
  const navigate = useNavigate()
  const ids = useId()
  const [revision, setRevision] = useState<number | null>(null)
  const [copy, setCopy] = useState<ValuedCopy | null>(null)
  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [card, setCard] = useState('')
  const [code, setCode] = useState('')
  const [grade, setGrade] = useState('Raw')
  const [date, setDate] = useState(todayIso())
  const [where, setWhere] = useState('')
  const [paid, setPaid] = useState('')
  const [gst, setGst] = useState('')
  const [forwarding, setForwarding] = useState('')
  const [allIn, setAllIn] = useState('')
  const [market, setMarket] = useState('')
  const [marketSource, setMarketSource] = useState('')
  const [marketAsOf, setMarketAsOf] = useState('')
  const [notes, setNotes] = useState('')
  const [link, setLink] = useState('')
  const [status, setStatus] = useState<'Held' | 'Listed'>('Held')

  const [soldDate, setSoldDate] = useState(todayIso())
  const [soldPrice, setSoldPrice] = useState('')
  const [currency, setCurrency] = useState('SGD')
  const [saleFx, setSaleFx] = useState('')
  const [channel, setChannel] = useState('')
  const [fees, setFees] = useState('')
  const [shipping, setShipping] = useState('')
  const [net, setNet] = useState('')
  const [realized, setRealized] = useState('')

  useEffect(() => {
    const ac = new AbortController()
    getHoldings(ac.signal)
      .then((res) => {
        if (!res.ok || !res.data) {
          setReady(true)
          return
        }
        setRevision(res.data.revision)
        if (mode === 'add') {
          setReady(true)
          return
        }
        const book = bookFromHoldings(res.data.copies, todayIso(), res.data.revision)
        const found = book.copies.find((c) => c.rowId === rowId) ?? null
        setCopy(found)
        setMissing(!found)
        if (found) {
          setCard(found.cardName)
          setCode(found.code)
          setGrade(found.gradeText)
          setDate(found.date ?? '')
          setWhere(found.seller)
          setPaid(found.paidSgd == null ? '' : String(found.paidSgd))
          setGst(found.gstSgd == null ? '' : String(found.gstSgd))
          setForwarding(found.forwardingSgd == null ? '' : String(found.forwardingSgd))
          setAllIn(found.allInSgd == null ? '' : String(found.allInSgd))
          setMarket(found.manualMarketSgd == null ? '' : String(found.manualMarketSgd))
          setMarketSource(found.manualSource)
          setMarketAsOf(found.manualAsOf ?? '')
          setNotes(found.notes)
          setLink(found.priceChartingUrl ?? '')
          if (found.status === 'listed') setStatus('Listed')
          setSoldDate(found.soldDate ?? todayIso())
          setSoldPrice(found.soldPrice == null ? '' : String(found.soldPrice))
          setCurrency(found.soldCurrency || 'SGD')
          setSaleFx(found.saleFx == null ? '' : String(found.saleFx))
          setChannel(found.channel)
          setFees(found.feesSgd == null ? '' : String(found.feesSgd))
          setShipping(found.shippingOutSgd == null ? '' : String(found.shippingOutSgd))
          setNet(found.netSgd == null ? '' : String(found.netSgd))
          setRealized(found.realizedSgd == null ? '' : String(found.realizedSgd))
        }
        setReady(true)
      })
      .catch(() => setReady(true))
    return () => ac.abort()
  }, [mode, rowId])

  const title = mode === 'add' ? 'Add a copy' : mode === 'sold' ? 'Mark sold' : 'Edit copy'
  const paidN = moneyOrNull(paid)
  const gstN = moneyOrNull(gst)
  const fwdN = moneyOrNull(forwarding)
  const summed = [paidN, gstN, fwdN].filter((n): n is number => n != null).reduce((a, b) => a + b, 0)
  const hasPart = paidN != null || gstN != null || fwdN != null
  const allInN = allIn.trim() ? moneyOrNull(allIn) : hasPart ? Math.round(summed * 100) / 100 : null

  const save = async () => {
    if (revision == null) {
      setError('Sign in to save a copy.')
      return
    }
    setSaving(true)
    setError(null)
    if (mode === 'sold') {
      const res = await postHolding(`/holdings/${encodeURIComponent(rowId)}/sold`, {
        revision,
        soldDate: soldDate || null,
        soldPrice: moneyOrNull(soldPrice),
        currency,
        saleFx: currency === 'SGD' ? null : moneyOrNull(saleFx),
        channel,
        feesSgd: moneyOrNull(fees),
        shippingOutSgd: moneyOrNull(shipping),
        netSgd: signedOrNull(net),
        realizedSgd: signedOrNull(realized),
      })
      setSaving(false)
      if (!res.ok) {
        setError(res.error === 'revision_conflict' ? 'This copy changed. Go back and try again.' : 'Could not save the sale.')
        return
      }
      navigate('/portfolio')
      return
    }
    if (!card.trim() && !code.trim()) {
      setSaving(false)
      setError('Add a card name or a code.')
      return
    }
    const body = {
      revision,
      card: card.trim(),
      code: code.trim(),
      grade: grade.trim(),
      date: date || null,
      where: where.trim(),
      paidSgd: paidN,
      gstSgd: gstN,
      forwardingSgd: fwdN,
      allInSgd: allInN,
      marketValueSgd: moneyOrNull(market),
      marketSource: marketSource.trim(),
      marketAsOf: marketAsOf || null,
      notes: notes.trim(),
      priceChartingUrl: link.trim() || null,
      ...(mode === 'add' || copy?.status !== 'sold' ? { status } : {}),
    }
    const res = mode === 'add' ? await postHolding('/holdings', body) : await patchHolding(rowId, body)
    setSaving(false)
    if (!res.ok) {
      if (res.error === 'bad_url') setError('The PriceCharting link needs to start with http.')
      else if (res.error === 'revision_conflict') setError('This copy changed. Go back and try again.')
      else setError('Could not save.')
      return
    }
    navigate('/portfolio')
  }

  return (
    <Screen>
      <BackBar title={title} subline={copy ? `${copy.cardName || copy.code} · ${copy.rowId}` : undefined} fallbackTo="/portfolio" />
      {!ready ? (
        <p className="text-body text-muted">Loading…</p>
      ) : missing ? (
        <p className="text-body text-ink">That copy is not in your book.</p>
      ) : mode === 'sold' ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <p className="text-meta text-muted">Net and realized stay blank until you fill them. A blank net is the price, in S$, minus fees and shipping.</p>
          <div>
            <label htmlFor={`${ids}-sold-date`} className={label}>Sold date</label>
            <input id={`${ids}-sold-date`} type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <label htmlFor={`${ids}-price`} className={label}>Sold price</label>
            <input id={`${ids}-price`} inputMode="decimal" value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <p className={label}>Currency</p>
            <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="Currency">
              {['SGD', 'USD'].map((c) => (
                <button key={c} type="button" role="radio" aria-checked={currency === c} onClick={() => setCurrency(c)} className={`h-11 rounded-xl px-4 text-[14px] font-medium ${currency === c ? 'bg-ink text-paper' : 'border border-line text-ink'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          {currency !== 'SGD' && (
            <div>
              <label htmlFor={`${ids}-fx`} className={label}>Sale FX to SGD</label>
              <input id={`${ids}-fx`} inputMode="decimal" value={saleFx} onChange={(e) => setSaleFx(e.target.value)} className={`tabular ${field}`} />
            </div>
          )}
          <div>
            <label htmlFor={`${ids}-channel`} className={label}>Channel</label>
            <input id={`${ids}-channel`} value={channel} onChange={(e) => setChannel(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor={`${ids}-fees`} className={label}>Fees SGD</label>
            <input id={`${ids}-fees`} inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <label htmlFor={`${ids}-ship`} className={label}>Shipping out SGD</label>
            <input id={`${ids}-ship`} inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <label htmlFor={`${ids}-net`} className={label}>Net SGD <span className="font-normal">(optional)</span></label>
            <input id={`${ids}-net`} inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <label htmlFor={`${ids}-pl`} className={label}>Realized P/L SGD <span className="font-normal">(optional)</span></label>
            <input id={`${ids}-pl`} inputMode="decimal" value={realized} onChange={(e) => setRealized(e.target.value)} className={`tabular ${field}`} />
          </div>
          {error && <p role="alert" className="text-meta text-bad">{error}</p>}
          <div className="flex gap-3 pt-2">
            <PrimaryButton type="submit" disabled={saving}>Save sale</PrimaryButton>
            <GhostButton onClick={() => navigate('/portfolio')}>Cancel</GhostButton>
          </div>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <div>
            <label htmlFor={`${ids}-card`} className={label}>Card</label>
            <input id={`${ids}-card`} value={card} onChange={(e) => setCard(e.target.value)} className={field} autoComplete="off" />
          </div>
          <div>
            <label htmlFor={`${ids}-code`} className={label}>Code</label>
            <input id={`${ids}-code`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ST01-007" className={`tabular ${field}`} autoComplete="off" />
          </div>
          <div>
            <label htmlFor={`${ids}-grade`} className={label}>Grade / raw</label>
            <input id={`${ids}-grade`} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Raw or PSA 10" className={field} autoComplete="off" />
          </div>
          <div>
            <label htmlFor={`${ids}-date`} className={label}>Date</label>
            <input id={`${ids}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <label htmlFor={`${ids}-where`} className={label}>Where / seller</label>
            <input id={`${ids}-where`} value={where} onChange={(e) => setWhere(e.target.value)} className={field} autoComplete="off" />
          </div>
          <div>
            <label htmlFor={`${ids}-paid`} className={label}>Paid SGD</label>
            <input id={`${ids}-paid`} inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <label htmlFor={`${ids}-gst`} className={label}>GST SGD</label>
            <input id={`${ids}-gst`} inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <label htmlFor={`${ids}-fwd`} className={label}>Forwarding SGD</label>
            <input id={`${ids}-fwd`} inputMode="decimal" value={forwarding} onChange={(e) => setForwarding(e.target.value)} className={`tabular ${field}`} />
          </div>
          <div>
            <label htmlFor={`${ids}-all`} className={label}>All-in SGD</label>
            <input id={`${ids}-all`} inputMode="decimal" value={allIn} onChange={(e) => setAllIn(e.target.value)} placeholder={hasPart ? String(Math.round(summed * 100) / 100) : ''} className={`tabular ${field}`} />
            <p className="mt-1 text-meta text-muted">Leave this blank to use paid + GST + forwarding.</p>
          </div>
          <div>
            <label htmlFor={`${ids}-mkt`} className={label}>Manual market value SGD</label>
            <input id={`${ids}-mkt`} inputMode="decimal" value={market} onChange={(e) => setMarket(e.target.value)} className={`tabular ${field}`} />
            <p className="mt-1 text-meta text-muted">Your own figure. Used only when Piecebook has no English price for this print and grade. Nothing is fetched.</p>
          </div>
          <div>
            <label htmlFor={`${ids}-src`} className={label}>Market source</label>
            <input id={`${ids}-src`} value={marketSource} onChange={(e) => setMarketSource(e.target.value)} placeholder="Cards" className={field} autoComplete="off" />
          </div>
          <div>
            <label htmlFor={`${ids}-masof`} className={label}>Market date</label>
            <input id={`${ids}-masof`} type="date" value={marketAsOf} onChange={(e) => setMarketAsOf(e.target.value)} className={`tabular ${field}`} />
            <p className="mt-1 text-meta text-muted">No date is shown as undated and stale.</p>
          </div>
          <div>
            <label htmlFor={`${ids}-notes`} className={label}>Notes</label>
            <input id={`${ids}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} autoComplete="off" />
          </div>
          <div>
            <label htmlFor={`${ids}-link`} className={label}>PriceCharting link <span className="font-normal">(optional)</span></label>
            <input id={`${ids}-link`} inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className={field} autoComplete="off" />
          </div>
          {copy?.status === 'sold' ? (
            <p className="text-meta text-muted">
              This copy is sold.{' '}
              <Link to={`/portfolio/${encodeURIComponent(rowId)}/sold`} className="text-ink underline decoration-line underline-offset-2">Edit the sale</Link>
            </p>
          ) : (
            <div>
              <p className={label}>Status</p>
              <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="Status">
                {(['Held', 'Listed'] as const).map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={`h-11 rounded-xl px-4 text-[14px] font-medium ${status === s ? 'bg-ink text-paper' : 'border border-line text-ink'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-meta text-bad">{error}</p>}
          <div className="flex gap-3 pt-2">
            <PrimaryButton type="submit" disabled={saving}>{mode === 'add' ? 'Save copy' : 'Save changes'}</PrimaryButton>
            <GhostButton onClick={() => navigate('/portfolio')}>Cancel</GhostButton>
          </div>
        </form>
      )}
    </Screen>
  )
}
