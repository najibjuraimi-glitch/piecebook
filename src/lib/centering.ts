/** Card-outline → warp → four borders. Photos can rule out a PSA 10; they never confirm one. */

export const MIN_SHORT_SIDE_PX = 800
export const MAX_ANGLE_DEG = 8
export const FRONT_TEN_MAX = 55
export const BACK_TEN_MAX = 75
/**
 * A print border thinner than this on any side means the scan fired on edge
 * noise, not a border. Such a measure is unresolved: no ratio is shown and it
 * never rules a 10 out.
 */
export const MIN_PRINT_BORDER_PX = 4

export type PhotoSide = 'front' | 'back'
export type RejectCode = 'short-side' | 'cut-off' | 'angled' | 'no-card' | 'no-print-edge'
export type EdgeName = 'left' | 'right' | 'top' | 'bottom'

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
  /** False when a border is under MIN_PRINT_BORDER_PX: the card was found but the print edge was not. */
  resolved: boolean
  /** Sides where the card edge was found but no print border could be read. Empty when resolved. */
  unresolvedSides?: EdgeName[]
  /**
   * Why each side was kept or dropped, for the next photo. Short, one phrase
   * per side: a width and how many stations agreed, or the reason it was not
   * a border. Present whenever the card itself was found.
   */
  edgeNotes?: Partial<Record<EdgeName, string>>
  side: PhotoSide
  corners: [Point, Point, Point, Point]
  inner: [Point, Point, Point, Point]
  maxAngleErrorDeg: number
  /**
   * Size of the image the corners were measured in. A measurement carried to
   * another screen may be drawn over a smaller copy of the photo; the overlay
   * scales by these.
   */
  imageWidth?: number
  imageHeight?: number
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

export function bordersResolved(left: number, right: number, top: number, bottom: number): boolean {
  return [left, right, top, bottom].every((px) => Number.isFinite(px) && px >= MIN_PRINT_BORDER_PX)
}

export function measureFromBorders(left: number, right: number, top: number, bottom: number, side: PhotoSide): Omit<
  CenteringMeasure,
  'corners' | 'inner' | 'maxAngleErrorDeg'
> {
  const lr = splitFromPair(left, right)
  const tb = splitFromPair(top, bottom)
  const w = worseAxis(lr, tb)
  const resolved = bordersResolved(left, right, top, bottom)
  return {
    left,
    right,
    top,
    bottom,
    lr,
    tb,
    worse: w.worse,
    worseAxis: w.worseAxis,
    cannotBeTen: resolved && cannotBeTenFromWorse(w.worse.largerPct, side),
    resolved,
    side,
  }
}

/** Restored log rows carry unit-square placeholder corners, not pixel geometry. */
export function hasPixelGeometry(measure: Pick<CenteringMeasure, 'corners'>): boolean {
  return measure.corners.some((p) => p.x > 1 || p.y > 1)
}

/** `right and bottom` / `left, top and bottom` / `every side`. */
export function listSides(sides: readonly EdgeName[] | undefined): string {
  if (!sides || sides.length === 0 || sides.length === 4) return 'every side'
  if (sides.length === 1) return sides[0]
  return `${sides.slice(0, -1).join(', ')} and ${sides[sides.length - 1]}`
}

/** `50/50 · 50/50`, or a plain statement when the print edge was not resolved. */
export function centeringLabel(
  measure: Pick<CenteringMeasure, 'lr' | 'tb' | 'resolved' | 'cannotBeTen'> & Partial<Pick<CenteringMeasure, 'unresolvedSides'>>,
): string {
  if (!measure.resolved) {
    const sides = measure.unresolvedSides
    const where = sides && sides.length > 0 && sides.length < 4 ? ` on the ${listSides(sides)}` : ''
    return `Card found · print edge not measured${where} · nothing ruled out`
  }
  return `${measure.lr.label} · ${measure.tb.label}${measure.cannotBeTen ? ' · cannot be a 10' : ''}`
}

export type Quad = [Point, Point, Point, Point]

export function quadArea(q: Quad): number {
  return (
    Math.abs(
      q[0].x * q[1].y - q[1].x * q[0].y + (q[1].x * q[2].y - q[2].x * q[1].y) + (q[2].x * q[3].y - q[3].x * q[2].y) + (q[3].x * q[0].y - q[0].x * q[3].y),
    ) / 2
  )
}

/** Same scale as `blobKeystoneDeg`: the foreshortening of the shorter opposite side read as a tilt angle. */
export function quadKeystoneDeg(q: Quad): number {
  const [tl, tr, br, bl] = q
  const top = Math.hypot(tr.x - tl.x, tr.y - tl.y)
  const bottom = Math.hypot(br.x - bl.x, br.y - bl.y)
  const left = Math.hypot(bl.x - tl.x, bl.y - tl.y)
  const right = Math.hypot(br.x - tr.x, br.y - tr.y)
  const ratio = Math.min(Math.min(top, bottom) / Math.max(top, bottom), Math.min(left, right) / Math.max(left, right))
  if (!(ratio > 0) || ratio >= 1) return 0
  return (Math.acos(Math.min(1, ratio)) * 180) / Math.PI
}

