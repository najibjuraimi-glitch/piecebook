import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getCard, type Card } from '../data/seed'
import { FX_USD_SGD } from '../data/fx'
import { BackBar, Screen } from '../components/Screen'
import { CardArt } from '../components/CardArt'
import { GhostButton } from '../components/Buttons'
import { VisionGuess } from '../components/VisionGuess'
import { NotFoundScreen } from './NotFound'
import {
  centeringLabel,
  drawCenteringOverlay,
  hasPixelGeometry,
  measurePhoto,
  type PhotoResult,
  type PhotoSide,
} from '../lib/centering'
import { photoWouldChangeTheCall } from '../lib/photoNote'
import { loadPhotoFile } from '../lib/photoPixels'
import { downloadBlob, flattenedPhotoFile } from '../lib/saveFlatPhoto'
import { FULL_ART_NOTE, centeringLine, photoCentering, summariseCentering, withFullArtFront } from '../lib/centeringSummary'
import { EdgeReadout } from '../components/EdgeReadout'
import { buildScores } from '../lib/gradeScore'
import { GradeScores } from '../components/GradeScores'
import { dataUrlToFile, isNonEnglishCardLanguage, type VisionCheck } from '../lib/vision'
import { peekVisionSession } from '../store/visionSession'
import { copySeedPriceLine } from '../lib/copyPrice'
import { advicePrices, NO_PRICE_YET } from '../lib/cardPrices'
import { formatDate, formatSgd, formatUsMarketUsd } from '../lib/format'
import { rateLine } from '../lib/fx'

export function PregradeCardScreen() {
  const { cardNumber } = useParams()
  const card = getCard(cardNumber ? decodeURIComponent(cardNumber) : undefined)
  const [params] = useSearchParams()
  if (!card) return <NotFoundScreen message="That card isn’t in the seed." />
  // An old ?p= link used to reopen a typed draft. It now just opens this card.
  return <CardCheck key={card.cardNumber} cardNumber={card.cardNumber} debugSave={params.get('debug') === '1'} />
}

