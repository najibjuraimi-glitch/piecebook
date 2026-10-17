import { flattenCard } from './cardFrame'
import type { PixelImage } from './centering'
import { loadPhotoFile } from './photoPixels'

export interface SavedFlatPhoto {
  blob: Blob
  name: string
  /** Shown next to the button: the flattened photo, or the original when corners were not found. */
  note: string
}

/** JPEG of a pre-grade photo after flatten, for a later test. The camera file is already flat. */
export async function flattenedPhotoFile(file: File, alreadyFlat: boolean, side: string): Promise<SavedFlatPhoto> {
  if (alreadyFlat) {
    return { blob: file, name: `${side}-flattened.jpg`, note: 'Saved the flattened camera photo.' }
  }
  const loaded = await loadPhotoFile(file)
  const flat = flattenCard(loaded.pixels)
  if (!flat.flattened) {
    return { blob: file, name: `${side}-original.jpg`, note: 'Card corners were not found, so the original photo was saved.' }
  }
  const blob = await pixelsToJpeg(flat.image)
  if (!blob) {
    return { blob: file, name: `${side}-original.jpg`, note: 'Could not encode the flattened photo, so the original was saved.' }
  }
  return { blob, name: `${side}-flattened.jpg`, note: 'Saved the flattened photo.' }
}

function pixelsToJpeg(image: PixelImage): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
