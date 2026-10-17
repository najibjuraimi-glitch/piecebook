import { useCallback, useEffect, useRef, useState } from 'react'
import { GhostButton, PrimaryButton } from './Buttons'
import { findCardOutline, type PhotoSide, type PixelImage, type Quad } from '../lib/centering'
import {
  AUTO_CAPTURE_MS,
  CARD_RATIO,
  HINT_TEXT,
  assessFrame,
  flattenCard,
  glareReport,
  pickCleanerFrame,
  type FrameAssessment,
  type GlareReport,
  type HintCode,
} from '../lib/cardFrame'
import { fitForMeasure } from '../lib/photoPixels'

/** What the camera did to a shot, shown next to the photo so the collector knows what was measured. */
export interface CameraNote {
  /** `Used shot 2 of 2: the second, tilted shot had less glare`, when a glare retry happened. */
  usedShot?: string
  flattened: boolean
  /** Plain words on the flatten: done from the corners, or not done and why. */
  flattenNote: string
  /** Glare left on the frame that was kept. */
  glare: boolean
  /** Where the card sits in the file after the flatten, so it is measured there and not searched for again. */
  cardQuad?: Quad
  imageWidth: number
  imageHeight: number
}

export const CAMERA_TIPS = [
  'Window light, or a sheet of white paper to bounce light in',
  'Sleeve off, or a clean sleeve',
  'Dark, plain background',
] as const

/** Short side of the frames the live hints are read from. */
const ANALYSIS_SHORT_SIDE = 320
/** How often a live frame is read, ms. The next read waits for the last to finish. */
const ANALYSIS_EVERY_MS = 150

type Phase = 'starting' | 'live' | 'processing' | 'glare-retry' | 'review' | 'error'

interface Shot {
  pixels: PixelImage
  glare: GlareReport
}

interface ReviewState {
  side: PhotoSide
  url: string
  note: CameraNote
}

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

/** The visible part of the video once it is drawn with object-fit: cover into a box of this aspect. */
function visibleRect(videoW: number, videoH: number, boxW: number, boxH: number): { x: number; y: number; w: number; h: number } {
  if (!videoW || !videoH || !boxW || !boxH) return { x: 0, y: 0, w: videoW, h: videoH }
  const videoAspect = videoW / videoH
  const boxAspect = boxW / boxH
  if (videoAspect > boxAspect) {
    const w = videoH * boxAspect
    return { x: (videoW - w) / 2, y: 0, w, h: videoH }
  }
  const h = videoW / boxAspect
  return { x: 0, y: (videoH - h) / 2, w: videoW, h }
}

function errorText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was refused. You can still upload a photo.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. You can still upload a photo.'
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again, or upload a photo.'
  return 'The camera could not start. You can still upload a photo.'
}

/**
 * Guided camera for the pre-grade photos: rear camera, a 63 × 88 outline,
 * live hints read from the frames on this phone, auto-capture once the card
 * has been steady, sharp and glare-free for half a second, a glare retry, and
 * a projective flatten before the shot is handed back as a JPEG file. Flash
 * and torch are never asked for. Nothing here grades the card.
 */
