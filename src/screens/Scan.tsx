import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'
import { ALL_CARDS } from '../data/seed'
import { VISION_URL } from '../config/vision'
import { isStale } from '../lib/boughtBook'
import { todayIso, formatSgd, formatUsd } from '../lib/format'
import { legalQuote } from '../lib/loadBought'
import { characterForPrint } from '../lib/printCharacter'
import { choosePrint, lotOfferPath, summariseRows, type ScanBox, type ScanRow, type ScanSummary, type WatchTarget } from '../lib/scanMatch'

const field =
  'mt-1.5 block h-11 w-full rounded-xl border border-line bg-paper/60 px-3.5 text-body text-ink placeholder:text-muted/70 focus:border-ink focus:bg-surface focus:outline-none'
const label = 'block text-meta font-medium text-muted'
const SAVE_KEY = 'piecebook.scan.v1'

function prints() {
  return ALL_CARDS.map((card) => ({
    cardNumber: card.cardNumber,
    baseNumber: card.baseNumber,
    variant: card.variant || '',
    rarity: card.rarity,
    language: card.language || 'EN',
    name: card.name,
    setCode: card.setCode,
    character: characterForPrint(card.cardNumber, card.name),
  }))
}

function quoteFor(id: string, grade: 'raw' | 'psa9' | 'psa10') {
  return legalQuote(id, grade)
}

/**
 * One photo of a case, binder or listing. The image is sent once and is not kept on the server.
 * Saving keeps the reading, not the photo bytes.
 */
