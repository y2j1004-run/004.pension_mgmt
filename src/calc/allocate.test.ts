import { describe, expect, it } from 'vitest'
import { currentWeights, only, planBuys, type PlanItem } from './allocate'

const items: PlanItem[] = [
  { code: 'US', price: 20_000, qty: 60, targetPct: 60, risky: true },
  { code: 'KR', price: 30_000, qty: 10, targetPct: 20, risky: true },
  { code: 'BOND', price: 10_000, qty: 20, targetPct: 20 },
]

describe('planBuys', () => {
  it('fills the most underweight funds first and never spends more than the cash', () => {
    // held 1.2M + 0.3M + 0.2M = 1.7M, +0.7M cash = 2.4M; targets 1.44M / 0.48M / 0.48M
    const plan = planBuys(items, 700_000)
    const by = Object.fromEntries(plan.lines.map((l) => [l.code, l.buyQty]))
    expect(by.BOND).toBe(28)
    expect(by.KR).toBe(6)
    expect(by.US).toBe(12)
    expect(plan.spent).toBeLessThanOrEqual(700_000)
    expect(plan.spent + plan.leftover).toBe(700_000)
    for (const l of plan.lines) expect(Math.abs(l.afterPct - l.targetPct)).toBeLessThan(1)
  })

  it('puts a new fund with no holdings to the front of the queue', () => {
    const plan = planBuys([...items.map((i) => ({ ...i, targetPct: i.targetPct * 0.9 })), { code: 'NEW', price: 10_000, qty: 0, targetPct: 10 }], 700_000)
    expect(plan.lines.find((l) => l.code === 'NEW')!.buyQty).toBe(24)
  })

  it('keeps risky assets under the IRP/DC limit', () => {
    const plan = planBuys(
      [
        { code: 'STOCK', price: 10_000, qty: 65, targetPct: 100, risky: true },
        { code: 'BOND', price: 10_000, qty: 30, targetPct: 0 },
      ],
      500_000,
      { riskyLimitPct: 70 },
    )
    expect(plan.riskyAfterPct).toBeLessThanOrEqual(70)
    // 1.45M in all, so 70% is 1,015,000: 650,000 + 36 shares
    expect(plan.lines[0].buyQty).toBe(36)
    expect(plan.limitedByRisk).toBe(true)
  })

  it('buys nothing without targets', () => {
    expect(planBuys(items.map((i) => ({ ...i, targetPct: 0 })), 700_000).spent).toBe(0)
  })

  it('can follow current weights or put everything into one fund', () => {
    expect(planBuys(only(items, 'KR'), 700_000).lines.find((l) => l.code === 'KR')!.buyQty).toBe(23)
    const keep = planBuys(currentWeights(items), 680_000)
    expect(keep.lines.map((l) => l.buyQty)).toEqual([24, 4, 8])
  })
})