export function CameraCapture({
  startSide,
  onCaptured,
  onClose,
}: {
  startSide: PhotoSide
  onCaptured: (side: PhotoSide, file: File, note: CameraNote) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analysisCanvas = useRef<HTMLCanvasElement | null>(null)
  const readySinceRef = useRef<number | null>(null)
  const phaseRef = useRef<Phase>('starting')
  const pendingShot = useRef<Shot | null>(null)
  const sideRef = useRef<PhotoSide>(startSide)

  const [phase, setPhaseState] = useState<Phase>('starting')
  const [side, setSideState] = useState<PhotoSide>(startSide)
  const [error, setError] = useState<string | null>(null)
  const [frame, setFrame] = useState<FrameAssessment | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 })
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 })
  const [review, setReview] = useState<ReviewState | null>(null)
  const [retrying, setRetrying] = useState(false)

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhaseState(p)
  }, [])
  const setSide = useCallback((s: PhotoSide) => {
    sideRef.current = s
    setSideState(s)
  }, [])

  // Lock the page behind the viewfinder.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Size of the viewfinder box, for the cover crop.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setBoxSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Start the rear camera. No torch, no flash: a lit card is read, a flashed one is glare.
  useEffect(() => {
    let cancelled = false
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play().catch(() => undefined)
        setVideoSize({ w: video.videoWidth, h: video.videoHeight })
        setPhase('live')
      } catch (err) {
        if (cancelled) return
        setError(errorText(err))
        setPhase('error')
      }
    }
    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [setPhase])

  const grabFrame = useCallback(
    (shortSide: number | null): PixelImage | null => {
      const video = videoRef.current
      if (!video || !video.videoWidth || !video.videoHeight) return null
      const vis = visibleRect(video.videoWidth, video.videoHeight, boxSize.w, boxSize.h)
      let outW: number
      let outH: number
      if (shortSide) {
        const scale = shortSide / Math.min(vis.w, vis.h)
        outW = Math.max(1, Math.round(vis.w * scale))
        outH = Math.max(1, Math.round(vis.h * scale))
      } else {
        const fit = fitForMeasure(Math.round(vis.w), Math.round(vis.h))
        outW = fit.width
        outH = fit.height
      }
      const canvas = shortSide ? (analysisCanvas.current ??= document.createElement('canvas')) : document.createElement('canvas')
      if (canvas.width !== outW || canvas.height !== outH) {
        canvas.width = outW
        canvas.height = outH
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(video, vis.x, vis.y, vis.w, vis.h, 0, 0, outW, outH)
      const data = ctx.getImageData(0, 0, outW, outH)
      return { width: outW, height: outH, data: data.data }
    },
    [boxSize],
  )

  const finishShot = useCallback(
    async (shot: Shot, usedShot: string | undefined) => {
      const flat = flattenCard(shot.pixels)
      const note: CameraNote = {
        usedShot,
        flattened: flat.flattened,
        flattenNote: flat.flattened
          ? flat.outline.keystoneDeg > 8
            ? 'Flattened from the four corners: the shot was at an angle, so centering was measured on the straightened card.'
            : 'Flattened from the four corners.'
          : 'Card corners were not found, so the raw frame was kept: centering may be less accurate.',
        glare: shot.glare.glare,
        cardQuad: flat.flattened ? flat.cardQuad : undefined,
        imageWidth: flat.image.width,
        imageHeight: flat.image.height,
      }
      const canvas = document.createElement('canvas')
      canvas.width = flat.image.width
      canvas.height = flat.image.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.putImageData(new ImageData(new Uint8ClampedArray(flat.image.data), flat.image.width, flat.image.height), 0, 0)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) return
      const which = sideRef.current
      const file = new File([blob], `${which}-camera.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
      onCaptured(which, file, note)
      setReview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { side: which, url: URL.createObjectURL(blob), note }
      })
      setPhase('review')
    },
    [onCaptured, setPhase],
  )

  const capture = useCallback(async () => {
    if (phaseRef.current !== 'live') return
    setPhase('processing')
    readySinceRef.current = null
    setHoldProgress(0)
    // Let the "Processing" frame paint before the heavy work.
    await new Promise((r) => window.setTimeout(r, 30))
    const pixels = grabFrame(null)
    if (!pixels) {
      setPhase('live')
      return
    }
    const outline = findCardOutline(pixels)
    const glare = glareReport(pixels, outline.ok ? outline.outline.quad : undefined)
    const shot: Shot = { pixels, glare }
    const first = pendingShot.current
    if (first) {
      pendingShot.current = null
      setRetrying(false)
      const pick = pickCleanerFrame(first.glare, glare)
      const kept = pick.index === 0 ? first : shot
      await finishShot(kept, `Used shot ${pick.index + 1} of 2: ${pick.reason}.`)
      return
    }
    if (glare.glare) {
      pendingShot.current = shot
      setPhase('glare-retry')
      return
    }
    await finishShot(shot, undefined)
  }, [finishShot, grabFrame, setPhase])

  // Live loop: read a small frame, show hints, fire the shutter after a steady half second.
  useEffect(() => {
    if (phase !== 'live') return
    let stopped = false
    let timer = 0
    const tick = () => {
      if (stopped || phaseRef.current !== 'live') return
      const video = videoRef.current
      if (video && (video.videoWidth !== videoSize.w || video.videoHeight !== videoSize.h)) {
        setVideoSize({ w: video.videoWidth, h: video.videoHeight })
      }
      const pixels = grabFrame(ANALYSIS_SHORT_SIDE)
      if (pixels) {
        const a = assessFrame(pixels)
        setFrame(a)
        const now = performance.now()
        if (a.ready) {
          readySinceRef.current ??= now
          const held = now - readySinceRef.current
          setHoldProgress(Math.min(1, held / AUTO_CAPTURE_MS))
          if (held >= AUTO_CAPTURE_MS) {
            void capture()
            return
          }
        } else {
          readySinceRef.current = null
          setHoldProgress(0)
        }
      }
      timer = window.setTimeout(tick, ANALYSIS_EVERY_MS)
    }
    timer = window.setTimeout(tick, ANALYSIS_EVERY_MS)
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [phase, grabFrame, capture, videoSize])

  useEffect(
    () => () => {
      setReview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return null
      })
    },
    [],
  )

  const close = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    onClose()
  }

  const retake = () => {
    pendingShot.current = null
    setRetrying(false)
    setFrame(null)
    setPhase('live')
  }

  const nextSide = () => {
    if (side === 'front') {
      setSide('back')
      retake()
    } else {
      close()
    }
  }

  const shootAgainForGlare = () => {
    setRetrying(true)
    setFrame(null)
    setPhase('live')
  }

  const useGlareShotAnyway = () => {
    const shot = pendingShot.current
    pendingShot.current = null
    if (!shot) {
      setPhase('live')
      return
    }
    setPhase('processing')
    void finishShot(shot, undefined)
  }

  const vis = visibleRect(videoSize.w, videoSize.h, boxSize.w, boxSize.h)
  const frameToVideo = frame?.outline && vis.w ? vis.w / Math.round(vis.w * (ANALYSIS_SHORT_SIDE / Math.min(vis.w, vis.h))) : 1
  const quadPoints = (q: Quad) => q.map((p) => `${vis.x + p.x * frameToVideo},${vis.y + p.y * frameToVideo}`).join(' ')
  // The 63 × 88 guide: 72% of the visible height, or less when the view is narrow.
  const guideH = Math.min(vis.h * 0.72, (vis.w * 0.84) / CARD_RATIO)
  const guideW = guideH * CARD_RATIO
  const guideX = vis.x + (vis.w - guideW) / 2
  const guideY = vis.y + (vis.h - guideH) / 2
  const hint: HintCode | null = frame && !frame.ready ? frame.hints[0] : null
  const ready = Boolean(frame?.ready)
  const stepLabel = side === 'front' ? 'Front · 1 of 2' : 'Back · 2 of 2'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-[15px] font-medium">{stepLabel}</p>
        <div className="flex items-center gap-3">
          <span className="text-meta text-white/70">Flash off</span>
          <button type="button" onClick={close} className="min-h-[44px] min-w-[44px] rounded-xl text-[15px] font-medium text-white/90 hover:bg-white/10" aria-label="Close camera">
            Close
          </button>
        </div>
      </div>

      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {/* Always mounted: the stream stays attached through review so a retake is instant. */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 h-full w-full object-cover ${phase === 'review' ? 'invisible' : ''}`}
          data-testid="camera-video"
        />
        {phase === 'review' && review && <img src={review.url} alt="" className="absolute inset-0 h-full w-full object-contain object-top" />}

        {(phase === 'live' || phase === 'processing' || phase === 'glare-retry') && videoSize.w > 0 && boxSize.w > 0 && (
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`${vis.x} ${vis.y} ${vis.w} ${vis.h}`}
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <rect
              x={guideX}
              y={guideY}
              width={guideW}
              height={guideH}
              rx={vis.w * 0.012}
              fill="none"
              stroke={ready ? '#5BD38A' : 'rgba(255,255,255,0.85)'}
              strokeWidth={vis.w * 0.006}
              strokeDasharray={ready ? undefined : `${vis.w * 0.03} ${vis.w * 0.015}`}
            />
            {frame?.outline && (
              <g data-testid="detected-outline">
                <polygon
                  points={quadPoints(frame.outline.quad)}
                  fill={ready ? 'rgba(91,211,138,0.14)' : 'rgba(245,177,75,0.10)'}
                  stroke={ready ? '#5BD38A' : '#F5B14B'}
                  strokeWidth={vis.w * 0.006}
                  strokeLinejoin="round"
                />
                {frame.outline.quad.map((p, i) => (
                  <circle key={i} cx={vis.x + p.x * frameToVideo} cy={vis.y + p.y * frameToVideo} r={vis.w * 0.014} fill={ready ? '#5BD38A' : '#F5B14B'} />
                ))}
              </g>
            )}
          </svg>
        )}

        {phase === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-body text-white/80">Starting the camera…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-body text-white/90" role="alert">
              {error}
            </p>
            <GhostButton className="!w-auto !border-white/40 !text-white hover:!bg-white/10" onClick={close}>
              Back to upload
            </GhostButton>
          </div>
        )}

        {phase === 'live' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-4">
            {retrying && (
              <p className="rounded-full bg-amber-400/90 px-3 py-1 text-center text-meta font-medium text-black">
                Second shot: tilt the card a little, then hold still or tap the shutter
              </p>
            )}
            <p
              className={`max-w-[34ch] rounded-2xl px-4 py-2 text-center text-[15px] font-medium leading-5 ${ready ? 'bg-[#1F7A4C]/90' : 'bg-black/70'}`}
              aria-live="polite"
              data-testid="camera-hint"
            >
              {ready ? 'Hold still…' : hint ? HINT_TEXT[hint] : 'Looking for the card…'}
            </p>
            {ready && (
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
                <div className="h-full bg-[#5BD38A] transition-[width] duration-150 ease-linear" style={{ width: `${Math.round(holdProgress * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        {phase === 'processing' && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4">
            <p className="rounded-2xl bg-black/70 px-4 py-2 text-[15px] font-medium">Reading the card…</p>
          </div>
        )}

        {phase === 'glare-retry' && (
          <div className="absolute inset-x-0 bottom-0 px-4 pb-4" data-testid="glare-retry">
            <div className="rounded-2xl bg-black/80 px-4 py-3">
              <p className="text-[15px] font-medium leading-5">Glare on the card.</p>
              <p className="mt-1 text-body text-white/85">
                Take a second shot with the card tilted a little, away from the light. The cleaner of the two is kept, and you will see which.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <PrimaryButton onClick={shootAgainForGlare}>Shoot again, tilted</PrimaryButton>
                <GhostButton className="!border-white/40 !text-white hover:!bg-white/10" onClick={useGlareShotAnyway}>
                  Use this shot anyway
                </GhostButton>
              </div>
            </div>
          </div>
        )}

        {phase === 'review' && review && (
          <div className="absolute inset-x-0 bottom-0 px-4 pb-4" data-testid="camera-review">
            <div className="rounded-2xl bg-black/80 px-4 py-3">
              <p className="text-[15px] font-medium leading-5">{review.side === 'front' ? 'Front' : 'Back'} captured</p>
              {review.note.usedShot && <p className="mt-1 text-body text-white/85">{review.note.usedShot}</p>}
              <p className="mt-1 text-body text-white/85">{review.note.flattenNote}</p>
              {review.note.glare && <p className="mt-1 text-body text-amber-300">Some glare stayed on the card; the model may read less of the surface.</p>}
              <p className="mt-2 text-meta text-white/60">Centering is measured from this file on your phone. An AI estimate, not a grade.</p>
              <div className="mt-3 flex flex-col gap-2">
                <PrimaryButton onClick={nextSide}>{review.side === 'front' ? 'Next: the back' : 'Done'}</PrimaryButton>
                <div className="flex gap-2">
                  <GhostButton className="!border-white/40 !text-white hover:!bg-white/10" onClick={retake}>
                    Retake
                  </GhostButton>
                  {review.side === 'front' && (
                    <GhostButton className="!border-white/40 !text-white hover:!bg-white/10" onClick={close}>
                      Skip the back
                    </GhostButton>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {/* Kept in the layout in every phase so the viewfinder does not change size (and scale) between them. */}
        {phase !== 'error' && (
          <div className={`flex items-center justify-between gap-3 ${phase === 'live' || phase === 'processing' ? '' : 'invisible'}`}>
            <button type="button" onClick={close} className="min-h-[44px] rounded-xl px-2 text-[14px] text-white/80 hover:bg-white/10">
              Upload instead
            </button>
            <button
              type="button"
              onClick={() => void capture()}
              disabled={phase !== 'live'}
              aria-label="Take photo"
              data-testid="shutter"
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/90 disabled:opacity-50"
            >
              <span className={`block h-[56px] w-[56px] rounded-full ${ready ? 'bg-[#5BD38A]' : 'bg-white'}`} />
            </button>
            {side === 'front' ? (
              <span className="min-h-[44px] w-[96px]" aria-hidden="true" />
            ) : (
              <button type="button" onClick={close} className="min-h-[44px] rounded-xl px-2 text-[14px] text-white/80 hover:bg-white/10">
                Skip the back
              </button>
            )}
          </div>
        )}
        <ul className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-meta text-white/60" aria-label="Tips">
          {CAMERA_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
