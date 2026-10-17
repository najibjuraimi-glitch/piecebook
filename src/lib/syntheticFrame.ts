/**
 * Realistic phone-camera frames for tests: a card rendered through a
 * homography onto a textured ground, with uneven light, rounded corners,
 * lens softness and sensor grain. Deterministic, so a test that passes
 * passes every time. Not part of the app bundle: only tests import it.
 */
import type { PixelImage, Point, Quad } from './centering'
import { homographyFromQuads, type Mat3 } from './cardFrame'

export type Rgb = [number, number, number]

export interface FrameOptions {
  width: number
  height: number
  /** Card corners in image pixels: top-left, top-right, bottom-right, bottom-left. */
  quad: Quad
  /** Which face is shown. */
  face: 'back' | 'front'
  /** Mean ground colour. */
  ground?: Rgb
  /** Fabric or table texture amplitude, ± levels. */
  texture?: number
  /** Light falls off toward this edge of the frame: the card there is this much darker (0–1). */
  shade?: { edge: 'top' | 'bottom' | 'left' | 'right'; amount: number }
  /** Lens and JPEG softness: number of 3×3 box passes. */
  soft?: number
  /** Sensor grain, ± levels per channel. */
  noise?: number
  /** Corner radius as a share of the card width. Real cards are about 0.045. */
  cornerRadius?: number
  /** Border colours and widths override the face defaults. */
  border?: { colour: Rgb; frac: number }
  /** A bright blown patch on the card, in card-space (0–1) coordinates and radius as share of card width. */
  glare?: { x: number; y: number; r: number }
  seed?: number
}

export const CARD_BACK_PURPLE: Rgb = [70, 46, 128]
export const CARD_BACK_BORDER: Rgb = [112, 92, 170]
export const KHAKI_FABRIC: Rgb = [96, 92, 80]
export const MID_GREY_CLOTH: Rgb = [128, 126, 122]

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth value noise in 0–1 at one scale. */
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const gx = x / scale
  const gy = y / scale
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const fx = gx - x0
  const fy = gy - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash2(x0, y0, seed)
  const b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed)
  const d = hash2(x0 + 1, y0 + 1, seed)
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** Colour of the card at card-space (u, v) in 0–1, or null outside the rounded rectangle. */
function cardColour(u: number, v: number, o: FrameOptions, aspect: number): Rgb | null {
  const r = o.cornerRadius ?? 0.045
  // Rounded corners, in units where the card is 1 wide and `aspect` tall.
  const x = u
  const y = v * aspect
  const w = 1
  const h = aspect
  if (x < 0 || y < 0 || x > w || y > h) return null
  const cx = x < r ? r : x > w - r ? w - r : x
  const cy = y < r ? r : y > h - r ? h - r : y
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null
  const border = o.border ?? (o.face === 'back' ? { colour: CARD_BACK_BORDER, frac: 0.045 } : { colour: [250, 248, 242] as Rgb, frac: 0.055 })
  const bf = border.frac
  const inBorder = x < bf || x > w - bf || y < bf || y > h - bf
  if (inBorder) return border.colour
  if (o.face === 'back') {
    // The ONE PIECE back: purple field, a web of thin light lines, a compass disc and a text block.
    let col: Rgb = [...CARD_BACK_PURPLE] as Rgb
    const lines = Math.sin((x * 9 + y * 4) * Math.PI) * Math.sin((x * 3 - y * 7) * Math.PI)
    if (Math.abs(lines) > 0.985) col = [150, 128, 190]
    const dx = (x - 0.5) / 0.3
    const dy = (y - 0.46) / 0.3
    const rr = Math.sqrt(dx * dx + dy * dy)
    if (rr < 1 && rr > 0.85) col = [226, 196, 120]
    if (rr < 0.6 && rr > 0.5) col = [226, 196, 120]
    if (rr < 0.12) col = [226, 196, 120]
    const needle = Math.abs(dx - dy * 0.6) < 0.06 && rr < 0.95
    if (needle) col = [240, 214, 140]
    if (y > 1.02 && y < 1.1 && x > 0.2 && x < 0.8) col = [236, 230, 220]
    if (y > 1.12 && y < 1.16 && x > 0.3 && x < 0.7) col = [236, 230, 220]
    return col
  }
  // Front: white border, a dark painterly art panel with a text box and a thin frame line.
  const onLine = x < bf + 0.006 || x > w - bf - 0.006 || y < bf + 0.006 || y > h - bf - 0.006
  if (onLine) return [20, 20, 24]
  const art: Rgb = [150 + 60 * Math.sin(x * 11 + y * 5), 60 + 40 * Math.sin(y * 9), 50 + 30 * Math.cos(x * 7 - y * 3)]
  if (y > 0.98 && y < 1.2 && x > 0.1 && x < 0.9) return [236, 230, 220]
  return art
}

/**
 * Render one frame. The card is sampled 2×2 per pixel through the inverse
 * homography so its edges are anti-aliased like a real photo's, then the
 * frame is softened and grained.
 */
