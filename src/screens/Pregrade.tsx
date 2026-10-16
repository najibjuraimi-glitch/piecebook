import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'
import { SearchField } from '../components/SearchField'
import { EmptyState } from '../components/EmptyState'
import { CardArt } from '../components/CardArt'
import { GhostButton, PrimaryButton } from '../components/Buttons'
import { ALL_CARDS, type Card } from '../data/seed'
import { resolveCardNumber } from '../lib/search'
import { formatDate } from '../lib/format'
import { copySeedPriceLine } from '../lib/copyPrice'
import { rankVisionCandidates } from '../lib/visionCandidates'
import {
  cardLanguageLabel,
  checkPhotos,
  isNonEnglishCardLanguage,
  VisionCapError,
  VisionRequestError,
  type VisionCheck,
  type VisionPhotos,
} from '../lib/vision'
import { writeVisionSession, type CarriedCentering } from '../store/visionSession'
import { removePrediction, usePredictions, type StoredPhoto } from '../store/predictions'
import { hasPixelGeometry, measurePhoto, type PhotoResult, type PhotoSide } from '../lib/centering'
import { loadPhotoFile } from '../lib/photoPixels'
import { buildScores } from '../lib/gradeScore'
import { CenteringCanvas, GradeScores } from '../components/GradeScores'
import {
  centeringLine,
  photoCentering,
  photoCenteringFromStored,
  summariseCentering,
  unmeasured,
  type CenteringSummary,
  type PhotoCentering,
} from '../lib/centeringSummary'

const VERDICT_LABEL = { go: 'Go', borderline: 'Borderline', 'no-go': 'No-go' } as const
const EN_ONLY_NOTE = 'Piecebook currently only has English card data and prices.'