export function lineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x)
  if (Math.abs(d) < 1e-9) return null
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) }
}

export interface MeasureOptions {
  /**
   * Card corners already known in this image's pixels (top-left, top-right,
   * bottom-right, bottom-left), e.g. from the camera's flatten. The outline
   * search is skipped and these are trusted; the print edges are still read
   * from the pixels.
   */
  outline?: Quad
}

/**
 * A camera shot is measured on the corners it was flattened to. When that
 * reading cannot resolve the print border, the same pixels are searched
 * again without those corners and the reading with fewer unresolved sides
 * is kept. A bad outline must not be the only attempt.
 */
export function chooseMeasure(guided: PhotoResult, searched: PhotoResult): PhotoResult {
  if (!guided.ok) return searched
  if (!searched.ok) return guided
  const unresolved = (m: MeasuredPhoto) => (m.measure.resolved ? 0 : (m.measure.unresolvedSides?.length ?? 4))
  return unresolved(searched) < unresolved(guided) ? searched : guided
}

export function measurePhoto(image: PixelImage, side: PhotoSide, opts: MeasureOptions = {}): PhotoResult {
  const short = Math.min(image.width, image.height)
  if (short < MIN_SHORT_SIDE_PX) {
    return {
      ok: false,
      side,
      code: 'short-side',
      message: `${side === 'front' ? 'Front' : 'Back'}: short side is ${short}px (need ${MIN_SHORT_SIDE_PX}).`,
    }
  }

  let rect: [Point, Point, Point, Point]
  let keystone: number
  let tilt: number
  let box: { minX: number; minY: number; maxX: number; maxY: number }
  if (opts.outline) {
    const q = opts.outline
    rect = orderQuad(q)
    keystone = quadKeystoneDeg(q)
    tilt = axisTiltDeg(q)
    box = {
      minX: Math.floor(Math.min(q[0].x, q[1].x, q[2].x, q[3].x)),
      minY: Math.floor(Math.min(q[0].y, q[1].y, q[2].y, q[3].y)),
      maxX: Math.ceil(Math.max(q[0].x, q[1].x, q[2].x, q[3].x)),
      maxY: Math.ceil(Math.max(q[0].y, q[1].y, q[2].y, q[3].y)),
    }
  } else {
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
    rect = minAreaRect(hull)
    keystone = blobKeystoneDeg(hull, rect)
    tilt = axisTiltDeg(rect)
    box = blob
  }
  if (keystone > MAX_ANGLE_DEG) {
    return {
      ok: false,
      side,
      code: 'angled',
      message: `${side === 'front' ? 'Front' : 'Back'}: photo is angled about ${keystone.toFixed(0)}° (need under ~${MAX_ANGLE_DEG}°), or a hand or shadow is joined to the card outline.`,
    }
  }

  const destW = 720
  const destH = Math.max(1000, Math.round(720 * (quadHeight(rect) / Math.max(1, quadWidth(rect)))))
  const aligned = tilt <= 2.5 && keystone <= 4
  // Work on a frame that reaches a little past the card outline on every side, so the
  // physical card edge sits inside the profiles and can be located, not assumed.
  const pad = Math.max(8, Math.round(Math.min(quadWidth(rect), quadHeight(rect)) * FRAME_PAD_FRAC))
  let frame: PixelImage
  let toImage: (p: Point) => Point
  // A flattened shot already names the card edge. The print search refines it
  // by a few pixels instead of hunting a new edge, which on a foil front locks
  // onto a line inside the art.
  let anchor: { left: number; right: number; top: number; bottom: number } | undefined
  if (aligned) {
    const x0 = Math.max(0, box.minX - pad)
    const y0 = Math.max(0, box.minY - pad)
    const x1 = Math.min(image.width - 1, box.maxX + pad)
    const y1 = Math.min(image.height - 1, box.maxY + pad)
    frame = cropRect(image, x0, y0, x1, y1)
    toImage = (p) => ({ x: x0 + p.x, y: y0 + p.y })
    if (opts.outline) {
      anchor = { left: box.minX - x0, right: x1 - box.maxX, top: box.minY - y0, bottom: y1 - box.maxY }
    }
  } else {
    const quad = insetQuad(rect, -pad)
    frame = warpToRect(image, quad, destW + 2 * pad, destH + 2 * pad)
    const [tl, tr, br, bl] = quad
    toImage = (p) => {
      const u = p.x / Math.max(1, frame.width - 1)
      const v = p.y / Math.max(1, frame.height - 1)
      return lerpPt(lerpPt(tl, tr, u), lerpPt(bl, br, u), v)
    }
    if (opts.outline) anchor = { left: pad, right: pad, top: pad, bottom: pad }
  }

  const edges = scanCardEdges(frame, pad, anchor)
  // Outline as found in the frame (refined past the blob where the physical edge was seen).
  const outer: [Point, Point, Point, Point] = [
    toImage({ x: edges.left.edge, y: edges.top.edge }),
    toImage({ x: frame.width - 1 - edges.right.edge, y: edges.top.edge }),
    toImage({ x: frame.width - 1 - edges.right.edge, y: frame.height - 1 - edges.bottom.edge }),
    toImage({ x: edges.left.edge, y: frame.height - 1 - edges.bottom.edge }),
  ]
  const borders = printBorders(edges)
  if (!borders) {
    // Card found, print edge not: nothing is ruled out and no ratio exists to show.
    return {
      ok: true,
      side,
      measure: {
        ...measureFromBorders(0, 0, 0, 0, side),
        resolved: false,
        cannotBeTen: false,
        unresolvedSides: unresolvedSidesOf(edges),
        edgeNotes: edgeNotesOf(edges),
        corners: outer,
        inner: outer,
        maxAngleErrorDeg: keystone,
        imageWidth: image.width,
        imageHeight: image.height,
      },
    }
  }

  const base = measureFromBorders(borders.left, borders.right, borders.top, borders.bottom, side)
  const inner: [Point, Point, Point, Point] = [
    toImage({ x: edges.left.print as number, y: edges.top.print as number }),
    toImage({ x: frame.width - 1 - (edges.right.print as number), y: edges.top.print as number }),
    toImage({ x: frame.width - 1 - (edges.right.print as number), y: frame.height - 1 - (edges.bottom.print as number) }),
    toImage({ x: edges.left.print as number, y: frame.height - 1 - (edges.bottom.print as number) }),
  ]

  return {
    ok: true,
    side,
    measure: {
      ...base,
      unresolvedSides: [],
      edgeNotes: edgeNotesOf(edges),
      corners: outer,
      inner,
      maxAngleErrorDeg: keystone,
      imageWidth: image.width,
      imageHeight: image.height,
    },
  }
}