export function ScanScreen() {
  const [imageUrl, setImageUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [lotAsk, setLotAsk] = useState('')
  const [lotCurrency, setLotCurrency] = useState<'SGD' | 'USD'>('SGD')
  const [preset, setPreset] = useState<'ebay' | 'fanatics' | 'goldin'>('ebay')
  const [scan, setScan] = useState<ScanSummary | null>(null)
  const [targets, setTargets] = useState<WatchTarget[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const photo = preview || imageUrl.trim() || null
  const crops = useBrowserCrops(photo, scan?.cards ?? [])
  const rows = useMemo(() => prints(), [])

  const run = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const body: Record<string, unknown> = {
        caption,
        lotAskSgd: lotAsk.trim() ? Number(lotAsk) : null,
        lotAskCurrency: lotCurrency,
      }
      if (file) body.image = await fileToDataUrl(file)
      else if (imageUrl.trim()) body.imageUrl = imageUrl.trim()
      else {
        setError('Add a photo or an image link.')
        setBusy(false)
        return
      }
      const res = await fetch(`${VISION_URL}/scan`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.cards) {
        setError(data?.error === 'daily_cap_reached' ? 'The daily photo limit is used up.' : 'That photo could not be read.')
        setBusy(false)
        return
      }
      setScan(data as ScanSummary)
      setTargets(Array.isArray(data.targets) ? data.targets : [])
    } catch {
      setError('That photo could not be read.')
    }
    setBusy(false)
  }

  const pick = (index: number, printId: string) => {
    if (!scan) return
    const cards = scan.cards.map((card) => (card.index === index ? choosePrint(card, printId, quoteFor, todayIso(), rows, targets) : card))
    setScan(summariseRows(cards, scan.lotAskAmount ?? scan.lotAskSgd, scan.lotAskCurrency === 'USD' ? 'USD' : 'SGD'))
  }

  const save = () => {
    if (!scan) return
    const kept = {
      ...scan,
      cards: scan.cards.map((card) => ({ ...card, imageUrl: card.imageUrl })),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(kept))
    setSaved(true)
  }

  return (
    <Screen>
      <BackBar title="Scan" subline="One photo of a case or a listing" fallbackTo="/portfolio" />
      <div className="space-y-4">
        <div>
          <label htmlFor="scan-file" className={label}>
            Photo
          </label>
          <input
            id="scan-file"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null
              setFile(next)
              setPreview((current) => {
                if (current) URL.revokeObjectURL(current)
                return next ? URL.createObjectURL(next) : null
              })
            }}
            className="mt-1.5 block w-full text-meta text-ink"
          />
        </div>
        <div>
          <label htmlFor="scan-url" className={label}>
            Or an image link
          </label>
          <input id="scan-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://" className={field} />
          <p className="mt-1 text-meta text-muted">The image only. Piecebook does not open the listing page.</p>
        </div>
        <div>
          <label htmlFor="scan-caption" className={label}>
            Caption, if the seller listed prices
          </label>
          <textarea id="scan-caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} placeholder={'1288 (Sequential x4)\nX'} className={`${field} h-auto py-3`} />
        </div>
        <div>
          <label htmlFor="scan-lot" className={label}>
            Lot asking price
          </label>
          <div className="mt-1.5 flex gap-2">
            <select aria-label="Lot currency" value={lotCurrency} onChange={(e) => setLotCurrency(e.target.value === 'USD' ? 'USD' : 'SGD')} className={`${field} mt-0 w-24`}>
              <option value="SGD">SGD</option>
              <option value="USD">USD</option>
            </select>
            <input id="scan-lot" inputMode="decimal" value={lotAsk} onChange={(e) => setLotAsk(e.target.value)} className={`tabular ${field} mt-0`} />
          </div>
          <label htmlFor="scan-house" className={`${label} mt-3`}>
            House for the max offer
          </label>
          <select id="scan-house" value={preset} onChange={(e) => setPreset(e.target.value === 'fanatics' || e.target.value === 'goldin' ? e.target.value : 'ebay')} className={field}>
            <option value="ebay">eBay</option>
            <option value="fanatics">Fanatics</option>
            <option value="goldin">Goldin</option>
          </select>
        </div>
        <button type="button" onClick={() => void run()} disabled={busy} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-ink text-[15px] font-semibold text-paper disabled:opacity-50">
          {busy ? 'Reading…' : 'Read the photo'}
        </button>
        {error && <p className="text-meta text-ink">{error}</p>}
      </div>

      {scan && (
        <section className="mt-6 space-y-3">
          {(preview || imageUrl.trim()) && (
            <div className="relative overflow-hidden rounded-2xl border border-line">
              <img src={preview || imageUrl.trim()} alt="" className="block w-full" />
              {scan.cards.map((card) =>
                card.box ? (
                  <span
                    key={card.index}
                    className={`absolute border-2 ${card.underStreet || card.targetHit ? 'border-good' : 'border-ink/70'}`}
                    style={{ left: `${card.box.x * 100}%`, top: `${card.box.y * 100}%`, width: `${card.box.w * 100}%`, height: `${card.box.h * 100}%` }}
                  />
                ) : null,
              )}
            </div>
          )}
          <LotLine scan={scan} preset={preset} />
          <ul className="space-y-3">
            {scan.cards.map((card) => (
              <li key={card.index} className={`rounded-2xl border px-3 py-3 ${card.underStreet || card.targetHit ? 'border-good bg-[#E7F6EE]' : 'border-line bg-surface'}`}>
                <CardLine card={card} crop={crops[card.index] ?? null} onPick={(printId) => pick(card.index, printId)} onServerCrop={photo && !crops[card.index] ? () => serverCrop(photo, card.box, file) : undefined} />
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button type="button" onClick={save} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-line text-[14px] font-medium text-ink">
              {saved ? 'Saved' : 'Save scan'}
            </button>
          </div>
          <p className="text-meta text-muted">The photo is not kept. Save stores the reading on this phone.</p>
        </section>
      )}
    </Screen>
  )
}

function askLabel(scan: ScanSummary): string | null {
  const amount = scan.lotAskAmount ?? scan.lotAskSgd
  if (amount == null) return null
  if (scan.lotAskCurrency === 'USD') return `US$ ${amount.toFixed(2)}`
  return formatSgd(amount)
}

function LotLine({ scan, preset }: { scan: ScanSummary; preset: 'ebay' | 'fanatics' | 'goldin' }) {
  const ask = askLabel(scan)
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3">
      <p className="text-meta text-muted">Fresh English street</p>
      <p className="tabular text-[22px] font-semibold text-ink">{scan.lotStreetSgd == null ? 'No price yet' : formatSgd(scan.lotStreetSgd)}</p>
      {ask != null && (
        <p className="tabular mt-1 text-meta text-ink">
          Asking {ask}
          {scan.lotGapSgd != null ? ` · gap ${formatSgd(scan.lotGapSgd)}` : ''}
        </p>
      )}
      {scan.bundles.map((bundle) => (
        <p key={bundle.index} className="mt-1 text-meta text-ink">
          Bundle ask {bundle.askSgd == null ? 'not SGD' : formatSgd(bundle.askSgd)}
          {bundle.singlesSgd != null ? ` · singles ${formatSgd(bundle.singlesSgd)}` : ''}
        </p>
      ))}
      {scan.maxOfferSgd != null && (
        <p className="mt-2">
          <Link to={lotOfferPath(scan, preset)} className="text-meta font-medium text-ink underline decoration-line underline-offset-2">
            Max lot offer {formatSgd(scan.maxOfferSgd)}
          </Link>
        </p>
      )}
      <ul className="mt-2 space-y-1">
        {scan.cards.filter((card) => card.drag).map((card) => (
          <li key={card.index} className="text-meta text-muted">
            {card.printId || card.name || 'Card'} · {card.drag}
          </li>
        ))}
      </ul>
    </div>
  )
}