function CardCheck({ cardNumber, debugSave }: { cardNumber: string; debugSave: boolean }) {
  const card = getCard(cardNumber)!
  const session = peekVisionSession()
  const sessionMatch = session?.confirmedCardNumber === cardNumber ? session : null
  const [front, setFront] = useState<PhotoResult | null>(null)
  const [back, setBack] = useState<PhotoResult | null>(null)
  const [frontSeed, setFrontSeed] = useState<string | null>(sessionMatch?.frontDataUrl ?? null)
  const [backSeed, setBackSeed] = useState<string | null>(sessionMatch?.backDataUrl ?? null)
  const [vision, setVision] = useState<VisionCheck | null>(sessionMatch?.check ?? null)

  const borderless = card.frontBorder === 'none'
  const slab = Boolean(vision?.identify.graded_slab)
  const frontCentering = withFullArtFront(photoCentering(front, 'front'), borderless)
  const backCentering = photoCentering(back, 'back')
  const centeringSummary = summariseCentering(frontCentering, backCentering)
  const centeringCannotBeTen = centeringSummary.cannotBeTen
  const scores = useMemo(
    () =>
      !slab && (front || back || vision)
        ? buildScores({
            front: withFullArtFront(photoCentering(front, 'front'), borderless),
            back: photoCentering(back, 'back'),
            backSent: Boolean(back || backSeed),
            condition: vision && vision.coverage === 'full' ? vision.condition : null,
          })
        : null,
    [front, back, backSeed, vision, borderless, slab],
  )
  const visionRuledOut = Boolean(vision?.condition.psa10_ruled_out)
  const cannotBeTen = Boolean(!slab && (centeringCannotBeTen || visionRuledOut))
  const photoNote = photoWouldChangeTheCall({
    frontReject: borderless ? null : front && !front.ok ? front.message : null,
    backReject: back && !back.ok ? back.message : null,
    frontCannotBeTen: borderless ? false : Boolean(front?.ok && front.measure.cannotBeTen),
    backCannotBeTen: Boolean(back?.ok && back.measure.cannotBeTen),
    hasFront: Boolean(front),
    hasBack: Boolean(back),
    visionRead: vision?.coverage === 'full',
    visionRuledOut: slab ? false : visionRuledOut,
  })

  useEffect(() => {
    const fromConfirm = peekVisionSession()
    if (!fromConfirm || fromConfirm.confirmedCardNumber !== cardNumber) return
    // /pregrade measured the full-size files once. Carry that result; the copies held here are
    // shrunken for upload and would read differently. Re-measure only when an older session
    // carried no measurement at all.
    const carried = fromConfirm.centering
    if (carried) {
      setFront(carried.front)
      setFrontSeed(fromConfirm.frontDataUrl)
      if (fromConfirm.backDataUrl) {
        setBack(carried.back)
        setBackSeed(fromConfirm.backDataUrl)
      }
      setVision(fromConfirm.check)
      return
    }
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
  }, [cardNumber])

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
            {` · ${copySeedPriceLine(card, vision?.identify)}`}
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

      <Section title="Photos">
        <p className="text-meta text-muted">
          Front and back, square-on. Short side 800px or more. The whole card in the frame. Angled over ~8° is rejected.
        </p>
        <div className="mt-4 grid gap-4 tablet:grid-cols-2">
          <PhotoSlot side="front" result={front} onResult={setFront} seedDataUrl={frontSeed} debugSave={debugSave} fullArt={borderless} />
          <PhotoSlot side="back" result={back} onResult={setBack} seedDataUrl={backSeed} debugSave={debugSave} />
        </div>
        {vision && (
          <div className="mt-4">
            <VisionGuess check={vision} />
          </div>
        )}
        {slab && (
          <p className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-body text-ink">
            This photo shows a graded slab. Piecebook does not pre-grade a card that is already in a slab.
          </p>
        )}
        {scores && (
          <div className="mt-4">
            <GradeScores scores={scores} />
          </div>
        )}
        {(front || back) && (
          <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3" aria-label="Centering">
            <p className="text-meta font-medium text-muted">Centering</p>
            <p className="tabular mt-1 text-body text-ink">{centeringLine(frontCentering, 'front')}</p>
            <p className="tabular mt-0.5 text-body text-ink">{centeringLine(backCentering, 'back')}</p>
            {!slab && (
              <p className={`mt-2 text-body ${centeringSummary.cannotBeTen ? 'font-medium text-bad' : 'text-ink'}`}>{centeringSummary.verdict}</p>
            )}
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

      <PricesCard card={card} />
    </Screen>
  )
}

function PricesCard({ card }: { card: Card }) {
  const rows = advicePrices(card)
  const any = rows.some((row) => row.usd != null)
  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface px-5 py-4" aria-label="Prices">
      <h2 className="text-title text-ink">Prices</h2>
      <p className="mt-1 text-meta text-muted">
        Raw is the ungraded seed market for this print. PSA 9 and PSA 10 appear only when a sourced figure is stored for this same print. Not an offer.
      </p>
      <ul className="mt-4 divide-y divide-line">
        {rows.map((row) => {
          const priced = row.usd != null && row.sgd != null && row.source && row.asOf
          return (
            <li key={row.grade} className="py-3 first:pt-0 last:pb-0" data-testid={`price-${row.grade}`}>
              <p className="text-meta font-medium text-muted">{row.label}</p>
              {priced && row.detail ? (
                <>
                  <p className="tabular mt-1 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-ink">
                    {formatUsMarketUsd(row.usd!)}
                    <span className="ml-2 text-[15px] font-medium text-muted">{formatSgd(row.sgd!)}</span>
                  </p>
                  <p className="mt-1 text-meta text-ink">
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-line underline-offset-2 hover:decoration-ink"
                      >
                        {row.source}
                      </a>
                    ) : (
                      <span>{row.source}</span>
                    )}
                    <span className="text-muted"> · {row.detail} · {formatDate(row.asOf!)}</span>
                  </p>
                </>
              ) : (
                <p className="mt-1 text-body text-ink">{NO_PRICE_YET}</p>
              )}
            </li>
          )
        })}
      </ul>
      {any && (
        <p className="mt-4 border-t border-line pt-3 text-meta text-muted">
          Singapore dollars are that US dollar figure at{' '}
          <a
            href={FX_USD_SGD.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
          >
            {rateLine()}
          </a>
          . Not a second price.
        </p>
      )}
    </section>
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
  result,
  onResult,
  seedDataUrl,
  debugSave,
  fullArt = false,
}: {
  side: PhotoSide
  result: PhotoResult | null
  onResult: (r: PhotoResult | null) => void
  seedDataUrl?: string | null
  debugSave?: boolean
  /** Seed metadata says this front has no print border. A measured edge here is not a read. */
  fullArt?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)

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

  const drawable = !fullArt && Boolean(result?.ok && bitmap && hasPixelGeometry(result.measure))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bitmap || !result?.ok || !hasPixelGeometry(result.measure)) return
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawCenteringOverlay(ctx, bitmap, bitmap.width, bitmap.height, result.measure)
  }, [bitmap, result])

  const onFile = async (next: File | undefined) => {
    if (!next) return
    setFile(next)
    setSaveNote(null)
    setBusy(true)
    try {
      const loaded = await loadPhotoFile(next)
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
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {drawable && (
        <canvas ref={canvasRef} className="mt-2 w-full rounded-xl" aria-label={`${side} centering overlay`} />
      )}
      {!drawable && seedDataUrl && (
        <img src={seedDataUrl} alt="" className="mt-2 max-h-64 w-full rounded-xl object-contain" />
      )}
      {fullArt && result && <p className="mt-2 text-body text-ink">{FULL_ART_NOTE}</p>}
      {!fullArt && result && !result.ok && (
        <p className="mt-2 text-body text-bad">{result.message}</p>
      )}
      {!fullArt && result?.ok && <p className="tabular mt-2 text-meta text-ink">{centeringLabel(result.measure)}</p>}
      {!fullArt && <EdgeReadout side={side} show={result != null} detail={result ? photoCentering(result, side)?.detail : undefined} />}
      <div className="mt-3 flex flex-col gap-2">
        <GhostButton onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Reading…' : result ? 'Replace photo' : 'Upload photo'}
        </GhostButton>
        {debugSave && (
          <GhostButton
            data-testid={`save-flat-${side}`}
            disabled={!file}
            onClick={() => {
              if (!file) return
              void flattenedPhotoFile(file, false, side).then((saved) => {
                downloadBlob(saved.blob, saved.name)
                setSaveNote(saved.note)
              })
            }}
          >
            Save flattened photo
          </GhostButton>
        )}
        {debugSave && saveNote && <p className="text-meta text-muted">{saveNote}</p>}
      </div>
    </div>
  )
}
