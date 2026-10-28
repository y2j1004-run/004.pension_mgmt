import { describe, expect, it } from 'vitest'
import { xirr } from './xirr'

describe('xirr', () => {
  it('is the plain yearly return for one deposit held a year', () => {
    expect(xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1100 }])).toBeCloseTo(0.1, 4)
  })

  it('weighs later deposits for less time', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2025-07-02', amount: -1000 },
      { date: '2026-01-01', amount: 2150 },
    ])!
    expect(r).toBeGreaterThan(0.09)
    expect(r).toBeLessThan(0.11)
  })

  it('handles losses', () => {
    expect(xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 800 }])).toBeCloseTo(-0.2, 4)
  })

  it('skips periods too short to annualize', () => {
    expect(xirr([{ date: '2026-01-01', amount: -1000 }, { date: '2026-02-01', amount: 1100 }])).toBeUndefined()
  })
})