export function PregradeScreen() {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const rows = usePredictions()
  const match = useMemo(() => resolveCardNumber(q), [q])
  const unknown = q.trim().length >= 3 && !match
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [photoError, setPhotoError] = useState<{ text: string; retry: boolean; blocked?: boolean } | null>(null)
  const [check, setCheck] = useState<VisionCheck | null>(null)
  const [frontDataUrl, setFrontDataUrl] = useState<string | null>(null)
  const [backDataUrl, setBackDataUrl] = useState<string | undefined>()
  // Shrunken photos from a refused check: typing the number still hands them to the worksheet.
  const [heldPhotos, setHeldPhotos] = useState<VisionPhotos | null>(null)
  // Measured on this phone the moment a photo is picked, before anything leaves; shown whatever the model says.
  const [frontMeasure, setFrontMeasure] = useState<SideMeasure | null>(null)
  const [backMeasure, setBackMeasure] = useState<SideMeasure | null>(null)
  const [measuring, setMeasuring] = useState(false)
  // The measurements that went with the last check, so confirm hands the worksheet the same numbers.
  const [carriedCentering, setCarriedCentering] = useState<CarriedCentering | null>(null)
  const centering = useMemo<CenteringSummary | null>(
    () => (frontMeasure || backMeasure ? summariseCentering(frontMeasure?.centering ?? null, backMeasure?.centering ?? null) : null),
    [frontMeasure, backMeasure],
  )
  // Scores need an attempt at the model (or its refusal) so the condition part is honest about what it rests on.
  const scores = useMemo(
    () =>
      centering && (check || photoError)
        ? buildScores({
            front: centering.front,
            back: centering.back,
            backSent: Boolean(backFile),
            condition: check && check.coverage === 'full' ? check.condition : null,
          })
        : null,
    [centering, check, photoError, backFile],
  )

  const pickSide = async (file: File | null, side: PhotoSide) => {
    const set = side === 'front' ? setFrontMeasure : setBackMeasure
    const prev = side === 'front' ? frontMeasure : backMeasure
    prev?.bitmap?.close()
    if (side === 'front') setFrontFile(file)
    else setBackFile(file)
    setCheck(null)
    setPhotoError(null)
    setCarriedCentering(null)
    if (!file) {
      set(null)
      return
    }
    setMeasuring(true)
    try {
      set(await measureSide(file, side))
    } finally {
      setMeasuring(false)
    }
  }

  const candidates = useMemo(
    () => (check ? rankVisionCandidates(check.identify, ALL_CARDS, 5) : []),
    [check],
  )
  const language = check?.identify.language ?? null
  const showEnOnlyNote = isNonEnglishCardLanguage(language)

  const runCheck = async () => {
    if (!frontFile || busy) return
    setBusy(true)
    setPhotoError(null)
    setCheck(null)
    setHeldPhotos(null)
    // Measured once, here, from the full-size file. The same result travels to the worksheet,
    // which never re-measures the shrunken copy it receives.
    const fm = frontMeasure ?? (await measureSide(frontFile, 'front'))
    const bm = backFile ? (backMeasure ?? (await measureSide(backFile, 'back'))) : null
    if (!frontMeasure) setFrontMeasure(fm)
    if (bm && !backMeasure) setBackMeasure(bm)
    const measured = { front: fm.centering, back: bm?.centering ?? null }
    const carried = { front: fm.result, back: bm?.result ?? null }
    setCarriedCentering(carried)
    try {
      const payload = await checkPhotos(frontFile, backFile, measured)
      setCheck(payload.check)
      setFrontDataUrl(payload.frontDataUrl)
      setBackDataUrl(payload.backDataUrl)
      writeVisionSession({
        check: payload.check,
        frontDataUrl: payload.frontDataUrl,
        backDataUrl: payload.backDataUrl,
        centering: carried,
      })
    } catch (err) {
      if (err instanceof VisionCapError) {
        setPhotoError({ text: 'Today’s photo checks are used up. Type a card number instead.', retry: false })
      } else if (err instanceof VisionRequestError && err.blocked) {
        setHeldPhotos(err.photos ?? null)
        setPhotoError({
          text: `${err.message} It was not counted against today’s checks.`,
          retry: false,
          blocked: Boolean(err.photos),
        })
      } else if (err instanceof VisionRequestError && err.retryable) {
        setPhotoError({ text: `${err.message} It was not counted against today’s checks.`, retry: true })
      } else if (err instanceof VisionRequestError) {
        setPhotoError({ text: `${err.message} Type a card number instead.`, retry: false })
      } else {
        setPhotoError({ text: 'The photo check could not run.', retry: true })
      }
    } finally {
      setBusy(false)
    }
  }

  const confirmCard = (card: Card) => {
    if (!check || !frontDataUrl) return
    writeVisionSession({
      check,
      frontDataUrl,
      backDataUrl,
      centering: carriedCentering ?? undefined,
      confirmedCardNumber: card.cardNumber,
    })
    navigate(`/pregrade/${encodeURIComponent(card.cardNumber)}`)
  }

  const useSearchInstead = () => {
    document.getElementById('pregrade-search')?.scrollIntoView({ block: 'start' })
    const input = document.querySelector<HTMLInputElement>('#pregrade-search input')
    input?.focus()
  }

  /** Typed-number path: if a refused check left photos behind, the worksheet still measures them. */
  const openTyped = (card: Card) => {
    if (heldPhotos) {
      writeVisionSession({
        check: null,
        frontDataUrl: heldPhotos.frontDataUrl,
        backDataUrl: heldPhotos.backDataUrl,
        centering: carriedCentering ?? undefined,
        confirmedCardNumber: card.cardNumber,
      })
    }
    navigate(`/pregrade/${encodeURIComponent(card.cardNumber)}`)
  }

  return (
    <Screen>
      <BackBar fallbackTo="/" crumbs={[{ label: 'Sets', to: '/' }, { label: 'Pre-grade' }]} />
      <h1 className="text-display text-ink">Pre-grade</h1>
      <p className="mt-2 max-w-[60ch] text-body text-muted">
        Photos can rule out a PSA 10. They never confirm one. Piecebook never buys, bids or offers.
      </p>

      <section className="mt-6" aria-labelledby="pregrade-photos">
        <h2 id="pregrade-photos" className="text-title text-ink">
          Check photos
        </h2>
        <p className="mt-1 max-w-[60ch] text-meta text-muted">
          Front is required. Back helps. The photo is shrunk on this phone before it leaves. Confirm a
          card — nothing is picked for you.
        </p>
        <div className="mt-4 grid gap-4 tablet:grid-cols-2">
          <PhotoPick label="Front" file={frontFile} measure={frontMeasure} side="front" onFile={(f) => void pickSide(f, 'front')} />
          <PhotoPick label="Back (optional)" file={backFile} measure={backMeasure} side="back" onFile={(f) => void pickSide(f, 'back')} />
        </div>
        <PrimaryButton className="mt-4" disabled={!frontFile || busy || measuring} onClick={() => void runCheck()}>
          {busy ? 'Checking…' : measuring ? 'Measuring…' : 'Check photos'}
        </PrimaryButton>
        {centering && <CenteringBlock summary={centering} />}
        {scores && (
          <div className="mt-4">
            <GradeScores scores={scores} />
          </div>
        )}
        {photoError && (
          <div className="mt-3" role="alert">
            <p className="text-body text-ink">{photoError.text}</p>
            {photoError.blocked && (
              <div className="mt-2">
                <GhostButton onClick={useSearchInstead}>Type the card number</GhostButton>
                <p className="mt-2 text-meta text-muted">
                  Your photos are kept for this visit: the worksheet still measures centering from them.
                </p>
              </div>
            )}
            {photoError.retry && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <GhostButton disabled={busy} onClick={() => void runCheck()}>
                  Try again
                </GhostButton>
                <button type="button" className="text-meta text-muted underline" onClick={useSearchInstead}>
                  or type a card number
                </button>
              </div>
            )}
          </div>
        )}

        {check && (
          <div className="mt-6">
            <p className="text-[15px] font-medium leading-5 text-ink">
              Read as {check.identify.name ?? 'an unnamed card'}
              {check.identify.set_code ? ` · ${check.identify.set_code}` : ''}
              {check.identify.rarity ? ` · ${check.identify.rarity}` : ''}
              {check.identify.parallel_guess ? ` · ${check.identify.parallel_guess}` : ''}
              {' · '}
              {cardLanguageLabel(language)}
            </p>
            {check.coverage === 'identify_only' && (
              <p className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3 text-body text-ink">
                The model read the number but declined to describe this card’s condition. Nothing is ruled
                out; the worksheet still measures centering from your photos.
              </p>
            )}
            {showEnOnlyNote && (
              <p className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3 text-body text-ink">
                {EN_ONLY_NOTE}
              </p>
            )}
            {candidates.length === 0 ? (
              <p className="mt-3 text-body text-muted">No seed card matched. Type a card number instead.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {candidates.map((row) => (
                  <li key={row.card.cardNumber}>
                    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 tablet:flex-row tablet:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="w-12 shrink-0">
                          <CardArt card={row.card} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-medium leading-5 text-ink">
                            {row.card.name} · {row.card.cardNumber}
                          </p>
                          <p className="tabular text-meta text-muted">
                            {row.card.setCode}
                            {row.card.variant ? ` · ${row.card.variant}` : ''}
                            {' · '}
                            {cardLanguageLabel(language)}
                            {` · ${copySeedPriceLine(row.card, check.identify)}`}
                          </p>
                        </div>
                      </div>
                      <GhostButton
                        className="!h-11 !min-h-0 shrink-0 px-3 text-[14px] tablet:!w-auto"
                        onClick={() => confirmCard(row.card)}
                      >
                        Confirm this card
                      </GhostButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <GhostButton className="mt-3" onClick={useSearchInstead}>
              None of these — type a number
            </GhostButton>
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="pregrade-search">
        <h2 id="pregrade-search" className="text-title text-ink">
          Or type a card number
        </h2>
        <p className="mt-1 text-meta text-muted">The photo check is a guess. You can always open a worksheet by number.</p>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (match) openTyped(match)
          }}
        >
          <SearchField value={q} onChange={setQ} placeholder="Piecebook card number, e.g. ST01-007" />
          {match && (
            <Link
              to={`/pregrade/${encodeURIComponent(match.cardNumber)}`}
              onClick={(e) => {
                e.preventDefault()
                openTyped(match)
              }}
              className="mt-3 flex min-h-[48px] items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 text-ink transition-colors duration-150 ease-out hover:bg-paper/60 active:bg-paper"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-medium leading-5">
                  {match.name} · {match.cardNumber}
                </span>
                <span className="block text-meta text-muted">
                  {match.setCode}
                  {` · ${copySeedPriceLine(match)}`}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-muted">
                ›
              </span>
            </Link>
          )}
          {unknown && <p className="mt-3 text-meta text-muted">That number is not in the seed.</p>}
        </form>
      </section>

      <section className="mt-10" aria-labelledby="pregrade-log">
        <h2 id="pregrade-log" className="text-title text-ink">
          Prediction log
        </h2>
        <p className="mt-1 text-meta text-muted">On this browser only. A submitted row locks; grade entry is later.</p>
        {rows.length === 0 ? (
          <EmptyState message="No predictions yet. Open a card number to start a worksheet." />
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <Link
                  to={`/pregrade/${encodeURIComponent(r.cardNumber)}?p=${encodeURIComponent(r.id)}`}
                  className="min-w-0 flex-1 rounded-lg py-1 text-ink hover:underline"
                >
                  <p className="text-[15px] font-medium leading-5">
                    {r.cardName} · {r.cardNumber}
                  </p>
                  <p className="tabular mt-0.5 text-meta text-muted">
                    {r.verdict ? VERDICT_LABEL[r.verdict] : 'Draft'}
                    {r.status === 'submitted' ? ' · submitted' : ' · draft'}
                    {r.updatedAt ? ` · ${formatDate(r.updatedAt.slice(0, 10))}` : ''}
                  </p>
                  <p className="tabular mt-0.5 text-meta text-muted">{storedCenteringLine(r.photos)}</p>
                </Link>
                {r.status !== 'submitted' && (
                  <GhostButton className="!h-11 !min-h-0 !w-auto shrink-0 px-3 text-[14px]" onClick={() => removePrediction(r.id)}>
                    Remove
                  </GhostButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Screen>
  )
}

/** One side as measured on this phone: the summary that travels, plus the pixel geometry and bitmap for the overlay. */
interface SideMeasure {
  centering: PhotoCentering
  result: PhotoResult | null
  bitmap: ImageBitmap | null
}

/** Centering from the full-size file on this phone. A photo that cannot be read says so; nothing is ruled out. */
async function measureSide(file: File, side: PhotoSide): Promise<SideMeasure> {
  try {
    const loaded = await loadPhotoFile(file)
    const result = measurePhoto(loaded.pixels, side)
    return { centering: photoCentering(result, side) ?? unmeasured(side, 'unreadable'), result, bitmap: loaded.bitmap }
  } catch {
    return { centering: unmeasured(side, 'unreadable'), result: null, bitmap: null }
  }
}

/** One line for the prediction log: both sides' ratios, or why a side was not measured. */
export function storedCenteringLine(photos: StoredPhoto[]): string {
  const front = photos.find((p) => p.side === 'front')
  const back = photos.find((p) => p.side === 'back')
  const f = front ? photoCenteringFromStored(front) : null
  const b = back ? photoCenteringFromStored(back) : null
  if (!f && !b) return 'Centering: not measured.'
  const parts = [f && shortLine(f), b && shortLine(b)].filter(Boolean)
  const summary = summariseCentering(f, b)
  return `Centering: ${parts.join(' · ')}${summary.cannotBeTen ? ' · cannot be a 10' : ''}`
}

function shortLine(c: PhotoCentering): string {
  const who = c.side === 'front' ? 'front' : 'back'
  if (!c.measured) return `${who} not measured`
  return `${who} ${c.leftRight} ${c.topBottom}`
}

export function CenteringBlock({ summary }: { summary: CenteringSummary }) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3" aria-label="Centering">
      <p className="text-meta font-medium text-muted">Centering, measured on this phone</p>
      <p className="tabular mt-1 text-body text-ink">{centeringLine(summary.front, 'front')}</p>
      <p className="tabular mt-0.5 text-body text-ink">{centeringLine(summary.back, 'back')}</p>
      <p className={`mt-2 text-body ${summary.cannotBeTen ? 'font-medium text-bad' : 'text-ink'}`}>{summary.verdict}</p>
      <p className="mt-1 text-meta text-muted">
        A 10 needs {summary.limits.front} or better on the front and {summary.limits.back} or better on the back. Centering can rule a 10 out. It never confirms one.
      </p>
    </div>
  )
}

function PhotoPick({
  label,
  file,
  measure,
  side,
  onFile,
}: {
  label: string
  file: File | null
  measure: SideMeasure | null
  side: PhotoSide
  onFile: (f: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])

  const drawable = Boolean(measure?.bitmap && measure.result?.ok && hasPixelGeometry(measure.result.measure))

  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-meta font-medium text-muted">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {drawable && measure?.bitmap && measure.result?.ok && (
        <CenteringCanvas bitmap={measure.bitmap} measure={measure.result.measure} side={side} />
      )}
      {!drawable && url && <img src={url} alt="" className="mt-2 max-h-44 w-full rounded-xl object-contain" />}
      {measure && !measure.centering.measured && (
        // A card that was found but whose print edge was not read is a limit of the photo, not a fault in it.
        <p className={`mt-2 text-body ${measure.centering.reason === 'no-print-edge' ? 'text-muted' : 'text-bad'}`}>{measure.centering.note}</p>
      )}
      {measure?.centering.measured && (
        <p className="tabular mt-2 text-meta text-ink">
          {measure.centering.leftRight} left to right · {measure.centering.topBottom} top to bottom
          {measure.centering.cannotBeTen ? ' · cannot be a 10' : ''}
        </p>
      )}
      <GhostButton className="mt-3" onClick={() => inputRef.current?.click()}>
        {file ? 'Replace photo' : 'Upload photo'}
      </GhostButton>
    </div>
  )
}
