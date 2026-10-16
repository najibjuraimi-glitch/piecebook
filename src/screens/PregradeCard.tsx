import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getCard } from '../data/seed'
import { getRosterSet } from '../data/roster'
import { PSA_FEES } from '../data/psaFees'
import { BackBar, Screen } from '../components/Screen'
import { CardArt } from '../components/CardArt'
import { GhostButton, PrimaryButton } from '../components/Buttons'
import { VisionGuess } from '../components/VisionGuess'
import { NotFoundScreen } from './NotFound'
import {
  drawCenteringOverlay,
  measureFromBorders,
  measurePhoto,
  type PhotoResult,
  type PhotoSide,
} from '../lib/centering'
import {
  NAMI_ST01_007_WORKSHEET,
  defaultMonthlyDrift,
  evaluateGradeWorth,
  photoWouldChangeTheCall,
  selectPsaFee,
  type GradeWorth,
  type PriceKind,
  type PricePoint,
} from '../lib/gradeWorth'
import { loadPhotoFile } from '../lib/photoPixels'
import { dataUrlToFile, isNonEnglishCardLanguage, type VisionCheck } from '../lib/vision'
import { peekVisionSession } from '../store/visionSession'
import { formatDate, formatUsMarketUsd, todayIso } from '../lib/format'
import { rateLine } from '../lib/fx'
import {
  getPrediction,
  savePrediction,
  submitPrediction,
  type PredictionDraft,
  type PredictionRecord,
  type StoredPhoto,
  type StoredPrice,
} from '../store/predictions'

const field =
  'block h-11 w-full rounded-xl border border-line bg-paper/60 px-3.5 text-body text-ink placeholder:text-muted/70 focus:border-ink focus:bg-surface focus:outline-none disabled:opacity-60'
const labelCls = 'block text-meta font-medium text-muted'
const VERDICT_LABEL = { go: 'Go', borderline: 'Borderline', 'no-go': 'No-go' } as const
const EXIT_LABEL = { 'vault-sell': 'eBay vault-sell', 'ship-sg': 'Ship to Singapore', keep: 'Keep' } as const

interface PriceFields {
  usd: string
  source: string
  asOf: string
  kind: PriceKind
}

const emptyPrice = (): PriceFields => ({ usd: '', source: '', asOf: '', kind: 'sold' })

export function PregradeCardScreen() {
  const { cardNumber } = useParams()
  const card = getCard(cardNumber ? decodeURIComponent(cardNumber) : undefined)
  const [params] = useSearchParams()
  if (!card) return <NotFoundScreen message="That card isn’t in the seed." />
  return <Worksheet key={`${card.cardNumber}:${params.get('p') ?? 'new'}`} cardNumber={card.cardNumber} />
}

