/**
 * The photo guide on /pregrade: what to do before uploading, and which tip to
 * point at when a check comes back with glare, an angled or hand-held card, or
 * a photo that was too small. Plain words for collectors; no jargon.
 */
import { MIN_SHORT_SIDE_PX } from './centering'
import type { PhotoCentering } from './centeringSummary'

export type PhotoTipId = 'surface' | 'straight' | 'hands' | 'light' | 'tilt' | 'fill' | 'original' | 'fullart'

export interface PhotoTip {
  id: PhotoTipId
  /** Short line, used in the collapsed guide and as the link text next to a result. */
  short: string
  /** The full tip. */
  text: string
}

export const PHOTO_TIPS: readonly PhotoTip[] = [
  {
    id: 'surface',
    short: 'Lay it flat on a plain surface',
    text: 'Lay the card flat on a plain surface that contrasts with it: white paper under a dark card, a dark mat under a light one. Not on your palm, not on a busy tablecloth.',
  },
  {
    id: 'straight',
    short: 'Shoot straight down, edges in frame',
    text: 'Hold the phone level and shoot straight down, so the card is a rectangle and not a trapezoid. Get all four edges in the frame with a little margin around them.',
  },
  {
    id: 'hands',
    short: 'Don’t hold the card',
    text: 'Put the card down and take your hands out of the frame. Fingers along an edge hide the border and the measurement reads the hand instead of the card.',
  },
  {
    id: 'light',
    short: 'Soft, even light; no lamp in the foil',
    text: 'Use soft, even light, ideally a small LED light box. Switch off a lamp that reflects in the foil, and avoid a window behind you. Glare hides scratches and whitening.',
  },
  {
    id: 'tilt',
    short: 'A tilted extra shot to check glare',
    text: 'Take one more shot with the card tilted a little. If a bright patch moves, it was glare and not a mark. Upload the straight shot; keep the tilted one for yourself.',
  },
  {
    id: 'fill',
    short: 'Fill most of the frame',
    text: 'Move closer so the card fills most of the frame. A small card in a big photo leaves too few pixels on each border to measure.',
  },
  {
    id: 'original',
    short: `Upload the original (${MIN_SHORT_SIDE_PX}px short side or more)`,
    text: `Upload the original file from your camera roll, not a copy that went through a chat app. Chat apps shrink photos; the short side needs ${MIN_SHORT_SIDE_PX}px or more. The photo is shrunk here on your phone before it leaves.`,
  },
  {
    id: 'fullart',
    short: 'Full-art fronts may not measure centering',
    text: 'Honest limit: full-art and alt-art cards with no plain border on the front may not measure front centering. The card is found, but there is no border line to read. The back usually still measures, and nothing is ruled out by a side that could not be read.',
  },
]

/** The headline for the collapsed guide, once the collector has used the check. */
export const PHOTO_GUIDE_SHORT = 'Flat on a plain surface · straight down · hands out · soft light · the original file.'

export function photoTip(id: PhotoTipId): PhotoTip {
  return PHOTO_TIPS.find((t) => t.id === id) as PhotoTip
}

export interface PhotoOutcome {
  front: PhotoCentering | null
  back: PhotoCentering | null
  /** Defect flags from the model per part, when it gave a condition. */
  flags?: readonly string[]
}

/**
 * Which tips to show next to a result, in the order they help most. Empty
 * when nothing in the result points at the photos.
 */
export function tipsForOutcome(outcome: PhotoOutcome): PhotoTipId[] {
  const out = new Set<PhotoTipId>()
  for (const c of [outcome.front, outcome.back]) {
    if (!c) continue
    if (c.measured) continue
    switch (c.reason) {
      case 'short-side':
        out.add('original')
        out.add('fill')
        break
      case 'angled':
        out.add('surface')
        out.add('straight')
        out.add('hands')
        break
      case 'no-card':
        out.add('surface')
        out.add('hands')
        break
      case 'cut-off':
        out.add('straight')
        break
      case 'no-print-edge':
        // Only the front has the full-art problem; a back with no border was glare, a hand or a dark ground.
        if (c.side === 'front') out.add('fullart')
        else {
          out.add('hands')
          out.add('surface')
        }
        break
      case 'unreadable':
        out.add('original')
        break
      default:
        break
    }
  }
  const flags = outcome.flags ?? []
  if (flags.includes('glare')) {
    out.add('light')
    out.add('tilt')
  }
  if (flags.includes('blur') || flags.includes('unclear_photo')) {
    out.add('original')
    out.add('fill')
  }
  return PHOTO_TIPS.map((t) => t.id).filter((id) => out.has(id))
}

/** All flags from a condition block, whatever parts it has. */
export function flagsOf(condition: { corners: { flags: string[] }; edges: { flags: string[] }; surface: { flags: string[] } } | null | undefined): string[] {
  if (!condition) return []
  return [...condition.corners.flags, ...condition.edges.flags, ...condition.surface.flags]
}
