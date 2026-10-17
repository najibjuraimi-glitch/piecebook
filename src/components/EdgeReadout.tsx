import { BUILD_SHA } from '../lib/buildInfo'
import type { PhotoSide } from '../lib/centering'

/** Build sha and per-side print-edge note, under a photo that has a result. */
export function EdgeReadout({ side, detail, show }: { side: PhotoSide; detail?: string; show: boolean }) {
  if (!show) return null
  return (
    <>
      {detail ? (
        <p className="mt-1 text-[12px] leading-4 text-muted" data-testid={`edge-debug-${side}`}>
          {detail}
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted" data-testid={`build-tag-${side}`}>
        build {BUILD_SHA}
      </p>
    </>
  )
}
