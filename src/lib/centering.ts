/** Card-outline → warp → four borders. Photos can rule out a PSA 10; they never confirm one. */

export const MIN_SHORT_SIDE_PX = 800
export const MAX_ANGLE_DEG = 8
export const FRONT_TEN_MAX = 55
export const BACK_TEN_MAX = 75

export type PhotoSide = 'front' | 'back'
export type RejectCode = 'short-side' | 'cut-off' | 'angled' | 'no-card' | 'no-print-edge'

export interface PixelImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface Point {
  x: number
  y: number
}

export interface AxisSplit {
  /** Larger share of the pair, 0–100. */
  largerPct: number
  smallerPct: number
  label: string
  leftOrTop: number
  rightOrBottom: number
}

export interface CenteringMeasure {
  left: number
  right: number
  top: number
  bottom: number
  lr: AxisSplit
  tb: AxisSplit
  worse: AxisSplit
  worseAxis: 'lr' | 'tb'
  cannotBeTen: boolean
  side: PhotoSide
  corners: [Point, Point, Point, Point]
  inner: [Point, Point, Point, Point]
  maxAngleErrorDeg: number
}

export interface RejectedPhoto {
  ok: false
  side: PhotoSide
  code: RejectCode
  message: string
}

export interface MeasuredPhoto {
  ok: true
  side: PhotoSide
  measure: CenteringMeasure
}

export type PhotoResult = MeasuredPhoto | RejectedPhoto

export function splitFromPair(a: number, b: number): AxisSplit {
  const sum = a + b
  if (!(sum > 0)) {
    return { largerPct: 50, smallerPct: 50, label: '50/50', leftOrTop: a, rightOrBottom: b }
  }
  const largerPct = (Math.max(a, b) / sum) * 100
  const smallerPct = 100 - largerPct
  const largerRound = Math.round(largerPct)
  return {
    largerPct,
    smallerPct,
    label: `${largerRound}/${100 - largerRound}`,
    leftOrTop: a,
    rightOrBottom: b,
  }
}

export function worseAxis(lr: AxisSplit, tb: AxisSplit): { worse: AxisSplit; worseAxis: 'lr' | 'tb' } {
  if (tb.largerPct > lr.largerPct) return { worse: tb, worseAxis: 'tb' }
  return { worse: lr, worseAxis: 'lr' }
}

export function cannotBeTenFromWorse(largerPct: number, side: PhotoSide): boolean {
  const limit = side === 'front' ? FRONT_TEN_MAX : BACK_TEN_MAX
  // 55/45 is still a 10; float dust such as 55.00000000000001 is not "over".
  return largerPct > limit + 1e-6
}

export function measureFromBorders(left: number, right: number, top: number, bottom: number, side: PhotoSide): Omit<
  CenteringMeasure,
  'corners' | 'inner' | 'maxAngleErrorDeg'
> {
  const lr = splitFromPair(left, right)
  const tb = splitFromPair(top, bottom)
  const w = worseAxis(lr, tb)
  return {
    left,
    right,
    top,
    bottom,
    lr,
    tb,
    worse: w.worse,
    worseAxis: w.worseAxis,
    cannotBeTen: cannotBeTenFromWorse(w.worse.largerPct, side),
    side,
  }
}

