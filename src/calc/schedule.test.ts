import { describe, expect, it } from 'vitest'
import { daysBetween, depositDateOf, depositsLeftThisYear, nextDepositDate, nextWeekday } from './schedule'

describe('schedule', () => {
  it('finds the next deposit day', () => {
    expect(nextDepositDate('2026-10-21', 21)).toBe('2026-10-21')
    expect(nextDepositDate('2026-10-28', 21)).toBe('2026-11-21')
    expect(nextDepositDate('2026-12-28', 21)).toBe('2027-01-21')
    expect(depositDateOf(2026, 2, 31)).toBe('2026-02-28')
    expect(daysBetween('2026-10-28', '2026-11-21')).toBe(24)
  })

  it('moves a weekend to Monday', () => {
    expect(nextWeekday('2026-11-21')).toBe('2026-11-23') // Saturday
    expect(nextWeekday('2026-12-21')).toBe('2026-12-21') // Monday
  })

  it('counts deposits left this year', () => {
    expect(depositsLeftThisYear('2026-10-28', 21, true)).toBe(2)
    expect(depositsLeftThisYear('2026-10-10', 21, false)).toBe(3)
    expect(depositsLeftThisYear('2026-10-21', 21, true)).toBe(2)
  })
})
