import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BackBar, Screen } from '../components/Screen'
import { SearchField } from '../components/SearchField'
import { CardArt } from '../components/CardArt'
import { GhostButton, PrimaryButton } from '../components/Buttons'
import { ALL_CARDS, type Card } from '../data/seed'
import { resolveCardNumber } from '../lib/search'
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
import { chooseMeasure, hasPixelGeometry, measurePhoto, type PhotoResult, type PhotoSide, type Quad } from '../lib/centering'
import { loadPhotoFile } from '../lib/photoPixels'
import { downloadBlob, flattenedPhotoFile } from '../lib/saveFlatPhoto'
import { buildScores } from '../lib/gradeScore'
import { EdgeReadout } from '../components/EdgeReadout'
import { CenteringCanvas, GradeScores } from '../components/GradeScores'
import { PhotoGuide, PhotoTipLinks, usePhotoGuide } from '../components/PhotoGuide'
import { CameraCapture, cameraSupported, type CameraNote } from '../components/CameraCapture'
import { flagsOf, tipsForOutcome } from '../lib/photoGuide'
import {
  centeringLine,
  photoCentering,
  summariseCentering,
  unmeasured,
  type CenteringSummary,
  type PhotoCentering,
} from '../lib/centeringSummary'

const EN_ONLY_NOTE = 'Piecebook currently only has English card data and prices.'