export function measurePhoto(image: PixelImage, side: PhotoSide): PhotoResult {
  const short = Math.min(image.width, image.height)
  if (short < MIN_SHORT_SIDE_PX) {
    return {
      ok: false,
      side,
      code: 'short-side',
      message: `${side === 'front' ? 'Front' : 'Back'}: short side is ${short}px (need ${MIN_SHORT_SIDE_PX}).`,
    }
  }

  const found = resolveCardBlob(image)
  if (found.reject === 'no-card') {
    return {
      ok: false,
      side,
      code: 'no-card',
      message: `${side === 'front' ? 'Front' : 'Back'}: could not find a card outline on a contrasting ground.`,
    }
  }
  if (found.reject === 'cut-off' || !found.blob) {
    return {
      ok: false,
      side,
      code: 'cut-off',
      message: `${side === 'front' ? 'Front' : 'Back'}: the card is cut off at the frame.`,
    }
  }
  const blob = found.blob

  const hull = convexHull(blob.points.length > 2400 ? thinPoints(blob.points, 2400) : blob.points)
  const rect = minAreaRect(hull)
  const keystone = blobKeystoneDeg(hull, rect)
  const tilt = axisTiltDeg(rect)
  if (keystone > MAX_ANGLE_DEG) {
    return {
      ok: false,
      side,
      code: 'angled',
      message: `${side === 'front' ? 'Front' : 'Back'}: photo is angled about ${keystone.toFixed(0)}° (need under ~${MAX_ANGLE_DEG}°).`,
    }
  }

  const destW = 720
  const destH = Math.max(1000, Math.round(720 * (quadHeight(rect) / Math.max(1, quadWidth(rect)))))
  const aligned = tilt <= 2.5 && keystone <= 4
  const warped = aligned
    ? cropRect(image, blob.minX, blob.minY, blob.maxX, blob.maxY)
    : warpToRect(image, insetQuad(rect, 1.25), destW, destH)
  const borders = scanPrintBorders(warped)
  if (!borders) {
    return {
      ok: false,
      side,
      code: 'no-print-edge',
      message: `${side === 'front' ? 'Front' : 'Back'}: found the card but not the print edge.`,
    }
  }

  const base = measureFromBorders(borders.left, borders.right, borders.top, borders.bottom, side)
  const ordered: [Point, Point, Point, Point] = aligned
    ? [
        { x: blob.minX, y: blob.minY },
        { x: blob.maxX, y: blob.minY },
        { x: blob.maxX, y: blob.maxY },
        { x: blob.minX, y: blob.maxY },
      ]
    : orderQuad(rect)
  const inner = innerCorners(ordered, borders, warped.width, warped.height)

  return {
    ok: true,
    side,
    measure: {
      ...base,
      corners: ordered,
      inner,
      maxAngleErrorDeg: keystone,
    },
  }
}

