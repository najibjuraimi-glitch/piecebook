import { describe, expect, it } from 'vitest'
import { findCardOutline } from './cardOutline'
import { flattenCard } from './cardFrame'
import { measurePhoto, type Quad } from './centering'
import { KHAKI_FABRIC, MID_GREY_CLOTH, centredQuad, quadError, renderFrame } from './syntheticFrame'

const W = 320
const H = 427

function expectLocked(quad: Quad, extra: Parameters<typeof renderFrame>[0] extends infer _ ? Omit<Parameters<typeof renderFrame>[0], 'width' | 'height' | 'quad'> : never, maxErr: number) {
  const img = renderFrame({ width: W, height: H, quad, ...extra })
  const found = findCardOutline(img)
  expect(found.ok).toBe(true)
  if (!found.ok) return
  expect(quadError(found.outline.quad, quad)).toBeLessThan(maxErr)
  expect(found.outline.confidence).toBeGreaterThan(0.7)
  expect(found.outline.support).toHaveLength(4)
  expect(found.outline.support.every((s) => s > 0.5)).toBe(true)
}

describe('card outline on phone-like frames', () => {
  it('locks onto a card back on khaki cloth with the top in shade', () => {
    const quad = centredQuad(W, H, 0.62)
    expectLocked(quad, { face: 'back', ground: KHAKI_FABRIC, shade: { edge: 'top', amount: 0.6 }, texture: 10, noise: 6 }, 4)
  })

  it('locks onto a card back on mid-grey textured cloth', () => {
    const quad = centredQuad(W, H, 0.6)
    expectLocked(quad, { face: 'back', ground: MID_GREY_CLOTH, texture: 12, noise: 6 }, 4)
  })

  it('follows rotation, keystone, grain and a card that is far away', () => {
    const rotated = centredQuad(W, H, 0.58, { rotateDeg: 14 })
    expectLocked(rotated, { face: 'back', ground: KHAKI_FABRIC, noise: 8 }, 4)
    const keyed = centredQuad(W, H, 0.6, { keystone: 0.08 })
    expectLocked(keyed, { face: 'back', ground: KHAKI_FABRIC }, 4)
    const far = centredQuad(W, H, 0.3)
    expectLocked(far, { face: 'back', ground: KHAKI_FABRIC }, 5)
  })

  it('locks onto a front on grey cloth', () => {
    const quad = centredQuad(W, H, 0.62, { rotateDeg: -2 })
    expectLocked(quad, { face: 'front', ground: MID_GREY_CLOTH, texture: 12 }, 4)
  })

  it('reports a card running off the frame, an empty cloth, and a non-card rectangle', () => {
    const off = centredQuad(W, H, 0.7, { dy: -120 })
    expect(findCardOutline(renderFrame({ width: W, height: H, quad: off, face: 'back', ground: KHAKI_FABRIC })).ok).toBe(false)
    expect(findCardOutline(renderFrame({ width: W, height: H, quad: off, face: 'back', ground: KHAKI_FABRIC }))).toEqual({ ok: false, reason: 'cut-off' })
    const gone = centredQuad(W, H, 0.6, { dy: 2000 })
    expect(findCardOutline(renderFrame({ width: W, height: H, quad: gone, face: 'back', ground: KHAKI_FABRIC, texture: 12 }))).toEqual({
      ok: false,
      reason: 'no-card',
    })
    const h = H * 0.6
    const w = h * 0.46
    const phone: Quad = [
      { x: W / 2 - w / 2, y: H / 2 - h / 2 },
      { x: W / 2 + w / 2, y: H / 2 - h / 2 },
      { x: W / 2 + w / 2, y: H / 2 + h / 2 },
      { x: W / 2 - w / 2, y: H / 2 + h / 2 },
    ]
    expect(findCardOutline(renderFrame({ width: W, height: H, quad: phone, face: 'back', ground: KHAKI_FABRIC }))).toEqual({ ok: false, reason: 'no-card' })
  })

  it('does not sit on the inner border when the cloth is rough', () => {
    const quad = centredQuad(W, H, 0.62)
    const found = findCardOutline(renderFrame({ width: W, height: H, quad, face: 'back', ground: MID_GREY_CLOTH, texture: 22, noise: 8 }))
    if (found.ok) expect(quadError(found.outline.quad, quad)).toBeLessThan(6)
    else expect(found.reason).toBe('no-card')
  })

  it('does not flatten the print border when a mid-grey cloth is shaded', () => {
    const quad = centredQuad(W, H, 0.62)
    const found = findCardOutline(
      renderFrame({ width: W, height: H, quad, face: 'back', ground: MID_GREY_CLOTH, texture: 8, noise: 5, shade: { edge: 'top', amount: 0.5 }, soft: 1 }),
    )
    if (found.ok) expect(quadError(found.outline.quad, quad)).toBeLessThan(6)
    else expect(found.reason).toBe('no-card')
  })

  it('flattens a back and the print border can be read', () => {
    const quad = centredQuad(1000, 1400, 0.72)
    const img = renderFrame({ width: 1000, height: 1400, quad, face: 'back', ground: KHAKI_FABRIC, texture: 8, noise: 4, shade: { edge: 'top', amount: 0.45 } })
    const flat = flattenCard(img)
    expect(flat.flattened).toBe(true)
    if (!flat.flattened) return
    const measured = measurePhoto(flat.image, 'back', { outline: flat.cardQuad })
    expect(measured.ok).toBe(true)
    if (!measured.ok) return
    expect(measured.measure.resolved).toBe(true)
  })
})