/** Map a measurement's pixel geometry onto a copy of the photo at a different size. */
export function scaleMeasureTo(measure: CenteringMeasure, width: number, height: number): CenteringMeasure {
  const srcW = measure.imageWidth
  const srcH = measure.imageHeight
  if (!srcW || !srcH || (srcW === width && srcH === height)) return measure
  const sx = width / srcW
  const sy = height / srcH
  const map = (p: Point): Point => ({ x: p.x * sx, y: p.y * sy })
  return {
    ...measure,
    corners: measure.corners.map(map) as [Point, Point, Point, Point],
    inner: measure.inner.map(map) as [Point, Point, Point, Point],
    imageWidth: width,
    imageHeight: height,
  }
}

export function drawCenteringOverlay(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  measureIn: CenteringMeasure,
): void {
  const measure = scaleMeasureTo(measureIn, srcW, srcH)
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

  const font = Math.max(13, Math.round(Math.min(srcW, srcH) / 28))
  ctx.font = `600 ${font}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (!measure.resolved) {
    drawTag(ctx, srcW / 2, srcH - font * 1.4, 'print edge not measured', '#1A1A1A', font)
    return
  }

  ctx.strokeStyle = 'rgba(196, 92, 38, 0.9)'
  ctx.beginPath()
  const [itl, itr, ibr, ibl] = measure.inner
  ctx.moveTo(itl.x, itl.y)
  ctx.lineTo(itr.x, itr.y)
  ctx.lineTo(ibr.x, ibr.y)
  ctx.lineTo(ibl.x, ibl.y)
  ctx.closePath()
  ctx.stroke()

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
  /** A skin-toned palm behind the card: an ellipse filling this box, in image pixels. Rounded like a real hand, never a straight edge. */
  hand?: { x: number; y: number; w: number; h: number }
  /** Sides where the art runs to the card edge with no border band (alt art). */
  artToEdge?: EdgeName[]
  /** Deterministic sensor grain, ± this many levels per channel. */
  noise?: number
  /**
   * An uneven ground (a lit tabletop or bag), brightening across the frame. The
   * frame-median colour mask cannot separate the card from it, so the card is
   * found by the inward gradient scan, as in a real hand-held photo.
   */
  groundGradient?: boolean
}): PixelImage {
  const { width, height, card, borders } = opts
  const rotate = ((opts.rotateDeg ?? 0) * Math.PI) / 180
  const squeeze = opts.topSqueeze ?? 0
  const cx = card.x + card.w / 2
  const cy = card.y + card.h / 2
  const data = new Uint8ClampedArray(width * height * 4)
  const bg: [number, number, number] = [28, 28, 30]
  const skin: [number, number, number] = [214, 168, 134]
  const stock: [number, number, number] = [250, 248, 242]
  const line: [number, number, number] = [12, 12, 12]
  const art: [number, number, number] = [24, 92, 158]
  const bleed = new Set(opts.artToEdge ?? [])
  const grain = opts.noise ?? 0
  let seed = 0x9e3779b9
  const jitter = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return ((seed >>> 8) / 0x01000000 - 0.5) * 2 * grain
  }
  const hand = opts.hand

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const local = unrotate(x, y, cx, cy, -rotate)
      const lx = local.x - card.x
      const ly = local.y - card.y
      const ground: [number, number, number] = opts.groundGradient
        ? [bg[0] + ((x + y) / (width + height)) * 110, bg[1] + ((x + y) / (width + height)) * 100, bg[2] + ((x + y) / (width + height)) * 90]
        : bg
      const inHand =
        hand != null &&
        ((x - (hand.x + hand.w / 2)) / (hand.w / 2)) ** 2 + ((y - (hand.y + hand.h / 2)) / (hand.h / 2)) ** 2 <= 1
      let col = inHand ? skin : ground
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
        const bl = bleed.has('left') ? 0 : borders.left
        const br = bleed.has('right') ? 0 : borders.right
        const bt = bleed.has('top') ? 0 : borders.top
        const bb = bleed.has('bottom') ? 0 : borders.bottom
        const inPrint = lx >= bl && lx < card.w - br && ly >= bt && ly < card.h - bb
        if (inPrint) {
          const onLine =
            (!bleed.has('left') && lx < bl + 2) ||
            (!bleed.has('right') && lx >= card.w - br - 2) ||
            (!bleed.has('top') && ly < bt + 2) ||
            (!bleed.has('bottom') && ly >= card.h - bb - 2)
          // Bled art is not flat: a slow ramp with painterly texture, so no band reads as a border.
          col = onLine
            ? line
            : bleed.size
              ? [art[0] + (lx / card.w) * 40 + 28 * Math.sin(lx / 5.5) * Math.cos(ly / 4.5), art[1] + 20 * Math.sin(ly / 7), art[2] - (ly / card.h) * 40]
              : art
        }
      }
      setPx(data, i, grain ? [col[0] + jitter(), col[1] + jitter(), col[2] + jitter()] : col)
    }
  }
  return { width, height, data }
}

function setPx(data: Uint8ClampedArray, i: number, rgb: [number, number, number] | number[]): void {
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
  // The stride alone drops the corners of a big card, and the keystone then
  // reads a taper that is not there. Always keep the points on the bounding box.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const step = Math.max(1, Math.floor(points.length / keep))
  const out: Point[] = []
  for (let i = 0; i < points.length; i += step) out.push(points[i])
  for (const p of points) {
    if (p.x === minX || p.x === maxX || p.y === minY || p.y === maxY) out.push(p)
  }
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

export function axisTiltDeg(q: Point[]): number {
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

// --- print edge --------------------------------------------------------------
//
// A card border is a flat band of one colour between two colour steps: the
// physical card edge (ground → stock) and the print edge (stock → art or frame
// line). Each side is read at several stations as a 1-D colour profile running
// inward, smoothed across a few pixels so sensor noise and JPEG grain do not
// register as steps. The first strong step is the card edge; the next strong
// step after a flat band is the print edge. Stations have to agree on the
// band's width or the side is unresolved. Full-art edges (no flat band) and
// glare therefore give "not found", never an invented 50/50.

/** How far past the card outline the working frame reaches, as a share of the short side. */
const FRAME_PAD_FRAC = 0.03
/** Stations per side, spread over the middle 80% so rounded corners are skipped. */
const STATIONS = 21
/** Half-width of the band each profile sample is averaged over, perpendicular to the scan. */
const BAND = 2
/** Pixels on each side of a point used by the smoothed colour step. */
const STEP_REACH = 3
/** A colour step below this is noise, never an edge. */
const MIN_STEP = 24
/** The card edge needs a stronger step than the print edge: ground and stock differ a lot. */
const MIN_CARD_STEP = 32
/** A step this big or bigger counts as a full vote when fitting the card edge line. */
const STRONG_STEP = 150
/**
 * How deep the card edge may sit inside the frame, as a share of the frame
 * dimension. Generous because a hand behind the card joins the colour blob and
 * pushes the blob's box well past the card.
 */
const CARD_EDGE_DEPTH_FRAC = 0.2
/** The widest plausible border, as a share of the frame dimension. */
const MAX_BORDER_FRAC = 0.22
/**
 * A print edge closer to the card edge than this is the card edge's own
 * anti-aliasing seen twice, not a border. Thin foil frames and a back whose
 * print sits close to the edge are only a few pixels in, so this stays just
 * above that anti-alias and above MIN_PRINT_BORDER_PX.
 */
const MIN_BORDER_GAP = 5
/** Mean colour distance from the band's average above which the band is art or text, not a border. */
const MAX_BAND_SPREAD = 16
/**
 * Share of stations that must find the same border width for a side to
 * resolve. Under half on purpose: alt-art frames carry vertical text and art
 * that overflows the border, so clean stations are the minority on some sides,
 * while a full-art edge never gets this many stations to agree.
 */
const MIN_AGREE = 0.35

interface SideEdges {
  /** Depth of the physical card edge from the frame edge, in frame pixels. */
  edge: number
  /** Depth of the print edge, or null when no flat border band ended in a clear step. */
  print: number | null
  /** One short phrase: the width that agreed, or why the side did not. */
  reason: string
}

type Rgb = [number, number, number]

function pixel(img: PixelImage, x: number, y: number): Rgb {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

function colorDist(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Colour at each depth along one scan line, averaged over a short band perpendicular to it. */
function sideProfile(img: PixelImage, edge: 'left' | 'right' | 'top' | 'bottom', t: number, depth: number): Rgb[] {
  const out: Rgb[] = []
  const along = edge === 'left' || edge === 'right'
  const centre = Math.round(t * ((along ? img.height : img.width) - 1))
  for (let d = 0; d < depth; d++) {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let k = -BAND; k <= BAND; k++) {
      const c = centre + k
      if (c < 0 || c >= (along ? img.height : img.width)) continue
      const x = along ? (edge === 'left' ? d : img.width - 1 - d) : c
      const y = along ? c : edge === 'top' ? d : img.height - 1 - d
      const p = pixel(img, x, y)
      r += p[0]
      g += p[1]
      b += p[2]
      n++
    }
    out.push(n ? [r / n, g / n, b / n] : [0, 0, 0])
  }
  return out
}

function meanRgb(profile: Rgb[], from: number, to: number): Rgb {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = Math.max(0, from); i < Math.min(profile.length, to); i++) {
    r += profile[i][0]
    g += profile[i][1]
    b += profile[i][2]
    n++
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0]
}

/** Smoothed colour step at each depth: the band just outside against the band just inside. */
function stepProfile(profile: Rgb[]): number[] {
  const steps = new Array<number>(profile.length).fill(0)
  for (let d = STEP_REACH; d < profile.length - STEP_REACH; d++) {
    steps[d] = colorDist(meanRgb(profile, d - STEP_REACH, d), meanRgb(profile, d + 1, d + 1 + STEP_REACH))
  }
  return steps
}

/** Local maxima of the step profile above `floor`, with neighbours within 3px folded into the strongest. */
function stepPeaks(steps: number[], floor: number): number[] {
  const peaks: number[] = []
  for (let d = 1; d < steps.length - 1; d++) {
    if (steps[d] < floor || steps[d] < steps[d - 1] || steps[d] < steps[d + 1]) continue
    const last = peaks[peaks.length - 1]
    if (last != null && d - last <= 3) {
      if (steps[d] > steps[last]) peaks[peaks.length - 1] = d
      continue
    }
    peaks.push(d)
  }
  return peaks
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b)
  return v[Math.floor(v.length / 2)]
}

interface EdgeLine {
  /** Depth of the line at station position t (0–1 along the side). */
  at: (t: number) => number
  support: number
}

/**
 * The physical card edge on one side is a straight line, so strong steps at
 * roughly the same depth line up across stations. Fit the line with the most
 * stations on it; fingers, shadows and background folds do not line up like
 * that. The print edge does, but it is never the outermost such line, so among
 * lines with near-maximal support the outermost wins. Null when nothing lines up.
 */
function cardEdgeLine(steps: number[][], ts: number[], pad: number, dim: number, anchor?: number): EdgeLine | null {
  // A known outline only needs a few pixels of slack: warp rounding, not a new search.
  const slack = anchor == null ? null : Math.max(6, Math.round(dim * 0.005))
  const limit = anchor == null || slack == null ? pad + dim * CARD_EDGE_DEPTH_FRAC : anchor + slack
  const floor = anchor == null || slack == null ? 0 : Math.max(0, anchor - slack)
  const tol = Math.max(3, dim * 0.004)
  const cands: { i: number; t: number; d: number; w: number }[] = []
  steps.forEach((s, i) => {
    const strong = stepPeaks(s, MIN_CARD_STEP)
      .filter((d) => d >= floor && d <= limit)
      .sort((a, b) => s[b] - s[a])
      .slice(0, 6)
    // A station's vote is worth more the cleaner its step: ground against card is a big step,
    // a fold in the background or a printed line inside the card is a small one.
    for (const d of strong) cands.push({ i, t: ts[i], d, w: Math.min(1, s[d] / STRONG_STEP) })
  })
  // Under half the stations on purpose: a card edge over a dark ground or a palm is faint
  // along part of a side, while a printed line inside the card can be crisp all the way.
  const need = Math.max(5, Math.ceil(steps.length * 0.4))
  if (cands.length < need) return null
  // Slope cap: the card passed the 2.5° tilt gate, so its edge cannot climb faster than that across the side.
  const maxSlope = dim * 0.045
  let lines: { stations: number; support: number; mid: number; slope: number; at: (t: number) => number }[] = []
  for (let a = 0; a < cands.length; a++) {
    for (let b = a + 1; b < cands.length; b++) {
      const A = cands[a]
      const B = cands[b]
      if (A.i === B.i || Math.abs(B.t - A.t) < 0.25) continue
      const slope = (B.d - A.d) / (B.t - A.t)
      // A flattened card's edge is level. A known outline does not follow a tilted inner line.
      if (Math.abs(slope) > (anchor == null ? maxSlope : dim * 0.012)) continue
      const at = (t: number) => A.d + slope * (t - A.t)
      const hit = new Map<number, number>()
      for (const c of cands) {
        if (Math.abs(c.d - at(c.t)) > tol) continue
        hit.set(c.i, Math.max(hit.get(c.i) ?? 0, c.w))
      }
      if (hit.size < need) continue
      let support = 0
      for (const w of hit.values()) support += w
      lines.push({ stations: hit.size, support, mid: at(0.5), slope, at })
    }
  }
  if (!lines.length) return null
  // The print edge and lines printed inside the card can out-vote a card edge that is faint
  // along part of a side, but they are never outside it: take the outermost well-supported line.
  // Only lines parallel to the strongest one qualify, though: the print edge runs parallel to
  // the card edge, while a row of finger or shadow edges that happens to line up does not.
  const top = lines.reduce((a, l) => (l.support > a.support ? l : a))
  const slopeTol = (tol * 1.5) / 0.8
  lines = lines.filter((l) => (anchor != null || l.support >= top.support * 0.6) && Math.abs(l.slope - top.slope) <= slopeTol)
  // With a known outline the physical edge is the outermost step in the slack,
  // even when the print edge just inside it is a stronger step.
  const best =
    anchor == null
      ? lines.reduce((a, l) => (l.mid < a.mid ? l : a))
      : lines.reduce((a, l) => (l.mid < a.mid - 1 || (Math.abs(l.mid - a.mid) <= 1 && l.support > a.support) ? l : a))
  return refineEdgeLine(steps, ts, best.at, tol, need)
}

/**
 * Two stations fix the first line, so a finger or shadow edge at one of them tips it
 * off the card edge for every station between. Re-fit through the strongest step each
 * station sees near the line (Theil–Sen: median slope, median offset), twice.
 */
function refineEdgeLine(steps: number[][], ts: number[], at0: (t: number) => number, tol: number, need: number): EdgeLine | null {
  let at = at0
  for (let pass = 0; pass < 2; pass++) {
    const pts: { t: number; d: number }[] = []
    steps.forEach((s, i) => {
      const expected = at(ts[i])
      let bestD = -1
      for (const d of stepPeaks(s, MIN_CARD_STEP)) {
        if (Math.abs(d - expected) > tol * 1.5) continue
        if (bestD < 0 || s[d] > s[bestD]) bestD = d
      }
      if (bestD >= 0) pts.push({ t: ts[i], d: bestD })
    })
    if (pts.length < need) return { at, support: pts.length }
    const slopes: number[] = []
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        if (pts[b].t - pts[a].t < 0.1) continue
        slopes.push((pts[b].d - pts[a].d) / (pts[b].t - pts[a].t))
      }
    }
    if (!slopes.length) return { at, support: pts.length }
    const slope = median(slopes)
    const offset = median(pts.map((p) => p.d - slope * p.t))
    at = (t: number) => offset + slope * t
  }
  let support = 0
  steps.forEach((s, i) => {
    if (stepPeaks(s, MIN_CARD_STEP).some((d) => Math.abs(d - at(ts[i])) <= tol)) support++
  })
  return { at, support }
}

/**
 * How far a flatten outline may sit off the card, as a share of the side.
 * A shadow under the bottom or left edge (overhead light) puts the quad a
 * couple of millimetres outside the card; a quad that locks onto the inner
 * frame sits a couple of millimetres inside. The print search starts from
 * the card, not from that quad.
 */
const OUTLINE_SLACK_FRAC = 0.03
/** Colour change from a border band into the field. Below this, the step is a line drawn on one colour. */
const MIN_FIELD_CHANGE = 22

/**
 * The card edge near a known outline. The outline is a hint: the real edge is
 * the nearest step into a flat colour that is not the colour just outside it.
 * A shadow rim is flat too, but it matches the outside; the card does not.
 * Falls back to `guess` when nothing in the window qualifies, so a correct
 * outline is unchanged.
 */
function snapToCard(profile: Rgb[], steps: number[], guess: number, dim: number): number {
  const slack = Math.max(24, Math.round(dim * OUTLINE_SLACK_FRAC))
  const g = Math.round(guess)
  const lo = Math.max(1, g - slack)
  const hi = Math.min(steps.length - 2, g + slack)
  const peaks = stepPeaks(steps, MIN_CARD_STEP).filter((d) => d >= lo && d <= hi)
  const qualified: number[] = []
  for (const d of peaks) {
    // Six pixels, not the whole border: a thin frame is only about that wide,
    // and a longer run would include the print edge and look unflat.
    const runEnd = Math.min(profile.length, d + 1 + 6)
    if (runEnd - (d + 1) < 4) continue
    const inside = meanRgb(profile, d + 1, runEnd)
    let spread = 0
    for (let i = d + 1; i < runEnd; i++) spread += colorDist(profile[i], inside)
    spread /= runEnd - (d + 1)
    if (spread > 22) continue
    const before = meanRgb(profile, Math.max(0, d - 8), d)
    if (colorDist(inside, before) < MIN_FIELD_CHANGE) continue
    qualified.push(d)
  }
  if (!qualified.length) return g
  // The outline is usually already on the card edge. A print edge a few pixels
  // further in also qualifies, and must not replace it. Only leave the outline
  // when nothing near it is the card.
  const near = qualified.filter((d) => Math.abs(d - g) <= 6)
  const pool = near.length ? near : qualified
  return pool.reduce((a, b) => (Math.abs(a - g) <= Math.abs(b - g) ? a : b))
}

interface PrintDetail {
  found: number[]
  /** Why the nearest candidate was dropped, when nothing was kept. */
  drop: string | null
}

/**
 * Flat border bands on one station, nearest the card edge first. A dark rim
 * and the real print edge can both be flat; the caller keeps the one stations
 * agree on. Stops once a long stretch is art, so a text box is not a candidate.
 */
function printEdgeDetail(profile: Rgb[], steps: number[], edge: number, dim: number): PrintDetail {
  const peaks = stepPeaks(steps, MIN_STEP)
  const maxPrint = edge + dim * MAX_BORDER_FRAC
  const found: number[] = []
  let drop: string | null = peaks.length ? null : 'no step inward'
  for (const q of peaks) {
    const gap = q - edge
    if (gap < MIN_BORDER_GAP) {
      drop ??= 'too close to the card edge'
      continue
    }
    if (q > maxPrint) {
      drop ??= 'past the widest border'
      break
    }
    // A thin foil frame is only a few pixels. The usual 3px smoothing would
    // swallow it, so a short gap is read one pixel at a time.
    const reach = gap < 18 ? 1 : STEP_REACH
    const bandStart = edge + reach + 1
    const bandEnd = q - reach
    if (bandEnd - bandStart < 2) {
      drop ??= 'band too short'
      continue
    }
    // A wide gap that is still ramping is the card edge's own shoulder, not a frame.
    if (gap >= 18) {
      let inner = 0
      for (let i = bandStart; i < bandEnd; i++) if (steps[i] > inner) inner = steps[i]
      if (inner > steps[q] * 0.5) {
        drop ??= 'still ramping'
        continue
      }
    }
    const mean = meanRgb(profile, bandStart, bandEnd)
    let spread = 0
    for (let i = bandStart; i < bandEnd; i++) spread += colorDist(profile[i], mean)
    spread /= Math.max(1, bandEnd - bandStart)
    // A thin dark or foil frame is a little grainier than a wide cream border.
    // A long band stays strict, so art and text still fail.
    const limit = gap < 14 ? 24 : Math.min(MAX_BAND_SPREAD, Math.max(10, steps[q] * 0.4))
    if (spread > limit) {
      drop ??= 'band not flat'
      if (gap > 18) break
      continue
    }
    // A line drawn on one colour (a power number, a pinstripe) has the same
    // colour on both sides. A print edge enters a different field.
    const afterEnd = Math.min(profile.length, q + 1 + 10)
    if (afterEnd - (q + 1) >= 4 && colorDist(mean, meanRgb(profile, q + 1, afterEnd)) < MIN_FIELD_CHANGE) {
      drop ??= 'same field as the art'
      if (gap > 18) break
      continue
    }
    found.push(q)
    if (gap > 18) break
  }
  return { found, drop: found.length ? null : drop }
}

function dropPhrase(drops: string[]): string {
  if (!drops.length) return 'no step inward'
  const kind = (d: string) =>
    d.startsWith('same field') ? 'same field as the art'
    : d.startsWith('band not flat') ? 'band not flat'
    : d.startsWith('too close') ? 'too close to the card edge'
    : d.startsWith('still ramping') ? 'still ramping'
    : d.startsWith('band too short') ? 'band too short'
    : d.startsWith('past the') ? 'past the widest border'
    : 'no step inward'
  const counts = new Map<string, number>()
  for (const d of drops) counts.set(kind(d), (counts.get(kind(d)) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return `${top[0]} (${top[1]}/${STATIONS})`
}

/** All stations on one side folded into one answer, or an unresolved print edge when they disagree. */
function readSide(img: PixelImage, edge: 'left' | 'right' | 'top' | 'bottom', pad: number, anchor?: number): SideEdges {
  const along = edge === 'left' || edge === 'right'
  const dim = along ? img.width : img.height
  const depth = Math.min(dim - 1, Math.floor(pad + dim * (CARD_EDGE_DEPTH_FRAC + MAX_BORDER_FRAC) + STEP_REACH * 2 + 2))
  const profiles: Rgb[][] = []
  const ts: number[] = []
  for (let s = 0; s < STATIONS; s++) {
    const t = 0.1 + (0.8 * s) / (STATIONS - 1)
    ts.push(t)
    profiles.push(sideProfile(img, edge, t, depth))
  }
  const steps = profiles.map(stepProfile)
  const line = cardEdgeLine(steps, ts, pad, dim, anchor)
  const edgeTol = Math.max(3, Math.round(dim * 0.004))
  const localTol = anchor == null ? edgeTol : Math.max(edgeTol, Math.max(6, Math.round(dim * 0.005)))

  const perStation: number[][] = []
  const drops: string[] = []
  const locals: number[] = []
  profiles.forEach((profile, i) => {
    // A flattened outline is only a hint. Snap to the card edge nearby so a
    // shadow just outside, or a quad just inside, is not where the border is measured from.
    const expected = line ? line.at(ts[i]) : (anchor ?? pad)
    const local = anchor != null
      ? snapToCard(profile, steps[i], anchor, dim)
      : (stepPeaks(steps[i], MIN_CARD_STEP).find((d) => Math.abs(d - expected) <= localTol) ?? Math.round(expected))
    locals.push(local)
    const detail = printEdgeDetail(profile, steps[i], local, dim)
    perStation.push(detail.found.map((q) => q - local))
    if (detail.drop) drops.push(detail.drop)
  })
  const cardEdge = anchor != null ? Math.round(median(locals)) : line ? Math.round(line.at(0.5)) : Math.round(pad)
  const agreed = agreedBorder(perStation)
  let reason = agreed.width != null ? agreed.note : agreed.note || dropPhrase(drops)
  if (anchor != null && Math.abs(cardEdge - anchor) >= 8) {
    const px = Math.abs(Math.round(cardEdge - anchor))
    reason += cardEdge > anchor ? ` · outline ${px}px outside` : ` · outline ${px}px inside`
  }
  if (agreed.width == null) return { edge: cardEdge, print: null, reason }
  return { edge: cardEdge, print: cardEdge + agreed.width, reason }
}

/**
 * The border width stations agree on. A dark rim a few pixels in and the real
 * print edge can both line up; a width of 10px or more wins when it agrees,
 * and a thinner frame is used only when nothing wider does. Full art agrees
 * on neither.
 */
function agreedBorder(perStation: number[][]): { width: number | null; note: string } {
  const need = Math.max(5, Math.ceil(STATIONS * MIN_AGREE))
  const samples: { i: number; w: number }[] = []
  perStation.forEach((ws, i) => {
    for (const w of ws) samples.push({ i, w })
  })
  if (!samples.length) return { width: null, note: '' }
  let thin: { mid: number; n: number } | null = null
  let solid: { mid: number; n: number } | null = null
  let bestFail: { mid: number; n: number; bar: number } | null = null
  for (const seed of samples) {
    const tol = Math.max(3, seed.w * 0.2)
    const hit = new Map<number, number>()
    for (const s of samples) {
      if (Math.abs(s.w - seed.w) > tol) continue
      const prev = hit.get(s.i)
      if (prev == null || Math.abs(s.w - seed.w) < Math.abs(prev - seed.w)) hit.set(s.i, s.w)
    }
    const mid = median([...hit.values()])
    // A few pixels of anti-alias line up on part of a full-art edge. A real thin
    // frame lines up along most of the side, so it has to convince more stations.
    const thinNeed = Math.max(need, Math.ceil(STATIONS * 0.6))
    const bar = mid < 10 ? thinNeed : need
    if (hit.size < bar) {
      if (!bestFail || hit.size > bestFail.n) bestFail = { mid, n: hit.size, bar }
      continue
    }
    const rec = { mid, n: hit.size }
    if (mid >= 10) {
      if (!solid || mid < solid.mid) solid = rec
    } else if (!thin || mid < thin.mid) thin = rec
  }
  const chosen = solid ?? thin
  if (chosen == null || chosen.mid < MIN_PRINT_BORDER_PX) {
    const f = bestFail
    return { width: null, note: f ? `${Math.round(f.mid)}px on ${f.n}/${STATIONS}, need ${f.bar}` : 'no agreement' }
  }
  return { width: chosen.mid, note: `${Math.round(chosen.mid)}px on ${chosen.n}/${STATIONS}` }
}

function scanCardEdges(
  frame: PixelImage,
  pad: number,
  anchor?: { left: number; right: number; top: number; bottom: number },
): { left: SideEdges; right: SideEdges; top: SideEdges; bottom: SideEdges } {
  return {
    left: readSide(frame, 'left', pad, anchor?.left),
    right: readSide(frame, 'right', pad, anchor?.right),
    top: readSide(frame, 'top', pad, anchor?.top),
    bottom: readSide(frame, 'bottom', pad, anchor?.bottom),
  }
}

function edgeNotesOf(e: { left: SideEdges; right: SideEdges; top: SideEdges; bottom: SideEdges }): Record<EdgeName, string> {
  return { left: e.left.reason, right: e.right.reason, top: e.top.reason, bottom: e.bottom.reason }
}

/** Sides that found no print border, or whose border is too thin to be one. */
function unresolvedSidesOf(e: { left: SideEdges; right: SideEdges; top: SideEdges; bottom: SideEdges }): EdgeName[] {
  const names: EdgeName[] = ['left', 'right', 'top', 'bottom']
  return names.filter((n) => {
    const s = e[n]
    return s.print == null || s.print - s.edge < MIN_PRINT_BORDER_PX
  })
}

/** Border widths from the four sides, or null when any side could not resolve its print edge. */
function printBorders(e: { left: SideEdges; right: SideEdges; top: SideEdges; bottom: SideEdges }): {
  left: number
  right: number
  top: number
  bottom: number
} | null {
  const sides = [e.left, e.right, e.top, e.bottom]
  if (sides.some((s) => s.print == null)) return null
  const w = (s: SideEdges) => (s.print as number) - s.edge
  const out = { left: w(e.left), right: w(e.right), top: w(e.top), bottom: w(e.bottom) }
  if (!bordersResolved(out.left, out.right, out.top, out.bottom)) return null
  return out
}