export function drawCenteringOverlay(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  measure: CenteringMeasure,
): void {
  ctx.drawImage(source, 0, 0, srcW, srcH)
  const [tl, tr, br, bl] = measure.corners
  ctx.strokeStyle = 'rgba(26, 26, 26, 0.85)'
  ctx.lineWidth = Math.max(2, Math.round(Math.min(srcW, srcH) / 280))
  ctx.beginPath()
  ctx.moveTo(tl.x, tl.y)
  ctx.lineTo(tr.x, tr.y)
  ctx.lineTo(br.x, br.y)
  ctx.lineTo(bl.x, bl.y)
  ctx.closePath()
  ctx.stroke()

  ctx.strokeStyle = 'rgba(196, 92, 38, 0.9)'
  ctx.beginPath()
  const [itl, itr, ibr, ibl] = measure.inner
  ctx.moveTo(itl.x, itl.y)
  ctx.lineTo(itr.x, itr.y)
  ctx.lineTo(ibr.x, ibr.y)
  ctx.lineTo(ibl.x, ibl.y)
  ctx.closePath()
  ctx.stroke()

  const font = Math.max(13, Math.round(Math.min(srcW, srcH) / 28))
  ctx.font = `600 ${font}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const ink = measure.cannotBeTen ? '#B42318' : '#1A1A1A'
  const leftPct = Math.round((measure.left / (measure.left + measure.right)) * 100)
  const rightPct = 100 - leftPct
  const topPct = Math.round((measure.top / (measure.top + measure.bottom)) * 100)
  const bottomPct = 100 - topPct
  drawTag(ctx, (tl.x + bl.x) / 2 - font, (tl.y + bl.y) / 2, `${leftPct}`, ink, font)
  drawTag(ctx, (tr.x + br.x) / 2 + font, (tr.y + br.y) / 2, `${rightPct}`, ink, font)
  drawTag(ctx, (tl.x + tr.x) / 2, (tl.y + tr.y) / 2 - font * 0.9, `${topPct}`, ink, font)
  drawTag(ctx, (bl.x + br.x) / 2, (bl.y + br.y) / 2 + font * 0.9, `${bottomPct}`, ink, font)
  drawTag(ctx, srcW / 2, srcH - font * 1.4, `${measure.lr.label} · ${measure.tb.label}`, ink, font)
}

function drawTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, ink: string, font: number): void {
  const padX = 6
  const w = ctx.measureText(text).width + padX * 2
  const h = font + 8
  ctx.fillStyle = 'rgba(247, 245, 240, 0.92)'
  ctx.fillRect(x - w / 2, y - h / 2, w, h)
  ctx.fillStyle = ink
  ctx.fillText(text, x, y)
}

export function makeSyntheticCard(opts: {
  width: number
  height: number
  card: { x: number; y: number; w: number; h: number }
  /** Inner print inset from the card edge, in pixels. */
  borders: { left: number; right: number; top: number; bottom: number }
  /** In-plane rotation about the card centre, degrees. */
  rotateDeg?: number
  /** Extra perspective: shrink the top edge (0–0.4). Strong values trip the angled reject. */
  topSqueeze?: number
}): PixelImage {
  const { width, height, card, borders } = opts
  const rotate = ((opts.rotateDeg ?? 0) * Math.PI) / 180
  const squeeze = opts.topSqueeze ?? 0
  const cx = card.x + card.w / 2
  const cy = card.y + card.h / 2
  const data = new Uint8ClampedArray(width * height * 4)
  const bg: [number, number, number] = [28, 28, 30]
  const stock: [number, number, number] = [250, 248, 242]
  const line: [number, number, number] = [12, 12, 12]
  const art: [number, number, number] = [24, 92, 158]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const local = unrotate(x, y, cx, cy, -rotate)
      const lx = local.x - card.x
      const ly = local.y - card.y
      let col = bg
      if (lx >= 0 && ly >= 0 && lx < card.w && ly < card.h) {
        if (squeeze > 0) {
          const t = ly / card.h
          const half = (card.w / 2) * (1 - squeeze * (1 - t))
          if (Math.abs(lx - card.w / 2) > half) {
            setPx(data, i, bg)
            continue
          }
        }
        col = stock
        const inPrint =
          lx >= borders.left && lx < card.w - borders.right && ly >= borders.top && ly < card.h - borders.bottom
        if (inPrint) {
          const onLine =
            lx < borders.left + 2 ||
            lx >= card.w - borders.right - 2 ||
            ly < borders.top + 2 ||
            ly >= card.h - borders.bottom - 2
          col = onLine ? line : art
        }
      }
      setPx(data, i, col)
    }
  }
  return { width, height, data }
}

function setPx(data: Uint8ClampedArray, i: number, rgb: [number, number, number]): void {
  data[i] = rgb[0]
  data[i + 1] = rgb[1]
  data[i + 2] = rgb[2]
  data[i + 3] = 255
}

function unrotate(x: number, y: number, cx: number, cy: number, radians: number): Point {
  const dx = x - cx
  const dy = y - cy
  return {
    x: cx + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: cy + dx * Math.sin(radians) + dy * Math.cos(radians),
  }
}

function blobTouchesFrame(
  blob: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number,
  margin = 3,
): boolean {
  return blob.minX <= margin || blob.minY <= margin || blob.maxX >= width - 1 - margin || blob.maxY >= height - 1 - margin
}

function luminance(rgb: [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/** Scan from the photo edge inward for a consistent luminance jump — the card outline. */
function scanGradientEdge(img: PixelImage, edge: 'left' | 'right' | 'top' | 'bottom', thresh = 24, stations = 21): number | null {
  const hits: number[] = []
  for (let s = 1; s <= stations; s++) {
    const t = s / (stations + 1)
    if (edge === 'left' || edge === 'right') {
      const y = Math.round(t * (img.height - 1))
      const max = Math.floor(img.width * 0.45)
      for (let d = 2; d < max; d++) {
        const x = edge === 'left' ? d : img.width - 1 - d
        if (x <= 0 || x >= img.width - 1) continue
        if (Math.abs(luminance(pixel(img, x - 1, y)) - luminance(pixel(img, x + 1, y))) >= thresh) {
          hits.push(d)
          break
        }
      }
    } else {
      const x = Math.round(t * (img.width - 1))
      const max = Math.floor(img.height * 0.45)
      for (let d = 2; d < max; d++) {
        const y = edge === 'top' ? d : img.height - 1 - d
        if (y <= 0 || y >= img.height - 1) continue
        if (Math.abs(luminance(pixel(img, x, y - 1)) - luminance(pixel(img, x, y + 1))) >= thresh) {
          hits.push(d)
          break
        }
      }
    }
  }
  if (hits.length < Math.max(5, Math.floor(stations / 3))) return null
  hits.sort((a, b) => a - b)
  return hits[Math.floor(hits.length / 2)]
}

function scanOuterInsets(img: PixelImage): { left: number; right: number; top: number; bottom: number } | null {
  const left = scanGradientEdge(img, 'left')
  const right = scanGradientEdge(img, 'right')
  const top = scanGradientEdge(img, 'top')
  const bottom = scanGradientEdge(img, 'bottom')
  if (left == null || right == null || top == null || bottom == null) return null
  if (left + right >= img.width * 0.85 || top + bottom >= img.height * 0.85) return null
  return { left, right, top, bottom }
}

function blobFromInsets(img: PixelImage, inset: { left: number; right: number; top: number; bottom: number }) {
  const minX = inset.left
  const minY = inset.top
  const maxX = img.width - 1 - inset.right
  const maxY = img.height - 1 - inset.bottom
  const points: Point[] = []
  for (let x = minX; x <= maxX; x += 4) {
    points.push({ x, y: minY }, { x, y: maxY })
  }
  for (let y = minY; y <= maxY; y += 4) {
    points.push({ x: minX, y }, { x: maxX, y })
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    count: Math.max(1, (maxX - minX + 1) * (maxY - minY + 1)),
    points,
  }
}

function maskFillRatio(mask: Uint8Array): number {
  let n = 0
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++
  return n / mask.length
}

function blobFromGradient(image: PixelImage): {
  blob?: { minX: number; minY: number; maxX: number; maxY: number; count: number; points: Point[] }
  reject?: 'cut-off' | 'no-card'
} {
  const insets = scanOuterInsets(image)
  if (insets && insets.left > 3 && insets.right > 3 && insets.top > 3 && insets.bottom > 3) {
    return { blob: blobFromInsets(image, insets) }
  }
  if (insets && (insets.left <= 3 || insets.right <= 3 || insets.top <= 3 || insets.bottom <= 3)) {
    return { reject: 'cut-off' }
  }
  return { reject: 'no-card' }
}

/**
 * Colour-distance from the frame fails on eBay-style gradient grounds (the
 * whole photo becomes the "card" and we falsely say it is cut off). If that
 * mask fills the frame, fall back to an inward gradient scan. A compact blob
 * that actually touches the frame is still cut off.
 */
function resolveCardBlob(image: PixelImage): {
  blob?: { minX: number; minY: number; maxX: number; maxY: number; count: number; points: Point[] }
  reject?: 'cut-off' | 'no-card'
} {
  const area = image.width * image.height
  const mask = cardMask(image)
  const fill = maskFillRatio(mask)
  // Skip the flood-fill when the mask is the whole photo or almost empty.
  if (fill > 0.72 || fill < 0.08) return blobFromGradient(image)

  const colorBlob = largestBlob(mask, image.width, image.height)
  const tiny = !colorBlob || colorBlob.count < area * 0.08
  const huge = Boolean(colorBlob && colorBlob.count > area * 0.72)
  const touches = Boolean(colorBlob && blobTouchesFrame(colorBlob, image.width, image.height))

  if (colorBlob && !tiny && !huge && !touches) return { blob: colorBlob }
  if (colorBlob && !tiny && !huge && touches) return { reject: 'cut-off' }
  return blobFromGradient(image)
}

function cardMask(image: PixelImage): Uint8Array {
  const n = image.width * image.height
  const edge: [number, number, number][] = []
  const push = (x: number, y: number) => {
    const i = (y * image.width + x) * 4
    edge.push([image.data[i], image.data[i + 1], image.data[i + 2]])
  }
  for (let x = 0; x < image.width; x += 3) {
    push(x, 0)
    push(x, image.height - 1)
  }
  for (let y = 0; y < image.height; y += 3) {
    push(0, y)
    push(image.width - 1, y)
  }
  const ch = (k: 0 | 1 | 2) => {
    const v = edge.map((s) => s[k]).sort((a, b) => a - b)
    return v[Math.floor(v.length / 2)] ?? 0
  }
  const ground: [number, number, number] = [ch(0), ch(1), ch(2)]
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    mask[i] = colorDist([image.data[o], image.data[o + 1], image.data[o + 2]], ground) > 28 ? 1 : 0
  }
  return mask
}

function largestBlob(mask: Uint8Array, w: number, h: number): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  count: number
  points: Point[]
} | null {
  const seen = new Uint8Array(mask.length)
  let best: { minX: number; minY: number; maxX: number; maxY: number; count: number; points: Point[] } | null = null
  const qx = new Int32Array(mask.length)
  const qy = new Int32Array(mask.length)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = y * w + x
      if (!mask[s] || seen[s]) continue
      let minX = x
      let minY = y
      let maxX = x
      let maxY = y
      let count = 0
      const points: Point[] = []
      let qs = 0
      let qe = 0
      qx[qe] = x
      qy[qe] = y
      qe++
      seen[s] = 1
      while (qs < qe) {
        const cx = qx[qs]
        const cy = qy[qs]
        qs++
        count++
        if (cx < minX) minX = cx
        if (cy < minY) minY = cy
        if (cx > maxX) maxX = cx
        if (cy > maxY) maxY = cy
        if (cx === minX || cy === minY || cx === maxX || cy === maxY || count % 11 === 0) {
          points.push({ x: cx, y: cy })
        }
        const neigh = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]
        for (const [nx, ny] of neigh) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const i = ny * w + nx
          if (!mask[i] || seen[i]) continue
          seen[i] = 1
          qx[qe] = nx
          qy[qe] = ny
          qe++
        }
      }
      if (!best || count > best.count) best = { minX, minY, maxX, maxY, count, points }
    }
  }
  return best
}

function thinPoints(points: Point[], keep: number): Point[] {
  const step = Math.max(1, Math.floor(points.length / keep))
  const out: Point[] = []
  for (let i = 0; i < points.length; i += step) out.push(points[i])
  return out
}

function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  if (pts.length < 3) return pts
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function minAreaRect(hull: Point[]): [Point, Point, Point, Point] {
  let bestArea = Infinity
  let best: [Point, Point, Point, Point] | null = null
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of hull) {
      const rx = (p.x - a.x) * Math.cos(-ang) - (p.y - a.y) * Math.sin(-ang)
      const ry = (p.x - a.x) * Math.sin(-ang) + (p.y - a.y) * Math.cos(-ang)
      if (rx < minX) minX = rx
      if (rx > maxX) maxX = rx
      if (ry < minY) minY = ry
      if (ry > maxY) maxY = ry
    }
    const area = (maxX - minX) * (maxY - minY)
    if (area < bestArea) {
      bestArea = area
      const corners = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ].map((p) => ({
        x: a.x + p.x * Math.cos(ang) - p.y * Math.sin(ang),
        y: a.y + p.x * Math.sin(ang) + p.y * Math.cos(ang),
      }))
      best = [corners[0], corners[1], corners[2], corners[3]]
    }
  }
  return orderQuad(best ?? [hull[0], hull[1], hull[2], hull[3]])
}

function orderQuad(q: [Point, Point, Point, Point] | Point[]): [Point, Point, Point, Point] {
  const pts = [...q]
  const tl = pts.reduce((a, p) => (p.x + p.y < a.x + a.y ? p : a))
  const br = pts.reduce((a, p) => (p.x + p.y > a.x + a.y ? p : a))
  const rest = pts.filter((p) => p !== tl && p !== br)
  const tr = rest.reduce((a, p) => (p.x - p.y > a.x - a.y ? p : a), rest[0])
  const bl = rest.find((p) => p !== tr) ?? rest[0]
  return [tl, tr, br, bl]
}

/**
 * Out-of-plane tilt: compare the blob's width near the top of its min-area
 * rect with the width near the bottom (and left vs right). A square-on card
 * is a rectangle in this frame; a squeezed photo is a trapezoid.
 */
function blobKeystoneDeg(points: Point[], rect: [Point, Point, Point, Point]): number {
  const [tl, tr] = orderQuad(rect)
  const origin = tl
  const ang = Math.atan2(tr.y - tl.y, tr.x - tl.x)
  const local = points.map((p) => {
    const dx = p.x - origin.x
    const dy = p.y - origin.y
    return {
      x: dx * Math.cos(-ang) - dy * Math.sin(-ang),
      y: dx * Math.sin(-ang) + dy * Math.cos(-ang),
    }
  })
  const ys = local.map((p) => p.y)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const h = maxY - minY
  if (h < 8) return 0
  const band = h * 0.12
  const xs = local.map((p) => p.x)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const w = maxX - minX
  const xband = w * 0.12
  const widthAt = (y0: number, y1: number) => {
    let lo = Infinity
    let hi = -Infinity
    for (const p of local) {
      if (p.y >= y0 && p.y <= y1) {
        if (p.x < lo) lo = p.x
        if (p.x > hi) hi = p.x
      }
    }
    return hi - lo
  }
  const heightAt = (x0: number, x1: number) => {
    let lo = Infinity
    let hi = -Infinity
    for (const p of local) {
      if (p.x >= x0 && p.x <= x1) {
        if (p.y < lo) lo = p.y
        if (p.y > hi) hi = p.y
      }
    }
    return hi - lo
  }
  const topW = widthAt(minY, minY + band)
  const botW = widthAt(maxY - band, maxY)
  const leftH = heightAt(minX, minX + xband)
  const rightH = heightAt(maxX - xband, maxX)
  const wr = Math.min(topW, botW) / Math.max(topW, botW)
  const hr = Math.min(leftH, rightH) / Math.max(leftH, rightH)
  const ratio = Math.min(wr, hr)
  if (!(ratio > 0) || ratio >= 1) return 0
  return (Math.acos(Math.min(1, ratio)) * 180) / Math.PI
}

function axisTiltDeg(q: Point[]): number {
  const [tl, tr, br, bl] = orderQuad(q as [Point, Point, Point, Point])
  const edges = [
    Math.atan2(tr.y - tl.y, tr.x - tl.x),
    Math.atan2(br.y - tr.y, br.x - tr.x),
    Math.atan2(br.y - bl.y, br.x - bl.x),
    Math.atan2(bl.y - tl.y, bl.x - tl.x),
  ]
  const toAxis = (rad: number) => {
    let deg = (Math.abs(rad) * 180) / Math.PI
    deg = deg % 90
    return Math.min(deg, 90 - deg)
  }
  return Math.max(...edges.map(toAxis))
}

function cropRect(src: PixelImage, minX: number, minY: number, maxX: number, maxY: number): PixelImage {
  const x0 = Math.max(0, minX)
  const y0 = Math.max(0, minY)
  const x1 = Math.min(src.width - 1, maxX)
  const y1 = Math.min(src.height - 1, maxY)
  const w = Math.max(1, x1 - x0 + 1)
  const h = Math.max(1, y1 - y0 + 1)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const srcOff = ((y0 + y) * src.width + x0) * 4
    data.set(src.data.subarray(srcOff, srcOff + w * 4), y * w * 4)
  }
  return { width: w, height: h, data }
}

function quadWidth(q: Point[]): number {
  const [tl, tr, br, bl] = orderQuad(q as [Point, Point, Point, Point])
  return (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2
}

function quadHeight(q: Point[]): number {
  const [tl, tr, br, bl] = orderQuad(q as [Point, Point, Point, Point])
  return (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2
}

function warpToRect(src: PixelImage, quad: [Point, Point, Point, Point], destW: number, destH: number): PixelImage {
  const [tl, tr, br, bl] = quad
  const out = new Uint8ClampedArray(destW * destH * 4)
  for (let y = 0; y < destH; y++) {
    const v = destH === 1 ? 0 : y / (destH - 1)
    for (let x = 0; x < destW; x++) {
      const u = destW === 1 ? 0 : x / (destW - 1)
      const top = lerpPt(tl, tr, u)
      const bot = lerpPt(bl, br, u)
      const p = lerpPt(top, bot, v)
      const s = sampleBilinear(src, p.x, p.y)
      const i = (y * destW + x) * 4
      out[i] = s[0]
      out[i + 1] = s[1]
      out[i + 2] = s[2]
      out[i + 3] = 255
    }
  }
  return { width: destW, height: destH, data: out }
}

function lerpPt(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Pull each corner toward the centroid so the warp samples card stock, not the ground. */
function insetQuad(q: [Point, Point, Point, Point], px: number): [Point, Point, Point, Point] {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4
  return q.map((p) => {
    const dx = cx - p.x
    const dy = cy - p.y
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * px, y: p.y + (dy / len) * px }
  }) as [Point, Point, Point, Point]
}

function sampleBilinear(img: PixelImage, x: number, y: number): [number, number, number] {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + 1
  const y1 = y0 + 1
  const sx = x - x0
  const sy = y - y0
  const c00 = sampleNearest(img, x0, y0)
  const c10 = sampleNearest(img, x1, y0)
  const c01 = sampleNearest(img, x0, y1)
  const c11 = sampleNearest(img, x1, y1)
  return [
    c00[0] * (1 - sx) * (1 - sy) + c10[0] * sx * (1 - sy) + c01[0] * (1 - sx) * sy + c11[0] * sx * sy,
    c00[1] * (1 - sx) * (1 - sy) + c10[1] * sx * (1 - sy) + c01[1] * (1 - sx) * sy + c11[1] * sx * sy,
    c00[2] * (1 - sx) * (1 - sy) + c10[2] * sx * (1 - sy) + c01[2] * (1 - sx) * sy + c11[2] * sx * sy,
  ]
}

function sampleNearest(img: PixelImage, x: number, y: number): [number, number, number] {
  const xi = Math.min(img.width - 1, Math.max(0, x))
  const yi = Math.min(img.height - 1, Math.max(0, y))
  const i = (yi * img.width + xi) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

function scanPrintBorders(img: PixelImage): { left: number; right: number; top: number; bottom: number } | null {
  const stock = medianEdgeColor(img)
  const left = scanInward(img, 'left', stock)
  const right = scanInward(img, 'right', stock)
  const top = scanInward(img, 'top', stock)
  const bottom = scanInward(img, 'bottom', stock)
  if (left == null || right == null || top == null || bottom == null) return null
  if (left + right >= img.width * 0.85 || top + bottom >= img.height * 0.85) return null
  return { left, right, top, bottom }
}

function medianEdgeColor(img: PixelImage): [number, number, number] {
  const samples: [number, number, number][] = []
  const push = (x: number, y: number) => {
    const i = (y * img.width + x) * 4
    samples.push([img.data[i], img.data[i + 1], img.data[i + 2]])
  }
  for (let x = 2; x < img.width - 2; x += 4) {
    push(x, 2)
    push(x, img.height - 3)
  }
  for (let y = 2; y < img.height - 2; y += 4) {
    push(2, y)
    push(img.width - 3, y)
  }
  const ch = (k: 0 | 1 | 2) => {
    const v = samples.map((s) => s[k]).sort((a, b) => a - b)
    return v[Math.floor(v.length / 2)] ?? 250
  }
  return [ch(0), ch(1), ch(2)]
}

function scanInward(img: PixelImage, edge: 'left' | 'right' | 'top' | 'bottom', stock: [number, number, number]): number | null {
  const stations = 11
  const dists: number[] = []
  const thresh = 36
  for (let s = 1; s <= stations; s++) {
    const t = s / (stations + 1)
    if (edge === 'left' || edge === 'right') {
      const y = Math.round(t * (img.height - 1))
      const max = Math.floor(img.width * 0.45)
      for (let d = 2; d < max; d++) {
        const x = edge === 'left' ? d : img.width - 1 - d
        if (colorDist(pixel(img, x, y), stock) > thresh) {
          dists.push(d)
          break
        }
      }
    } else {
      const x = Math.round(t * (img.width - 1))
      const max = Math.floor(img.height * 0.45)
      for (let d = 2; d < max; d++) {
        const y = edge === 'top' ? d : img.height - 1 - d
        if (colorDist(pixel(img, x, y), stock) > thresh) {
          dists.push(d)
          break
        }
      }
    }
  }
  if (dists.length < 5) return null
  dists.sort((a, b) => a - b)
  return dists[Math.floor(dists.length / 2)]
}

function pixel(img: PixelImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function innerCorners(
  outer: [Point, Point, Point, Point],
  borders: { left: number; right: number; top: number; bottom: number },
  destW: number,
  destH: number,
): [Point, Point, Point, Point] {
  const [tl, tr, br, bl] = outer
  const u0 = borders.left / destW
  const u1 = 1 - borders.right / destW
  const v0 = borders.top / destH
  const v1 = 1 - borders.bottom / destH
  const at = (u: number, v: number) => lerpPt(lerpPt(tl, tr, u), lerpPt(bl, br, u), v)
  return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
}