export function PregradeScreen() {
  const [params] = useSearchParams()
  const debugSave = params.get('debug') === '1'
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const match = useMemo(() => resolveCardNumber(q), [q])
  const unknown = q.trim().length >= 3 && !match
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [photoError, setPhotoError] = useState<{ text: string; retry: boolean; blocked?: boolean } | null>(null)
  const [check, setCheck] = useState<VisionCheck | null>(null)
  const [frontDataUrl, setFrontDataUrl] = useState<string | null>(null)
  const [backDataUrl, setBackDataUrl] = useState<string | undefined>()
  // Shrunken photos from a refused check: typing the number still hands them to the card page.
  const [heldPhotos, setHeldPhotos] = useState<VisionPhotos | null>(null)
  // Measured on this phone the moment a photo is picked, before anything leaves; shown whatever the model says.
  const [frontMeasure, setFrontMeasure] = useState<SideMeasure | null>(null)
  const [backMeasure, setBackMeasure] = useState<SideMeasure | null>(null)
  const [measuring, setMeasuring] = useState(false)
  // Which side the guided camera should open on, or null when it is closed.
  const [cameraSide, setCameraSide] = useState<PhotoSide | null>(null)
  // What the camera did to each shot (glare retry, flatten), shown with the photo.
  const [frontNote, setFrontNote] = useState<CameraNote | null>(null)
  const [backNote, setBackNote] = useState<CameraNote | null>(null)
  const hasCamera = useMemo(cameraSupported, [])
  // The measurements that went with the last check, so confirm hands the card page the same numbers.
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
  const guide = usePhotoGuide()
  // Tips appear once a check has come back (or failed), never while the photos are only being measured.
  const resultTips = useMemo(
    () => (centering && (check || photoError) ? tipsForOutcome({ front: centering.front, back: centering.back, flags: flagsOf(check?.coverage === 'full' ? check.condition : null) }) : []),
    [centering, check, photoError],
  )

  const pickSide = async (file: File | null, side: PhotoSide, note: CameraNote | null = null) => {
    const set = side === 'front' ? setFrontMeasure : setBackMeasure
    const prev = side === 'front' ? frontMeasure : backMeasure
    prev?.bitmap?.close()
    if (side === 'front') {
      setFrontFile(file)
      setFrontNote(note)
    } else {
      setBackFile(file)
      setBackNote(note)
    }
    setCheck(null)
    setPhotoError(null)
    setCarriedCentering(null)
    if (!file) {
      set(null)
      return
    }
    setMeasuring(true)
    try {
      set(await measureSide(file, side, note))
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
    guide.markUsed()
    // Measured once, here, from the full-size file. The same result travels to the card page,
    // which never re-measures the shrunken copy it receives.
    const fm = frontMeasure ?? (await measureSide(frontFile, 'front', frontNote))
    const bm = backFile ? (backMeasure ?? (await measureSide(backFile, 'back', backNote))) : null
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

  /** Typed-number path: if a refused check left photos behind, the card page still measures them. */
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
        <PhotoGuide used={guide.used} open={guide.open} onToggle={guide.setOpen} />
        {hasCamera && (
          <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3">
            <p className="text-body text-ink">Use the camera: an outline to fit the card, hints as you go, and it shoots when the card is steady.</p>
            <p className="mt-1 text-meta text-muted">No light box needed: window light, a dark plain background, flash off. Upload still works.</p>
            <GhostButton className="mt-3" onClick={() => setCameraSide('front')}>
              Use camera
            </GhostButton>
          </div>
        )}
        <div className="mt-4 grid gap-4 tablet:grid-cols-2">
          <PhotoPick
            label="Front"
            file={frontFile}
            measure={frontMeasure}
            note={frontNote}
            side="front"
            debugSave={debugSave}
            onFile={(f) => void pickSide(f, 'front')}
            onCamera={hasCamera ? () => setCameraSide('front') : undefined}
          />
          <PhotoPick
            label="Back (optional)"
            file={backFile}
            measure={backMeasure}
            note={backNote}
            side="back"
            debugSave={debugSave}
            onFile={(f) => void pickSide(f, 'back')}
            onCamera={hasCamera ? () => setCameraSide('back') : undefined}
          />
        </div>
        {cameraSide && (
          <CameraCapture
            startSide={cameraSide}
            onCaptured={(side, file, note) => void pickSide(file, side, note)}
            onClose={() => setCameraSide(null)}
          />
        )}
        <PrimaryButton className="mt-4" disabled={!frontFile || busy || measuring} onClick={() => void runCheck()}>
          {busy ? 'Checking…' : measuring ? 'Measuring…' : 'Check photos'}
        </PrimaryButton>
        {centering && <CenteringBlock summary={centering} />}
        <PhotoTipLinks tips={resultTips} onOpen={guide.openTip} />
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
                  Your photos are kept for this visit: the card page still measures centering from them.
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
                out; the card page still measures centering from your photos.
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
        <p className="mt-1 text-meta text-muted">The photo check is a guess. You can always open a card by number.</p>
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
    </Screen>
  )
}

/** One side as measured on this phone: the summary that travels, plus the pixel geometry and bitmap for the overlay. */
interface SideMeasure {
  centering: PhotoCentering
  result: PhotoResult | null
  bitmap: ImageBitmap | null
}

/**
 * Centering from the full-size file on this phone. A photo that cannot be read
 * says so; nothing is ruled out. A camera shot that was flattened carries its
 * card corners, so the card is measured where it is known to be.
 */
async function measureSide(file: File, side: PhotoSide, note: CameraNote | null = null): Promise<SideMeasure> {
  try {
    const loaded = await loadPhotoFile(file)
    let outline: Quad | undefined
    if (note?.cardQuad && note.imageWidth > 0) {
      const scale = loaded.pixels.width / note.imageWidth
      outline = note.cardQuad.map((p) => ({ x: p.x * scale, y: p.y * scale })) as Quad
    }
    const guided = measurePhoto(loaded.pixels, side, { outline })
    const result = outline ? chooseMeasure(guided, measurePhoto(loaded.pixels, side)) : guided
    return { centering: photoCentering(result, side) ?? unmeasured(side, 'unreadable'), result, bitmap: loaded.bitmap }
  } catch {
    return { centering: unmeasured(side, 'unreadable'), result: null, bitmap: null }
  }
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
  note,
  side,
  debugSave,
  onFile,
  onCamera,
}: {
  label: string
  file: File | null
  measure: SideMeasure | null
  note: CameraNote | null
  side: PhotoSide
  debugSave?: boolean
  onFile: (f: File | null) => void
  onCamera?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)

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
      <EdgeReadout side={side} show={measure != null} detail={measure?.centering.detail} />
      {file && note && (
        <p className="mt-2 text-meta text-muted" data-testid={`camera-note-${side}`}>
          From the camera. {note.usedShot ? `${note.usedShot} ` : ''}
          {note.flattenNote}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2 tablet:flex-row">
        <GhostButton onClick={() => inputRef.current?.click()}>{file ? 'Replace photo' : 'Upload photo'}</GhostButton>
        {onCamera && (
          <GhostButton onClick={onCamera}>{file ? 'Retake with camera' : 'Use camera'}</GhostButton>
        )}
        {debugSave && (
          <GhostButton
            data-testid={`save-flat-${side}`}
            disabled={!file}
            onClick={() => {
              if (!file) return
              void flattenedPhotoFile(file, Boolean(note?.flattened), side).then((saved) => {
                downloadBlob(saved.blob, saved.name)
                setSaveNote(saved.note)
              })
            }}
          >
            Save flattened photo
          </GhostButton>
        )}
      </div>
      {debugSave && saveNote && <p className="mt-2 text-meta text-muted">{saveNote}</p>}
    </div>
  )
}