function Worksheet({ cardNumber }: { cardNumber: string }) {
  const card = getCard(cardNumber)!
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const existing = getPrediction(params.get('p') ?? undefined)
  const locked = existing?.status === 'submitted'
  const roster = getRosterSet(card.setCode)
  const driftDefault = defaultMonthlyDrift(roster?.enReleased, todayIso())

  const session = peekVisionSession()
  const sessionMatch = session?.confirmedCardNumber === cardNumber ? session : null
  const [front, setFront] = useState<PhotoResult | null>(fromStoredPhoto(existing, 'front'))
  const [back, setBack] = useState<PhotoResult | null>(fromStoredPhoto(existing, 'back'))
  const [frontSeed, setFrontSeed] = useState<string | null>(sessionMatch?.frontDataUrl ?? null)
  const [backSeed, setBackSeed] = useState<string | null>(sessionMatch?.backDataUrl ?? null)
  const [vision, setVision] = useState<VisionCheck | null>(existing?.vision ?? sessionMatch?.check ?? null)
  const [popTens, setPopTens] = useState(existing?.pop ? String(existing.pop.tens) : '')
  const [popNines, setPopNines] = useState(existing?.pop ? String(existing.pop.nines) : '')
  const [popTotal, setPopTotal] = useState(existing?.pop ? String(existing.pop.total) : '')
  const [popSource, setPopSource] = useState(existing?.pop?.source ?? '')
  const [popAsOf, setPopAsOf] = useState(existing?.pop?.asOf ?? '')
  const [raw, setRaw] = useState<PriceFields>(priceFields(existing?.raw))
  const [v9, setV9] = useState<PriceFields>(priceFields(existing?.v9))
  const [v10, setV10] = useState<PriceFields>(priceFields(existing?.v10))
  const [v8, setV8] = useState<PriceFields>(priceFields(existing?.v8))
  const [shipPortland, setShipPortland] = useState(existing?.shipToPortlandUsd != null ? String(existing.shipToPortlandUsd) : '')
  const [shipPsa, setShipPsa] = useState(existing?.shipToPsaUsd != null ? String(existing.shipToPsaUsd) : '')
  const [buyShip, setBuyShip] = useState(existing?.buyAndShipUsd != null ? String(existing.buyAndShipUsd) : '')
  const [months, setMonths] = useState(existing?.months === 4 ? 4 : 5)
  const [savedId, setSavedId] = useState(existing?.id)
  const [notice, setNotice] = useState<string | null>(null)

  const centeringCannotBeTen = Boolean((front?.ok && front.measure.cannotBeTen) || (back?.ok && back.measure.cannotBeTen))
  const visionRuledOut = Boolean(vision?.condition.psa10_ruled_out)
  const cannotBeTen = Boolean(centeringCannotBeTen || visionRuledOut)
  const photoNote = photoWouldChangeTheCall({
    frontReject: front && !front.ok ? front.message : null,
    backReject: back && !back.ok ? back.message : null,
    frontCannotBeTen: Boolean(front?.ok && front.measure.cannotBeTen),
    backCannotBeTen: Boolean(back?.ok && back.measure.cannotBeTen),
    hasFront: Boolean(front),
    hasBack: Boolean(back),
    visionRead: Boolean(vision),
    visionRuledOut,
  })

  useEffect(() => {
    const fromConfirm = peekVisionSession()
    if (!fromConfirm || fromConfirm.confirmedCardNumber !== cardNumber) return
    if (existing?.photos.length) return
    let gone = false
    ;(async () => {
      try {
        const frontFile = dataUrlToFile(fromConfirm.frontDataUrl, 'front.jpg')
        const loadedFront = await loadPhotoFile(frontFile)
        if (gone) return
        setFront(measurePhoto(loadedFront.pixels, 'front'))
        setFrontSeed(fromConfirm.frontDataUrl)
        if (fromConfirm.backDataUrl) {
          const backFile = dataUrlToFile(fromConfirm.backDataUrl, 'back.jpg')
          const loadedBack = await loadPhotoFile(backFile)
          if (gone) return
          setBack(measurePhoto(loadedBack.pixels, 'back'))
          setBackSeed(fromConfirm.backDataUrl)
        }
        setVision(fromConfirm.check)
      } catch {
        // Leave the slots empty; the collector can upload again.
      }
    })()
    return () => {
      gone = true
    }
  }, [cardNumber, existing?.photos.length])

  const worth = useMemo(() => {
    const rawP = parsePrice(raw)
    const v9P = parsePrice(v9)
    const v10P = parsePrice(v10)
    const v8P = parsePrice(v8)
    const tens = parseCount(popTens)
    const nines = parseCount(popNines)
    const total = parseCount(popTotal)
    const portland = parseUsd(shipPortland)
    const psa = parseUsd(shipPsa)
    if (!rawP || !v9P || !v10P || tens == null || nines == null || total == null || total <= 0) return null
    if (!popSource.trim() || !isoDate(popAsOf) || portland == null || psa == null) return null
    return evaluateGradeWorth({
      raw: rawP,
      v9: v9P,
      v10: v10P,
      v8: v8P,
      pop: { tens, nines, total, source: popSource.trim(), asOf: popAsOf },
      shipToPortlandUsd: portland,
      shipToPsaUsd: psa,
      buyAndShipUsd: parseUsd(buyShip),
      months,
      monthlyDrift: existing?.monthlyDrift ?? driftDefault,
      cannotBeTen,
    })
  }, [
    raw,
    v9,
    v10,
    v8,
    popTens,
    popNines,
    popTotal,
    popSource,
    popAsOf,
    shipPortland,
    shipPsa,
    buyShip,
    months,
    cannotBeTen,
    driftDefault,
    existing?.monthlyDrift,
  ])

  const missing = useMemo(() => missingBits({ raw, v9, v10, popTens, popNines, popTotal, popSource, popAsOf, shipPortland, shipPsa }), [
    raw,
    v9,
    v10,
    popTens,
    popNines,
    popTotal,
    popSource,
    popAsOf,
    shipPortland,
    shipPsa,
  ])

  const persist = (asSubmit: boolean) => {
    if (locked) return
    const record = savePrediction(toDraft({
      id: savedId,
      card,
      front,
      back,
      cannotBeTen,
      photoNote,
      vision,
      popTens,
      popNines,
      popTotal,
      popSource,
      popAsOf,
      raw,
      v9,
      v10,
      v8,
      shipPortland,
      shipPsa,
      buyShip,
      months,
      monthlyDrift: driftDefault,
      worth,
    }))
    setSavedId(record.id)
    if (asSubmit) {
      submitPrediction(record.id)
      setNotice('Locked. Grade entry is later.')
      navigate(`/pregrade/${encodeURIComponent(card.cardNumber)}?p=${encodeURIComponent(record.id)}`, { replace: true })
    } else {
      setNotice('Draft saved on this browser.')
      navigate(`/pregrade/${encodeURIComponent(card.cardNumber)}?p=${encodeURIComponent(record.id)}`, { replace: true })
    }
  }

  const fillNami = () => {
    const w = NAMI_ST01_007_WORKSHEET
    setRaw({ usd: String(w.raw.usd), source: w.raw.source, asOf: w.raw.asOf, kind: w.raw.kind })
    setV9({ usd: String(w.v9.usd), source: w.v9.source, asOf: w.v9.asOf, kind: w.v9.kind })
    setV10({ usd: String(w.v10.usd), source: w.v10.source, asOf: w.v10.asOf, kind: w.v10.kind })
    setPopTens(String(w.pop.tens))
    setPopNines(String(w.pop.nines))
    setPopTotal(String(w.pop.total))
    setPopSource(w.pop.source)
    setPopAsOf(w.pop.asOf)
    setShipPortland(String(w.shipToPortlandUsd))
    setShipPsa(String(w.shipToPsaUsd))
    setBuyShip(String(w.buyAndShipUsd))
    setMonths(5)
    setNotice('Labelled guesses for the Nami worksheet — not solds, not a PSA pull.')
  }

  return (
    <Screen>
      <BackBar
        fallbackTo="/pregrade"
        crumbs={[
          { label: 'Sets', to: '/' },
          { label: 'Pre-grade', to: '/pregrade' },
          { label: card.cardNumber },
        ]}
      />

      <div className="flex items-start gap-4">
        <div className="w-16 shrink-0">
          <CardArt card={card} className="shadow-paper" />
        </div>
        <div className="min-w-0">
          <h1 className="text-display text-ink">{card.name}</h1>
          <p className="tabular mt-1 text-meta text-muted">
            {card.cardNumber} · {card.setCode}
            {vision ? ` · ${vision.identify.language ?? 'language not read'}` : ''}
            {card.marketUsd != null && card.asOf
              ? ` · seed ${formatUsMarketUsd(card.marketUsd)} as of ${formatDate(card.asOf)} — not a sold`
              : ' · no seed market'}
          </p>
        </div>
      </div>

      <p className="mt-5 max-w-[60ch] text-body text-ink">
        Photos can rule out a PSA 10. They never confirm one. Piecebook never buys, bids or offers.
      </p>
      {isNonEnglishCardLanguage(vision?.identify.language ?? null) && (
        <p className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3 text-body text-ink">
          Piecebook currently only has English card data and prices.
        </p>
      )}
      {locked && (
        <p className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3 text-body text-ink">
          Locked on submit. Grade entry is later.
        </p>
      )}

      {card.cardNumber === 'ST01-007' && !locked && (
        <GhostButton className="mt-4" onClick={fillNami}>
          Fill the labelled Nami worksheet
        </GhostButton>
      )}

      <Section title="Photos">
        <p className="text-meta text-muted">
          Front and back, square-on. Short side 800px or more. The whole card in the frame. Angled over ~8° is rejected.
        </p>
        <div className="mt-4 grid gap-4 tablet:grid-cols-2">
          <PhotoSlot side="front" locked={locked} result={front} onResult={setFront} seedDataUrl={frontSeed} />
          <PhotoSlot side="back" locked={locked} result={back} onResult={setBack} seedDataUrl={backSeed} />
        </div>
        {vision && (
          <div className="mt-4">
            <VisionGuess check={vision} />
          </div>
        )}
        <p className="mt-4 text-body text-ink">{photoNote}</p>
        {cannotBeTen && (
          <p className="mt-2 text-body font-medium text-bad">
            {centeringCannotBeTen
              ? 'Cannot be a 10 — centering is already over the line.'
              : 'Cannot be a 10 — the photo check found a defect that rules a 10 out.'}
          </p>
        )}
      </Section>

      <Section title="PSA population">
        <p className="text-meta text-muted">Starting 10-rate is 10s ÷ total. Type a published pop with its source and date. Nothing is pulled.</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <NumberField label="PSA 10s" value={popTens} onChange={setPopTens} locked={locked} />
          <NumberField label="PSA 9s" value={popNines} onChange={setPopNines} locked={locked} />
          <NumberField label="Total" value={popTotal} onChange={setPopTotal} locked={locked} />
        </div>
        <div className="mt-3 grid gap-3 tablet:grid-cols-2">
          <TextField label="Source" value={popSource} onChange={setPopSource} locked={locked} placeholder="Where you read the pop" />
          <DateField label="Date" value={popAsOf} onChange={setPopAsOf} locked={locked} />
        </div>
      </Section>

      <Section title="Solds you typed">
        <p className="text-meta text-muted">Every figure needs a source and a date. A guess must say it is a guess. Seed market is not a sold.</p>
        <PriceBlock title="Raw" value={raw} onChange={setRaw} locked={locked} />
        <PriceBlock title="PSA 9" value={v9} onChange={setV9} locked={locked} />
        <PriceBlock title="PSA 10" value={v10} onChange={setV10} locked={locked} />
        <PriceBlock title="PSA 8 (optional — else rest uses raw)" value={v8} onChange={setV8} locked={locked} optional />
      </Section>

      <Section title="Cost in">
        <p className="text-meta text-muted">
          Raw + ship to Portland + PSA fee + ship to PSA. Shipping stays empty until you type a figure — we do not invent one.
        </p>
        <div className="mt-3 grid gap-3 tablet:grid-cols-2">
          <NumberField label="Ship to Portland (US$)" value={shipPortland} onChange={setShipPortland} locked={locked} />
          <NumberField label="Ship to PSA (US$)" value={shipPsa} onChange={setShipPsa} locked={locked} />
          <NumberField label="Buy&Ship (US$, for the SG exit)" value={buyShip} onChange={setBuyShip} locked={locked} />
        </div>
        <p className="tabular mt-4 text-meta text-ink">
          PSA {selectFeeLine(parseUsd(v10.usd))} · last checked {formatDate(PSA_FEES.asOf)} · {PSA_FEES.sourceName}
        </p>
        <p className="mt-1 text-meta text-muted">{PSA_FEES.note}</p>
        <div className="mt-4">
          <p className={labelCls}>Turnaround</p>
          <div className="mt-1.5 flex gap-2">
            {[4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={locked}
                onClick={() => setMonths(n)}
                className={`h-11 rounded-xl px-4 text-[14px] font-medium ${
                  months === n ? 'bg-ink text-paper' : 'border border-line text-ink hover:bg-white'
                }`}
              >
                {n} months
              </button>
            ))}
          </div>
          <p className="tabular mt-2 text-meta text-muted">
            {roster?.enReleased
              ? `EN ${formatDate(roster.enReleased)} · ${driftDefault === 0 ? 'older set · 0%/mo on V9/V10' : 'new set · −2%/mo on V9/V10'}`
              : 'No EN date · treated as older (0%/mo), not a guess that it is new.'}
          </p>
        </div>
      </Section>

      <Section title="Worksheet">
        {worth ? (
          <VerdictCard worth={worth} />
        ) : (
          <p className="text-body text-muted">{missing || 'Type the pops, solds and shipping to run the numbers.'}</p>
        )}
        <p className="mt-4 text-meta text-muted">{rateLine()}</p>
      </Section>

      {notice && <p className="mt-4 text-body text-ink">{notice}</p>}

      {!locked && (
        <div className="mt-6 flex flex-col gap-3 tablet:flex-row">
          <PrimaryButton disabled={!worth} onClick={() => persist(true)}>
            Mark submitted
          </PrimaryButton>
          <GhostButton onClick={() => persist(false)}>Save draft</GhostButton>
        </div>
      )}

      {locked && (
        <p className="mt-6 text-meta text-muted">Actual grade and cert — later. This row will not take them yet.</p>
      )}
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="text-title text-ink">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function PhotoSlot({
  side,
  locked,
  result,
  onResult,
  seedDataUrl,
}: {
  side: PhotoSide
  locked: boolean
  result: PhotoResult | null
  onResult: (r: PhotoResult | null) => void
  seedDataUrl?: string | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)

  useEffect(() => {
    if (!seedDataUrl) return
    let gone = false
    let bmp: ImageBitmap | null = null
    ;(async () => {
      try {
        bmp = await createImageBitmap(dataUrlToFile(seedDataUrl, `${side}.jpg`))
        if (gone) {
          bmp.close()
          return
        }
        setBitmap(bmp)
      } catch {
        // Preview can stay empty; the measure still ran on the parent.
      }
    })()
    return () => {
      gone = true
    }
  }, [seedDataUrl, side])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bitmap || !result?.ok) return
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawCenteringOverlay(ctx, bitmap, bitmap.width, bitmap.height, result.measure)
  }, [bitmap, result])

  const onFile = async (file: File | undefined) => {
    if (!file || locked) return
    setBusy(true)
    try {
      const loaded = await loadPhotoFile(file)
      setBitmap(loaded.bitmap)
      onResult(measurePhoto(loaded.pixels, side))
    } catch {
      onResult({
        ok: false,
        side,
        code: 'no-card',
        message: `${side === 'front' ? 'Front' : 'Back'}: could not read that file.`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-meta font-medium text-muted">{side === 'front' ? 'Front' : 'Back'}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={locked}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {result?.ok && bitmap && (
        <canvas ref={canvasRef} className="mt-2 w-full rounded-xl" aria-label={`${side} centering overlay`} />
      )}
      {result && !result.ok && (
        <p className="mt-2 text-body text-bad">{result.message}</p>
      )}
      {result?.ok && (
        <p className="tabular mt-2 text-meta text-ink">
          {result.measure.lr.label} · {result.measure.tb.label}
          {result.measure.cannotBeTen ? ' · cannot be a 10' : ''}
        </p>
      )}
      {!locked && (
        <GhostButton className="mt-3" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Reading…' : result ? 'Replace photo' : 'Upload photo'}
        </GhostButton>
      )}
    </div>
  )
}

