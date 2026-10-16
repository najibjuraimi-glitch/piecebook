import type { PixelImage } from './centering'

export interface LoadedPhoto {
  file: File
  bitmap: ImageBitmap
  pixels: PixelImage
}

export async function loadPhotoFile(file: File): Promise<LoadedPhoto> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not read the photo.')
  ctx.drawImage(bitmap, 0, 0)
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  return {
    file,
    bitmap,
    pixels: { width: img.width, height: img.height, data: img.data },
  }
}
