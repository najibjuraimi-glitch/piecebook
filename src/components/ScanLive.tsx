import { useCallback, useEffect, useRef, useState } from 'react'
import { VISION_URL } from '../config/vision'
import { compareFrames, dryStreakAfterDiscard, emptySeen, forgetsSeenCards, frameTooDark, greyDownscale, initialSceneHold, labelOffset, markSceneScanned, MOVED_HOLD_AFTER, MOVED_HOLD_MS, nextDryStreak, placeRead, rearmAfterDiscard, resetsMovedHold, resumesPausedScan, scanIntervalOpen, sceneMoved, stepDarkState, stepFrameHold, stepSceneHold, unreadBoxMotion, unreadSlabsAreNew, type GreyFrame, type SceneHold } from '../lib/cardFrame'
import type { PixelImage } from '../lib/centering'
import { overlayForCard, placeOverlayLabels, type BookPrice, type LabelTone } from '../lib/scanLabel'
import type { ScanSummary, WatchTarget } from '../lib/scanMatch'

const SHUTTER_WAIT_MS = 1500

export interface LiveShot {
  scan: ScanSummary
  file: File
  targets: WatchTarget[]
}

export interface LiveScanOk {
  ok: true
  scan: ScanSummary
  usage: { today: number; cap: number } | null
  targets: WatchTarget[]
}

export type LiveScanResult = LiveScanOk | { ok: false; error: string; code?: string }

const TONE: Record<LabelTone, string> = {
  green: 'border-[#0B6B3A] bg-[#C8F5D8] text-[#062814]',
  amber: 'border-[#8A5A00] bg-[#FFE08A] text-[#2A1C00]',
  neutral: 'border-black bg-white text-black',
  muted: 'border-[#4A4A4A] bg-[#D9D9D9] text-[#1A1A1A]',
}

function cameraErrorText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was refused. You can still upload a photo.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. You can still upload a photo.'
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again, or upload a photo.'
  return 'The camera could not start. You can still upload a photo.'
}

function contained(videoW: number, videoH: number, boxW: number, boxH: number) {
  if (!videoW || !videoH || !boxW || !boxH) return { x: 0, y: 0, w: boxW, h: boxH }
  const scale = Math.min(boxW / videoW, boxH / videoH)
  const w = videoW * scale
  const h = videoH * scale
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h }
}

function analysisFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): PixelImage | null {
  const srcW = video.videoWidth
  const srcH = video.videoHeight
  if (!srcW || !srcH) return null
  const scale = 160 / Math.min(srcW, srcH)
  const outW = Math.max(1, Math.round(srcW * scale))
  const outH = Math.max(1, Math.round(srcH * scale))
  if (canvas.width !== outW || canvas.height !== outH) {
    canvas.width = outW
    canvas.height = outH
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, srcW, srcH, 0, 0, outW, outH)
  const data = ctx.getImageData(0, 0, outW, outH)
  return { width: outW, height: outH, data: data.data }
}

async function captureStill(video: HTMLVideoElement, stream: MediaStream): Promise<Blob | null> {
  const track = stream.getVideoTracks()[0]
  const Ctor = (globalThis as { ImageCapture?: new (track: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }).ImageCapture
  if (track && Ctor) {
    try {
      const blob = await new Ctor(track).takePhoto()
      if (blob.size > 0) return blob
    } catch {
      /* The preview frame is the fallback when the still camera is missing. */
    }
  }
  const srcW = video.videoWidth
  const srcH = video.videoHeight
  if (!srcW || !srcH) return null
  const canvas = document.createElement('canvas')
  canvas.width = srcW
  canvas.height = srcH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, srcW, srcH)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92))
}

/**
 * Rear camera for a case. A steady second sends one full-resolution frame.
 * The same still view is not scanned again, and automatic scans wait four seconds apart.
 * Three scans with no new card pause until the phone moves or you tap.
 */
