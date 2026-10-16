import { beforeEach, describe, expect, it } from 'vitest'
import { clearVisionSession, confirmVisionCard, peekVisionSession, writeVisionSession } from './visionSession'

const FRONT = 'data:image/jpeg;base64,AAAA'

describe('visionSession', () => {
  beforeEach(() => clearVisionSession())

  it('carries photos to the worksheet with no check when the model refused the card', () => {
    writeVisionSession({ check: null, frontDataUrl: FRONT, confirmedCardNumber: 'EB02-010_p1' })
    const s = peekVisionSession()
    expect(s).toEqual({ check: null, frontDataUrl: FRONT, backDataUrl: undefined, confirmedCardNumber: 'EB02-010_p1' })
  })

  it('confirming a card keeps a null check', () => {
    writeVisionSession({ check: null, frontDataUrl: FRONT })
    expect(confirmVisionCard('ST01-007')?.confirmedCardNumber).toBe('ST01-007')
    expect(peekVisionSession()?.check).toBeNull()
  })
})
