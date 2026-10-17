import { describe, expect, it } from 'vitest'
import { photoWouldChangeTheCall } from './photoNote'

describe('photoWouldChangeTheCall', () => {
  const both = {
    frontCannotBeTen: false,
    backCannotBeTen: false,
    hasFront: true,
    hasBack: true,
  }

  it('names vision once corners, edges and surface have been read', () => {
    expect(photoWouldChangeTheCall(both)).toMatch(/not read yet/)
    expect(photoWouldChangeTheCall({ ...both, visionRead: true })).toMatch(/did not find a defect/)
    expect(photoWouldChangeTheCall({ ...both, visionRead: true, visionRuledOut: true })).toMatch(/rule out a PSA 10/)
  })
})