export function ScanLive({
  jpRows,
  onScan,
  onAbort,
  onClose,
  onFreeze,
  onUpload,
  onUnavailable,
}: {
  jpRows: BookPrice[]
  onScan: (file: File) => Promise<LiveScanResult>
  onAbort: () => void
  onClose: () => void
  onFreeze: (shot: LiveShot) => void
  onUpload: () => void
  onUnavailable: (message: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analysisCanvas = useRef<HTMLCanvasElement | null>(null)
  const holdRef = useRef<SceneHold>(initialSceneHold())
  const lastScanAt = useRef<number | null>(null)
  const busyRef = useRef(false)
  const failuresRef = useRef(0)
  const seenCards = useRef(emptySeen())
  const seenFrame = useRef<GreyFrame | null>(null)
  const pauseAnchor = useRef<GreyFrame | null>(null)
  const movedReads = useRef(0)
  const prevTickFrame = useRef<GreyFrame | null>(null)
  const frameSteadySince = useRef<number | null>(null)
  const heldRef = useRef(false)
  const dryStreak = useRef(0)
  const autoPausedRef = useRef(false)
  const usageFromScan = useRef(false)
  const onAbortRef = useRef(onAbort)
  onAbortRef.current = onAbort
  const sendRef = useRef<(manual: boolean) => Promise<void>>(async () => {})
  const unavailableRef = useRef(onUnavailable)
  unavailableRef.current = onUnavailable

  const [phase, setPhase] = useState<'starting' | 'live' | 'error'>('starting')
  const [paused, setPaused] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [dim, setDim] = useState(false)
  const [reading, setReading] = useState(false)
  const [readPct, setReadPct] = useState(0)
  const [readError, setReadError] = useState<string | null>(null)
  const [autoPaused, setAutoPaused] = useState(false)
  const [held, setHeld] = useState(false)
  const [labelShift, setLabelShift] = useState({ x: 0, y: 0 })
  const [shot, setShot] = useState<LiveShot | null>(null)
  const [labelsCurrent, setLabelsCurrent] = useState(false)
  const [shutterReady, setShutterReady] = useState(false)
  const [tooDark, setTooDark] = useState(false)
  const tooDarkRef = useRef(false)
  const darkBrightSince = useRef<number | null>(null)
  const shutterReadyRef = useRef(false)
  const queuedTap = useRef(false)
  const shutterTimer = useRef(0)
  const [usage, setUsage] = useState<{ today: number; cap: number } | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 })
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 })
  const rowsRef = useRef(jpRows)
  rowsRef.current = jpRows

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => () => onAbortRef.current(), [])

  useEffect(() => {
    if (!reading) {
      setReadPct(0)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(() => {
      setReadPct(Math.min(1, (Date.now() - started) / 30000))
    }, 200)
    return () => window.clearInterval(timer)
  }, [reading])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setBoxSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    let videoEl: HTMLVideoElement | null = null
    let markLive: (() => void) | null = null
    const open = async () => {
      const high = { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } }
      const plain = { audio: false, video: { facingMode: { ideal: 'environment' } } }
      try {
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia(high)
        } catch (err) {
          if (!(err instanceof DOMException) || err.name !== 'OverconstrainedError') throw err
          stream = await navigator.mediaDevices.getUserMedia(plain)
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        videoEl = video
        video.srcObject = stream
        markLive = () => {
          if (cancelled || !video.videoWidth) return
          setVideoSize({ w: video.videoWidth, h: video.videoHeight })
          setPhase('live')
        }
        video.addEventListener('loadedmetadata', markLive)
        video.addEventListener('resize', markLive)
        void video.play().then(markLive).catch(() => undefined)
        window.clearTimeout(shutterTimer.current)
        shutterTimer.current = window.setTimeout(() => {
          shutterReadyRef.current = true
          setShutterReady(true)
          if (queuedTap.current) {
            queuedTap.current = false
            void sendRef.current(true)
          }
        }, SHUTTER_WAIT_MS)
      } catch (err) {
        if (cancelled) return
        unavailableRef.current(cameraErrorText(err))
      }
    }
    void open()
    return () => {
      cancelled = true
      window.clearTimeout(shutterTimer.current)
      if (videoEl && markLive) {
        videoEl.removeEventListener('loadedmetadata', markLive)
        videoEl.removeEventListener('resize', markLive)
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const frameGrey = useCallback((): GreyFrame | null => {
    const video = videoRef.current
    if (!video) return null
    const canvas = (analysisCanvas.current ??= document.createElement('canvas'))
    const pixels = analysisFrame(video, canvas)
    return pixels ? greyDownscale(pixels) : null
  }, [])

  const clearAutoPause = useCallback(() => {
    autoPausedRef.current = false
    pauseAnchor.current = null
    dryStreak.current = 0
    setAutoPaused(false)
  }, [])

  const forgetSeen = () => {
    seenCards.current = emptySeen()
    seenFrame.current = null
    dryStreak.current = 0
  }

  const armShutter = useCallback(() => {
    shutterReadyRef.current = false
    setShutterReady(false)
    window.clearTimeout(shutterTimer.current)
    shutterTimer.current = window.setTimeout(() => {
      shutterReadyRef.current = true
      setShutterReady(true)
      if (queuedTap.current) {
        queuedTap.current = false
        void sendRef.current(true)
      }
    }, SHUTTER_WAIT_MS)
  }, [])

  const send = useCallback(
    async (manual: boolean) => {
      if (busyRef.current) return
      if (manual && !shutterReadyRef.current) {
        queuedTap.current = true
        return
      }
      if (!manual && (tooDarkRef.current || autoPausedRef.current || !scanIntervalOpen(lastScanAt.current, Date.now()))) return
      const video = videoRef.current
      const stream = streamRef.current
      if (!video || !stream) return
      busyRef.current = true
      if (heldRef.current) {
        if (manual) {
          movedReads.current = 0
          frameSteadySince.current = null
        }
        heldRef.current = false
        setHeld(false)
      }
      if (!manual) holdRef.current = markSceneScanned(holdRef.current)
      const signature = frameGrey()
      setReading(true)
      if (manual) {
        shutterReadyRef.current = false
        setShutterReady(false)
      }
      try {
        const blob = await captureStill(video, stream)
        if (!blob) {
          if (!manual) holdRef.current = { ...holdRef.current, scanned: false }
          return
        }
        const file = new File([blob], 'scan-camera.jpg', { type: 'image/jpeg', lastModified: Date.now() })
        const result = await onScan(file)
        if (!result.ok && result.code === 'aborted') {
          if (!manual) holdRef.current = { ...holdRef.current, scanned: false }
          return
        }
        lastScanAt.current = Date.now()
        if (!result.ok) {
          failuresRef.current += 1
          if (failuresRef.current >= 2) holdRef.current = markSceneScanned(holdRef.current)
          else if (!manual) holdRef.current = { ...holdRef.current, scanned: false }
          setReadError(result.error)
          if (result.code === 'daily_cap_reached') setBlocked(true)
          return
        }
        failuresRef.current = 0
        const nowFrame = frameGrey()
        const motion = signature && nowFrame ? compareFrames(signature, nowFrame) : null
        const show = placeRead(motion) === 'show'
        setReadError(null)
        setShot({ scan: result.scan, file, targets: result.targets })
        if (result.usage) {
          usageFromScan.current = true
          setUsage(result.usage)
        }
        setDim(false)
        if (motion && sceneMoved(motion)) movedReads.current += 1
        else movedReads.current = 0
        if (movedReads.current >= MOVED_HOLD_AFTER) {
          heldRef.current = true
          frameSteadySince.current = null
          setHeld(true)
        } else if (heldRef.current) {
          heldRef.current = false
          setHeld(false)
        }
        if (!show) {
          setLabelsCurrent(false)
          setLabelShift({ x: 0, y: 0 })
          if (forgetsSeenCards(motion)) forgetSeen()
          holdRef.current = rearmAfterDiscard(holdRef.current)
          const dry = dryStreakAfterDiscard(dryStreak.current, motion)
          if (dry) {
            dryStreak.current = dry.streak
            if (dry.pause) {
              autoPausedRef.current = true
              // A missing frame must not keep the anchor from an older photo.
              pauseAnchor.current = nowFrame
              setAutoPaused(true)
            }
          }
        } else {
          const width = signature?.width ?? nowFrame?.width ?? 1
          const height = signature?.height ?? nowFrame?.height ?? 1
          setLabelsCurrent(true)
          setLabelShift(labelOffset(motion, width, height) ?? { x: 0, y: 0 })
          const current = signature ?? nowFrame
          const from = seenFrame.current
          const between = from && current ? compareFrames(from, current) : null
          if (forgetsSeenCards(between)) forgetSeen()
          const unreadAreNew = unreadSlabsAreNew(between)
          const boxMotion = unreadAreNew ? null : unreadBoxMotion(between, from?.width ?? width, from?.height ?? height)
          const outcome = nextDryStreak(seenCards.current, dryStreak.current, result.scan.cards, boxMotion, unreadAreNew)
          seenCards.current = outcome.seen
          if (current) seenFrame.current = current
          dryStreak.current = outcome.streak
          if (outcome.pause) {
            autoPausedRef.current = true
            if (nowFrame) pauseAnchor.current = nowFrame
            setAutoPaused(true)
          } else if (outcome.streak === 0) {
            autoPausedRef.current = false
            setAutoPaused(false)
          }
        }
      } finally {
        busyRef.current = false
        setReading(false)
        if (manual) armShutter()
      }
    },
    [armShutter, frameGrey, onScan],
  )
  sendRef.current = send

  useEffect(() => {
    let cancel = false
    void fetch(`${VISION_URL}/scan`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data: { usage?: { today?: number; cap?: number } }) => {
        if (cancel || usageFromScan.current || typeof data?.usage?.cap !== 'number') return
        setUsage({ today: Number(data.usage.today) || 0, cap: data.usage.cap })
      })
      .catch(() => undefined)
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (phase !== 'live' || paused || blocked) return
    let stopped = false
    let timer = 0
    const tick = () => {
      if (stopped) return
      const video = videoRef.current
      const canvas = (analysisCanvas.current ??= document.createElement('canvas'))
      if (video) {
        const pixels = analysisFrame(video, canvas)
        if (pixels) {
          const frame = greyDownscale(pixels)
          const now = Date.now()
          const nextDark = stepDarkState(tooDarkRef.current, darkBrightSince.current, !frameTooDark(frame), now)
          darkBrightSince.current = nextDark.brightSince
          const dark = nextDark.dark
          if (dark !== tooDarkRef.current) {
            tooDarkRef.current = dark
            setTooDark(dark)
          }
          const step = stepSceneHold(holdRef.current, frame, now)
          holdRef.current = step.state
          if (autoPausedRef.current && pauseAnchor.current) {
            const fromPause = compareFrames(pauseAnchor.current, frame)
            if (resumesPausedScan(fromPause)) {
              forgetSeen()
              autoPausedRef.current = false
              pauseAnchor.current = null
              setAutoPaused(false)
              failuresRef.current = 0
              holdRef.current = { anchor: frame, steadySince: now, misses: 0, scanned: false }
            }
          }
          if (step.moved) {
            failuresRef.current = 0
            setDim(true)
            if (forgetsSeenCards(step.motion)) forgetSeen()
          } else if (step.steady) setDim(false)
          if (!dark && movedReads.current >= MOVED_HOLD_AFTER) {
            const hop = prevTickFrame.current ? compareFrames(prevTickFrame.current, frame) : null
            const hopped = resetsMovedHold(hop)
            const settled = stepFrameHold(frameSteadySince.current, hopped, now, MOVED_HOLD_MS)
            frameSteadySince.current = settled.since
            if (!heldRef.current) {
              heldRef.current = true
              setHeld(true)
            }
            if (settled.ready && !autoPausedRef.current) void sendRef.current(false)
          } else if (!dark && step.ready && !autoPausedRef.current) {
            void sendRef.current(false)
          }
          prevTickFrame.current = frame
        }
      }
      timer = window.setTimeout(tick, 200)
    }
    timer = window.setTimeout(tick, 200)
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [phase, paused, blocked])

  const place = contained(videoSize.w, videoSize.h, boxSize.w, boxSize.h)
  const capLeft = usage ? Math.max(0, usage.cap - usage.today) : null
  const lowCap = capLeft != null && capLeft <= 10
  const scan = labelsCurrent ? shot?.scan ?? null : null
  const spots = placeOverlayLabels(
    (scan?.cards ?? []).filter((card) => card.box).map((card) => ({
      index: card.index,
      x: (card.box!.x + labelShift.x) * place.w,
      y: (card.box!.y + labelShift.y) * place.h,
    })),
    { x: place.x, y: place.y, w: place.w, h: place.h },
  )
  const spotFor = new Map(spots.map((spot) => [spot.index, spot]))
  const openCard = shot?.scan.cards.find((card) => card.index === openIndex) ?? null
  const openLabel = openCard ? overlayForCard(openCard, rowsRef.current) : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Live scan" data-testid="scan-live">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className={`rounded-full px-3 py-1 text-[17px] font-semibold ${lowCap ? 'bg-amber-300 text-black' : 'bg-black/80 text-white'}`} data-testid="scan-cap" data-low={lowCap ? 'true' : 'false'}>
          {capLeft == null ? 'Live' : `${capLeft} left`}
        </p>
        <button type="button" onClick={onClose} disabled={reading} className="min-h-12 min-w-12 rounded-xl px-3 text-[17px] font-semibold disabled:opacity-40" aria-label="Close camera">
          Close
        </button>
      </div>
      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-contain" data-testid="scan-video" />
        {labelsCurrent && scan?.cards.map((card) => {
          if (!card.box) return null
          const chip = overlayForCard(card, jpRows)
          const spot = spotFor.get(card.index)
          if (!spot) return null
          return (
            <button
              key={card.index}
              type="button"
              data-testid={`scan-label-${card.index}`}
              data-tone={chip.tone}
              onClick={() => setOpenIndex((current) => (current === card.index ? null : card.index))}
              className={`absolute max-w-[78%] rounded-xl border-2 px-3 py-2 text-left shadow-[0_2px_0_rgba(0,0,0,0.85)] transition-opacity duration-200 ${TONE[chip.tone]} ${dim ? 'opacity-20' : 'opacity-100'}`}
              style={{ left: `${spot.left}px`, top: `${spot.top}px` }}
            >
              <span className="block text-[13px] font-bold tracking-wide">{chip.languageTag}</span>
              <span className="block text-[17px] font-semibold leading-5">
                {chip.code} · {chip.grade}
              </span>
              <span className="block text-[16px] font-semibold leading-5">{chip.price}</span>
              {chip.sticker && <span className="block text-[15px] font-medium leading-5">Sticker {chip.sticker}</span>}
            </button>
          )
        })}
        {phase === 'starting' && <p className="absolute inset-x-0 top-6 text-center text-[17px] font-medium text-white">Starting the camera…</p>}
        {reading && (
          <div className="absolute inset-x-6 top-6" data-testid="scan-reading">
            <p className="text-center text-[17px] font-semibold text-white">reading case, about 30s</p>
            <div
              className="mx-auto mt-2 h-2 max-w-xs overflow-hidden rounded-full bg-white/30"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={30}
              aria-valuenow={readPct >= 1 ? undefined : Math.round(readPct * 30)}
              aria-valuetext={readPct >= 1 ? 'still reading' : undefined}
              data-indeterminate={readPct >= 1 ? 'true' : 'false'}
            >
              <div className={`h-full bg-white ${readPct >= 1 ? 'scan-read-bar w-1/3' : ''}`} style={readPct >= 1 ? undefined : { width: `${readPct * 100}%` }} />
            </div>
          </div>
        )}
        {tooDark && !reading && (
          <button type="button" data-testid="scan-dark" onClick={() => void sendRef.current(true)} className="absolute inset-x-4 bottom-4 rounded-xl bg-white px-3 py-3 text-center text-[16px] font-semibold text-black">
            Too dark to track, add light or tap to scan
          </button>
        )}
        {held && !reading && !autoPaused && !tooDark && (
          <button type="button" data-testid="scan-settle" onClick={() => void sendRef.current(true)} className="absolute inset-x-4 bottom-4 rounded-xl bg-white px-3 py-3 text-center text-[16px] font-semibold text-black">
            Hold still, tap to scan
          </button>
        )}
        {autoPaused && (
          <button type="button" data-testid="scan-hold" onClick={clearAutoPause} className="absolute inset-x-4 top-16 rounded-xl bg-white px-3 py-3 text-center text-[16px] font-semibold text-black">
            Paused to save scans, move or tap to resume
          </button>
        )}
        {shot && !labelsCurrent && !autoPaused && <p className="absolute inset-x-4 top-16 text-center text-[16px] font-semibold text-white" data-testid="scan-moved">moved, rescanning</p>}
        {readError && (
          <p className="absolute inset-x-4 top-16 rounded-xl bg-black/80 px-3 py-2 text-center text-[16px] font-medium" role="alert">
            {readError}
          </p>
        )}
        {openCard && openLabel && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl border-2 border-black bg-white p-4 text-black" data-testid="scan-row">
            <p className="text-[20px] font-semibold leading-6">{openCard.name || 'Card'}</p>
            <p className="mt-1 text-[17px] font-semibold">
              {openLabel.languageTag} · {openLabel.code} · {openLabel.grade}
            </p>
            <p className="mt-1 text-[17px]">
              {openLabel.price}
              {openLabel.sticker ? ` · sticker ${openLabel.sticker}` : ''}
            </p>
            {openCard.drag && <p className="mt-1 text-[15px]">{openCard.drag}</p>}
            <button type="button" onClick={() => setOpenIndex(null)} className="mt-3 min-h-12 text-[17px] font-semibold underline">
              Close
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          data-testid="scan-pause"
          onClick={() => {
            if (autoPaused && !paused) {
              clearAutoPause()
              return
            }
            setPaused((value) => !value)
          }}
          className="min-h-14 flex-1 rounded-xl bg-white text-[17px] font-semibold text-black"
        >
          {paused || autoPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          data-testid="scan-shutter"
          aria-label="Take photo"
          disabled={reading || !shutterReady}
          onClick={() => void send(true)}
          className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border-4 border-white disabled:opacity-40"
        >
          <span className="block h-14 w-14 rounded-full bg-white" />
        </button>
        <button
          type="button"
          data-testid="scan-freeze"
          disabled={reading || !shot}
          onClick={() => {
            if (shot) onFreeze(shot)
          }}
          className="min-h-14 flex-1 rounded-xl bg-white text-[17px] font-semibold text-black disabled:opacity-40"
        >
          Freeze
        </button>
        <button type="button" data-testid="scan-upload" onClick={onUpload} disabled={reading} className="min-h-14 rounded-xl px-2 text-[15px] font-semibold text-white disabled:opacity-40">
          Upload
        </button>
      </div>
    </div>
  )
}

