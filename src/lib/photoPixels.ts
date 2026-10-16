import { MIN_SHORT_SIDE_PX, type PixelImage } from './centering'

export interface LoadedPhoto {
  file: File
  /** The photo at the size it was measured, so overlays line up with `pixels`. */
  bitmap: ImageBitmap
  pixels: PixelImage
}

/**
 * Long-edge ceiling for measuring. A 12 MP camera upload is ~170 MB of queues
 * and masks in the flood fill and seconds of work on a phone (F10); 2000 px
 * keeps the edge detection and loses nothing the centering needs.
 */
export const MAX_MEASURE_LONG_EDGE = 2000

export interface FitSize {
  width: number
  height: number
  scale: number
}

/**
 * Size to measure at: never upscales, caps the long edge at `maxLong`, and
 * keeps the short side at least `minShort` when the original had it, so a
 * wide frame is not shrunk under the too-small rule by the long-edge cap alone.
 */
export function fitForMeasure(width: number, height: number, maxLong = MAX_MEASURE_LONG_EDGE, minShort = MIN_SHORT_SIDE_PX): FitSize {
  const long = Math.max(width, height)
  const short = Math.min(width, height)
  if (long <= maxLong || long <= 0 || short <= 0) return { width, height, scale: 1 }
  let scale = maxLong / long
  if (short * scale < minShort && short >= minShort) scale = minShort / short
  scale = Math.min(1, scale)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale }
}

export async function loadPhotoFile(file: File): Promise<LoadedPhoto> {
  const source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const fit = fitForMeasure(source.width, source.height)
  const canvas = document.createElement('canvas')
  canvas.width = fit.width
  canvas.height = fit.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    source.close()
    throw new Error('Could not read the photo.')
  }
  ctx.drawImage(source, 0, 0, fit.width, fit.height)
  const img = ctx.getImageData(0, 0, fit.width, fit.height)
  let bitmap = source
  if (fit.scale < 1) {
    bitmap = await createImageBitmap(canvas)
    source.close()
  }
  return {
    file,
    bitmap,
    pixels: { width: img.width, height: img.height, data: img.data },
  }
}
