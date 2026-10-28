import { describe, expect, it } from 'vitest'
import { eligibleAmount, taxCredit } from './tax'

describe('tax credit', () => {
  it('caps a 연금저축 at 6M and the total at 9M', () => {
    expect(eligibleAmount('saving', 8_400_000, 0)).toBe(6_000_000)
    expect(eligibleAmount('saving', 8_400_000, 3_000_000)).toBe(9_000_000)
    expect(eligibleAmount('irp', 8_400_000, 0)).toBe(8_400_000)
    expect(eligibleAmount('irp', 8_400_000, 1_000_000)).toBe(9_000_000)
  })

  it('projects the year-end credit and the room left', () => {
    const t = taxCredit({ type: 'saving', paid: 6_300_000, other: 0, monthly: 700_000, depositsLeft: 2, rate: 0.165 })
    expect(t.projected).toBe(7_700_000)
    expect(t.credit).toBe(990_000)
    expect(t.room).toBe(0)
    const irp = taxCredit({ type: 'irp', paid: 6_300_000, other: 0, monthly: 700_000, depositsLeft: 2, rate: 0.132 })
    expect(irp.room).toBe(1_300_000)
    expect(irp.projectedCredit).toBe(Math.round(7_700_000 * 0.132))
  })
})