function VerdictCard({ worth }: { worth: GradeWorth }) {
  const tone = worth.verdict === 'go' ? 'text-good' : worth.verdict === 'no-go' ? 'text-bad' : 'text-ink'
  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-4">
      <p className={`text-[28px] font-semibold leading-[34px] tracking-[-0.02em] ${tone}`}>{VERDICT_LABEL[worth.verdict]}</p>
      <p className="mt-2 text-body text-ink">{worth.reason}</p>
      <dl className="mt-4 space-y-1.5 text-meta text-ink">
        <Row label="Expected value" value={`${formatUsMarketUsd(worth.evUsd)} · ${sgd(worth.evSgd)}`} />
        <Row label="Cost in" value={`${formatUsMarketUsd(worth.costInUsd)} · ${sgd(worth.costInSgd)}`} />
        <Row label="Max buy" value={`${formatUsMarketUsd(worth.maxBuyUsd)} · ${sgd(worth.maxBuySgd)}`} />
        <Row
          label="Starting 10-rate"
          value={`${pct(worth.p10Starting)} (${worth.p10Band})${worth.p10 === 0 && worth.p10Starting > 0 ? ' · photos set P(10) to 0' : ''}`}
        />
        <Row
          label="Best exit"
          value={worth.bestExit ? `${EXIT_LABEL[worth.bestExit]} · ${formatUsMarketUsd(worth.exits.find((e) => e.id === worth.bestExit)?.netUsd ?? 0)}` : '—'}
        />
      </dl>
      <ul className="mt-4 space-y-2 border-t border-line pt-3">
        {worth.exits.map((e) => (
          <li key={e.id} className="text-meta text-ink">
            <span className="font-medium">{e.label}</span>
            {e.netUsd == null ? (
              <span className="text-muted"> — {e.note}</span>
            ) : (
              <span className="tabular">
                {' '}
                {formatUsMarketUsd(e.netUsd)} · {sgd(e.netSgd ?? 0)}
                <span className="text-muted"> — {e.note}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {worth.fee.overDeclared && (
        <p className="mt-3 text-meta text-muted">Typed PSA 10 sold is over the Express declared cap. The posted tiers do not cover it.</p>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-right">{value}</dd>
    </div>
  )
}

function PriceBlock({
  title,
  value,
  onChange,
  locked,
  optional,
}: {
  title: string
  value: PriceFields
  onChange: (v: PriceFields) => void
  locked: boolean
  optional?: boolean
}) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-meta font-medium text-muted">{title}</p>
      <div className="mt-2 grid gap-3 tablet:grid-cols-2">
        <NumberField label={optional ? 'US$ (optional)' : 'US$'} value={value.usd} onChange={(usd) => onChange({ ...value, usd })} locked={locked} />
        <div>
          <p className={labelCls}>Kind</p>
          <div className="mt-1.5 flex gap-2">
            {(['sold', 'guess'] as const).map((k) => (
              <button
                key={k}
                type="button"
                disabled={locked}
                onClick={() => onChange({ ...value, kind: k })}
                className={`h-11 rounded-xl px-4 text-[14px] font-medium ${
                  value.kind === k ? 'bg-ink text-paper' : 'border border-line text-ink hover:bg-white'
                }`}
              >
                {k === 'sold' ? 'Sold' : 'Guess'}
              </button>
            ))}
          </div>
        </div>
        <TextField
          label="Source"
          value={value.source}
          onChange={(source) => onChange({ ...value, source })}
          locked={locked}
          placeholder={value.kind === 'guess' ? 'Why this is a guess' : 'Where you read the sold'}
        />
        <DateField label="Date" value={value.asOf} onChange={(asOf) => onChange({ ...value, asOf })} locked={locked} />
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  locked,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  locked: boolean
}) {
  const id = `n-${label}`
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={locked}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`tabular mt-1.5 ${field}`}
      />
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  locked,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  locked: boolean
  placeholder?: string
}) {
  const id = `t-${label}`
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        disabled={locked}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1.5 ${field}`}
      />
    </div>
  )
}

function DateField({
  label,
  value,
  onChange,
  locked,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  locked: boolean
}) {
  const id = `d-${label}`
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <input
        id={id}
        type="date"
        disabled={locked}
        value={value}
        max={todayIso()}
        onChange={(e) => onChange(e.target.value)}
        className={`tabular mt-1.5 ${field}`}
      />
    </div>
  )
}

function priceFields(p: StoredPrice | null | undefined): PriceFields {
  if (!p) return emptyPrice()
  return { usd: String(p.usd), source: p.source, asOf: p.asOf, kind: p.kind }
}

function parseUsd(raw: string): number | null {
  const n = Number(raw.replace(/,/g, '').trim())
  return raw.trim() && Number.isFinite(n) && n >= 0 ? n : null
}

function parseCount(raw: string): number | null {
  const n = Number(raw.replace(/,/g, '').trim())
  return raw.trim() && Number.isFinite(n) && n >= 0 && Number.isInteger(n) ? n : null
}

function isoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function parsePrice(p: PriceFields): PricePoint | null {
  const usd = parseUsd(p.usd)
  if (usd == null || !p.source.trim() || !isoDate(p.asOf)) return null
  return { usd, source: p.source.trim(), asOf: p.asOf, kind: p.kind }
}

function missingBits(o: {
  raw: PriceFields
  v9: PriceFields
  v10: PriceFields
  popTens: string
  popNines: string
  popTotal: string
  popSource: string
  popAsOf: string
  shipPortland: string
  shipPsa: string
}): string {
  const need: string[] = []
  if (!parsePrice(o.raw)) need.push('a raw sold with source and date')
  if (!parsePrice(o.v9)) need.push('a PSA 9 sold with source and date')
  if (!parsePrice(o.v10)) need.push('a PSA 10 sold with source and date')
  if (parseCount(o.popTotal) == null || (parseCount(o.popTotal) ?? 0) <= 0) need.push('a PSA total')
  if (parseCount(o.popTens) == null || parseCount(o.popNines) == null) need.push('PSA 10s and 9s')
  if (!o.popSource.trim() || !isoDate(o.popAsOf)) need.push('the pop source and date')
  if (parseUsd(o.shipPortland) == null || parseUsd(o.shipPsa) == null) need.push('both shipping figures')
  if (!need.length) return ''
  return `Still needs ${need.join(', ')}.`
}

function toDraft(o: {
  id?: string
  card: { cardNumber: string; name: string }
  front: PhotoResult | null
  back: PhotoResult | null
  cannotBeTen: boolean
  photoNote: string
  vision: VisionCheck | null
  popTens: string
  popNines: string
  popTotal: string
  popSource: string
  popAsOf: string
  raw: PriceFields
  v9: PriceFields
  v10: PriceFields
  v8: PriceFields
  shipPortland: string
  shipPsa: string
  buyShip: string
  months: number
  monthlyDrift: number
  worth: GradeWorth | null
}): PredictionDraft {
  const raw = parsePrice(o.raw)
  const tens = parseCount(o.popTens)
  const nines = parseCount(o.popNines)
  const total = parseCount(o.popTotal)
  return {
    id: o.id,
    cardNumber: o.card.cardNumber,
    cardName: o.card.name,
    photos: [storedPhoto(o.front), storedPhoto(o.back)].filter((p): p is StoredPhoto => p !== null),
    cannotBeTen: o.cannotBeTen,
    photoNote: o.photoNote,
    vision: o.vision,
    pop:
      tens != null && nines != null && total != null && o.popSource.trim() && isoDate(o.popAsOf)
        ? { tens, nines, total, source: o.popSource.trim(), asOf: o.popAsOf }
        : null,
    raw,
    v9: parsePrice(o.v9),
    v10: parsePrice(o.v10),
    v8: parsePrice(o.v8),
    shipToPortlandUsd: parseUsd(o.shipPortland),
    shipToPsaUsd: parseUsd(o.shipPsa),
    buyAndShipUsd: parseUsd(o.buyShip),
    months: o.months,
    monthlyDrift: o.monthlyDrift,
    verdict: o.worth?.verdict ?? null,
    reason: o.worth?.reason ?? null,
    evUsd: o.worth?.evUsd ?? null,
    costInUsd: o.worth?.costInUsd ?? null,
    maxBuyUsd: o.worth?.maxBuyUsd ?? null,
    bestExit: o.worth?.bestExit ?? null,
    p10: o.worth?.p10 ?? null,
    p10Band: o.worth?.p10Band ?? null,
    actualGrade: null,
  }
}

function storedPhoto(result: PhotoResult | null): StoredPhoto | null {
  if (!result) return null
  if (!result.ok) {
    return {
      side: result.side,
      fileName: '',
      width: 0,
      height: 0,
      reject: { code: result.code, message: result.message },
    }
  }
  return {
    side: result.side,
    fileName: '',
    width: 0,
    height: 0,
    centering: {
      left: result.measure.left,
      right: result.measure.right,
      top: result.measure.top,
      bottom: result.measure.bottom,
      lrLabel: result.measure.lr.label,
      tbLabel: result.measure.tb.label,
      worseLabel: result.measure.worse.label,
      worseLargerPct: result.measure.worse.largerPct,
      cannotBeTen: result.measure.cannotBeTen,
    },
  }
}

function fromStoredPhoto(existing: PredictionRecord | undefined, side: PhotoSide): PhotoResult | null {
  const row = existing?.photos.find((p) => p.side === side)
  if (!row) return null
  if (row.reject) return { ok: false, side, code: row.reject.code, message: row.reject.message }
  if (!row.centering) return null
  const base = measureFromBorders(row.centering.left, row.centering.right, row.centering.top, row.centering.bottom, side)
  return {
    ok: true,
    side,
    measure: {
      ...base,
      corners: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      inner: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      maxAngleErrorDeg: 0,
    },
  }
}

function selectFeeLine(v10: number | null): string {
  if (v10 == null) return `Standard US$${PSA_FEES.tiers[0].feeUsd} until a PSA 10 sold is typed`
  const f = selectPsaFee(v10)
  return `${f.name} US$${f.feeUsd.toFixed(2)} (declared to US$${f.declaredMaxUsd.toLocaleString('en-US')})`
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`
}

function sgd(n: number): string {
  return `S$${n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