function useBrowserCrops(src: string | null, cards: ScanRow[]): Record<number, string> {
  const [crops, setCrops] = useState<Record<number, string>>({})
  const key = cards.map((card) => `${card.index}:${card.box ? `${card.box.x},${card.box.y},${card.box.w},${card.box.h}` : ''}`).join('|')
  useEffect(() => {
    if (!src || !cards.some((card) => card.box)) {
      setCrops({})
      return
    }
    let cancel = false
    const img = new Image()
    img.onload = () => {
      if (cancel) return
      const next: Record<number, string> = {}
      for (const card of cards) {
        if (!card.box) continue
        const url = drawCrop(img, card.box)
        if (url) next[card.index] = url
      }
      setCrops(next)
    }
    img.onerror = () => {
      if (!cancel) setCrops({})
    }
    if (!src.startsWith('blob:') && !src.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.src = src
    return () => {
      cancel = true
    }
  }, [src, key])
  return crops
}

function drawCrop(img: HTMLImageElement, box: ScanBox): string | null {
  try {
    const sw = Math.max(1, Math.round(box.w * img.naturalWidth))
    const sh = Math.max(1, Math.round(box.h * img.naturalHeight))
    const long = Math.max(sw, sh)
    const scale = long > 480 ? 480 / long : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw * scale))
    canvas.height = Math.max(1, Math.round(sh * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, Math.round(box.x * img.naturalWidth), Math.round(box.y * img.naturalHeight), sw, sh, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return null
  }
}

async function serverCrop(src: string, box: ScanBox | null, file: File | null): Promise<string | null> {
  if (!box) return null
  const body: Record<string, unknown> = { box }
  if (file) body.image = await fileToDataUrl(file)
  else if (src.startsWith('http')) body.imageUrl = src
  else return null
  const res = await fetch(`${VISION_URL}/scan/crop`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  return typeof data?.crop === 'string' ? data.crop : null
}

function CardLine({ card, crop, onPick, onServerCrop }: { card: ScanRow; crop: string | null; onPick: (printId: string) => void; onServerCrop?: () => Promise<string | null> }) {
  const [asked, setAsked] = useState<string | null>(null)
  const shown = crop || asked
  const street = card.priced && card.street.sgd != null ? formatSgd(card.street.sgd) : 'No price yet'
  const today = todayIso()
  const staleSources = card.street.sources.filter((source) => isStale(source.asOf, today))
  return (
    <div>
      {shown && <img src={shown} alt="" className="mb-2 h-16 w-auto rounded-lg" />}
      {!shown && onServerCrop && (
        <button
          type="button"
          className="mb-2 text-meta font-medium text-ink underline decoration-line underline-offset-2"
          onClick={() => {
            void onServerCrop().then((url) => {
              if (url) setAsked(url)
            })
          }}
        >
          Crop this card
        </button>
      )}
      <p className="text-[15px] font-medium text-ink">
        {card.name || 'Card'}
        {card.language ? ` · ${card.language}` : ' · Language not read'}
        {card.liked ? ` · ${card.liked}` : ''}
      </p>
      <p className="tabular mt-1 text-meta text-ink">
        {card.printId || 'Print not exact'}
        {card.lowConfidence ? ' · Low confidence' : ''}
        {card.ambiguous ? ' · Ambiguous' : ''}
        {` · ${Math.round(card.confidence * 100)}%`}
      </p>
      <p className="tabular mt-1 text-meta text-ink">
        {card.forSale ? (card.sticker ? `${card.sticker.currency} ${card.sticker.amount}` : 'No sticker') : 'Not for sale'}
        {` · ${street}`}
        {card.street.source && card.priced ? ` · ${card.street.source}` : ''}
        {card.street.detail === 'manual' && card.priced ? ' · manual' : ''}
        {card.street.asOf && card.priced ? ` · ${card.street.asOf}` : ''}
        {card.gapPct != null ? ` · ${card.gapPct}%` : ''}
        {card.underStreet ? ' · Under street' : ''}
        {card.targetHit ? ' · Under target' : ''}
      </p>
      {(card.street.evidence ?? []).map((comp) => (
        <p key={`${comp.source}-${comp.asOf}`} className="text-meta text-muted">
          {comp.source} sold {formatUsd(comp.usd)} · {comp.asOf}
        </p>
      ))}
      {staleSources.map((source) => (
        <p key={`${source.source}-${source.asOf}`} className="text-meta text-muted">
          Stale {formatSgd(source.sgd)} · {source.source} · {source.asOf}
        </p>
      ))}
      {card.street.sourcesDisagree && <p className="text-meta text-ink">Sources disagree</p>}
      {card.contributionSgd != null && <p className="tabular text-meta text-muted">Share of the lot target {formatSgd(card.contributionSgd)}</p>}
      {card.slab && (
        <p className="mt-1 text-meta text-muted">
          {[card.slab.grader, card.slab.grade, card.slab.cert, card.slab.year, card.slab.blackLabel ? 'Black label' : null].filter(Boolean).join(' · ')}
          {card.certUrl && (
            <>
              {' · '}
              <a href={card.certUrl} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-line underline-offset-2">
                Cert
              </a>
            </>
          )}
        </p>
      )}
      <p className="mt-1 text-meta text-muted">
        {card.condition.judge === 'too_small' ? 'Crop is too small to judge.' : card.condition.judge === 'blurry' ? 'Crop is too blurry to judge.' : 'Condition is an estimate, not a grade.'}
        {card.condition.whitening ? ' Whitening.' : ''}
        {card.condition.surface.length ? ` ${card.condition.surface.join(', ')}.` : ''}
        {card.condition.leftRight ? ` L/R ${card.condition.leftRight}.` : ''}
        {card.condition.topBottom ? ` T/B ${card.condition.topBottom}.` : ''}
        {card.condition.confidence ? ` ${card.condition.confidence} confidence.` : ''}
      </p>
      {(card.lowConfidence || card.ambiguous) && card.candidates.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {card.candidates.map((id) => (
            <button key={id} type="button" onClick={() => onPick(id)} className="h-11 rounded-xl border border-line px-3 text-meta font-medium text-ink">
              {id}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 flex gap-3 text-meta">
        {card.watchId && (
          <Link to={`/bid?item=${encodeURIComponent(card.watchId)}`} className="font-medium text-ink underline decoration-line underline-offset-2">
            Max bid
          </Link>
        )}
        <Link to="/pregrade" className="font-medium text-ink underline decoration-line underline-offset-2">
          Close-up check
        </Link>
      </p>
    </div>
  )
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('unreadable'))
    reader.readAsDataURL(file)
  })
}
