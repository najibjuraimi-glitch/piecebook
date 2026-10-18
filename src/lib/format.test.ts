import { describe, expect, it } from 'vitest'
import { localDayIso, singaporeDay, todayIso } from './format'

describe('Singapore day', () => {
  it('uses the Singapore calendar day near midnight when the device is not in Singapore', () => {
    // npm test pins TZ=UTC, so this stays the previous evening even on a Singapore Mac.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe('Asia/Singapore')
    // 15:59 UTC is still 16 Oct in Singapore. 16:01 UTC is 00:01 on 17 Oct.
    const before = new Date('2026-10-16T15:59:00.000Z')
    const after = new Date('2026-10-16T16:01:00.000Z')
    expect(singaporeDay(before)).toBe('2026-10-16')
    expect(singaporeDay(after)).toBe('2026-10-17')
    expect(localDayIso(after)).toBe('2026-10-17')
    expect(localDayIso('2026-10-16T16:01:00.000Z')).toBe('2026-10-17')
    expect(localDayIso('2026-10-16')).toBe('2026-10-16')
    const deviceDay = `${after.getFullYear()}-${String(after.getMonth() + 1).padStart(2, '0')}-${String(after.getDate()).padStart(2, '0')}`
    expect(deviceDay).toBe('2026-10-16')
    expect(localDayIso(after)).not.toBe(deviceDay)
    expect(todayIso()).toBe(singaporeDay(new Date()))
  })
})
