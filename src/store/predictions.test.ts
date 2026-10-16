import { describe, expect, it } from 'vitest'
import { listPredictions } from './predictions'

describe('prediction log', () => {
  it('useSyncExternalStore snapshot is referentially stable', () => {
    expect(listPredictions()).toBe(listPredictions())
  })
})