export function renderFrame(o: FrameOptions): PixelImage {
  const { width, height } = o
  const seed = o.seed ?? 7
  const ground = o.ground ?? KHAKI_FABRIC
  const texture = o.texture ?? 10
  const aspect = 88 / 63
  // Card space: unit square (0..1) × (0..1) mapped onto the quad; v scaled by aspect inside cardColour.
  const unit: Quad = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]
  const toCard = homographyFromQuads(o.quad, unit) as Mat3
  const data = new Uint8ClampedArray(width * height * 4)
  const shade = o.shade
  const shadeAt = (x: number, y: number): number => {
    if (!shade) return 1
    let t: number
    switch (shade.edge) {
      case 'top':
        t = 1 - y / height
        break
      case 'bottom':
        t = y / height
        break
      case 'left':
        t = 1 - x / width
        break
      default:
        t = x / width
    }
    // Dark at the shaded edge, full light by the middle of the frame.
    return 1 - shade.amount * Math.max(0, Math.min(1, (t - 0.5) * 2))
  }
  const glare = o.glare
  const samples = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Ground: two scales of texture, like a woven cloth, plus a slow blotch.
      const fine = (valueNoise(x, y, 2.3, seed) - 0.5) * texture * 1.2
      const weave = (valueNoise(x, y, 7, seed + 1) - 0.5) * texture
      const blotch = (valueNoise(x, y, 60, seed + 2) - 0.5) * texture * 0.8
      const g: Rgb = [ground[0] + fine + weave + blotch, ground[1] + fine + weave + blotch * 0.9, ground[2] + fine * 0.9 + weave + blotch * 0.7]
      let r = 0
      let gg = 0
      let b = 0
      let cover = 0
      for (const [sx, sy] of samples) {
        const px = x + sx
        const py = y + sy
        const w = toCard[6] * px + toCard[7] * py + toCard[8]
        const u = (toCard[0] * px + toCard[1] * py + toCard[2]) / w
        const v = (toCard[3] * px + toCard[4] * py + toCard[5]) / w
        let c = cardColour(u, v, o, aspect)
        if (c && glare) {
          const du = (u - glare.x) / glare.r
          const dv = ((v - glare.y) * aspect) / glare.r
          if (du * du + dv * dv < 1) c = [255, 255, 255]
        }
        if (c) {
          r += c[0]
          gg += c[1]
          b += c[2]
          cover++
        }
      }
      const k = cover / 4
      const light = shadeAt(x, y)
      // Ground lies a little lower than the card, so it is shaded a little less: the card's own
      // shadow is what makes the near edge hard to see on a real table.
      const groundLight = 1 - (1 - light) * 0.8
      const out: Rgb = [
        (cover ? r / cover : 0) * k * light + g[0] * (1 - k) * groundLight,
        (cover ? gg / cover : 0) * k * light + g[1] * (1 - k) * groundLight,
        (cover ? b / cover : 0) * k * light + g[2] * (1 - k) * groundLight,
      ]
      const i = (y * width + x) * 4
      data[i] = clamp255(out[0])
      data[i + 1] = clamp255(out[1])
      data[i + 2] = clamp255(out[2])
      data[i + 3] = 255
    }
  }
  let img: PixelImage = { width, height, data }
  for (let p = 0; p < (o.soft ?? 1); p++) img = boxBlur3(img)
  const noise = o.noise ?? 6
  if (noise > 0) {
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (hash2(i, i >> 7, seed + 9) - 0.5) * 2 * noise
      const nc = (hash2(i + 1, i >> 5, seed + 11) - 0.5) * noise
      d[i] = clamp255(d[i] + n + nc)
      d[i + 1] = clamp255(d[i + 1] + n)
      d[i + 2] = clamp255(d[i + 2] + n - nc)
    }
  }
  return img
}

export function boxBlur3(img: PixelImage): PixelImage {
  const { width: w, height: h } = img
  const src = img.data
  const tmp = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1)
      const x1 = Math.min(w - 1, x + 1)
      for (let c = 0; c < 3; c++) {
        tmp[(y * w + x) * 3 + c] = (src[(y * w + x0) * 4 + c] + src[(y * w + x) * 4 + c] + src[(y * w + x1) * 4 + c]) / 3
      }
    }
  }
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1)
    const y1 = Math.min(h - 1, y + 1)
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        out[(y * w + x) * 4 + c] = (tmp[(y0 * w + x) * 3 + c] + tmp[(y * w + x) * 3 + c] + tmp[(y1 * w + x) * 3 + c]) / 3
      }
      out[(y * w + x) * 4 + 3] = 255
    }
  }
  return { width: w, height: h, data: out }
}

/** A card quad centred in the frame with the given height share, optional in-plane rotation and keystone (top edge narrower). */
export function centredQuad(width: number, height: number, heightFrac: number, opts: { rotateDeg?: number; keystone?: number; dx?: number; dy?: number } = {}): Quad {
  const h = height * heightFrac
  const w = h * (63 / 88)
  const cx = width / 2 + (opts.dx ?? 0)
  const cy = height / 2 + (opts.dy ?? 0)
  const k = opts.keystone ?? 0
  const pts: Point[] = [
    { x: -w / 2 + (w * k) / 2, y: -h / 2 },
    { x: w / 2 - (w * k) / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ]
  const a = ((opts.rotateDeg ?? 0) * Math.PI) / 180
  return pts.map((p) => ({ x: cx + p.x * Math.cos(a) - p.y * Math.sin(a), y: cy + p.x * Math.sin(a) + p.y * Math.cos(a) })) as Quad
}

/** Largest corner error between two quads, in pixels. */
export function quadError(a: Quad, b: Quad): number {
  let worst = 0
  for (let i = 0; i < 4; i++) worst = Math.max(worst, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y))
  return worst
}
