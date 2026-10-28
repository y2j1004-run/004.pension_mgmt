import { describe, expect, it } from 'vitest'
import type { PricePoint } from '../model'
import { addDays } from './portfolio'
import { correlatedPairs, correlation, recommend, trendStats, type FundInput } from './trend'

const END = '2026-10-28'

/** weekday closes for ~7 months: steady growth `daily`, plus a wobble of size `amp` */
function series(code: string, daily: number, amp = 0, phase = 0, from = 210): PricePoint[] {
  const out: PricePoint[] = []
  let price = 10_000
  for (let d = from; d >= 0; d--) {
    const date = addDays(END, -d)
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (dow === 0 || dow === 6) continue
    price *= 1 + daily + amp * Math.sin(d * 0.9 + phase)
    out.push({ code, date, price })
  }
  return out
}

describe('trendStats', () => {
  it('measures a steady climb', () => {
    const s = trendStats('A', series('A', 0.001), END)!
    expect(s.days).toBeGreaterThan(120)
    expect(s.ret6m).toBeGreaterThan(0.1)
    expect(s.ret3m).toBeGreaterThan(0.05)
    expect(s.r2).toBeGreaterThan(0.95)
    expect(s.mdd).toBeCloseTo(0, 5)
    expect(s.vol).toBeLessThan(0.01)
    expect(s.aboveAvg).toBe(true)
  })

  it('measures a choppy one', () => {
    const s = trendStats('B', series('B', 0, 0.02), END)!
    expect(s.vol).toBeGreaterThan(0.2)
    expect(s.mdd).toBeLessThan(-0.02)
    expect(s.ret1m).not.toBeUndefined()
  })

  it('leaves out 3-month change for a fund listed last month', () => {
    const s = trendStats('N', series('N', 0.001, 0, 0, 40), END)!
    expect(s.ret3m).toBeUndefined()
    expect(s.days).toBeLessThan(40)
  })
})

describe('correlation', () => {
  it('is high for funds that move together and low otherwise', () => {
    const a = series('A', 0.0005, 0.01)
    const b = series('B', 0.0007, 0.01)
    const c = series('C', 0.0005, 0.01, 2)
    expect(correlation(a, b, END)).toBeGreaterThan(0.95)
    expect(correlation(a, c, END)!).toBeLessThan(0.5)
    const book = new Map([
      ['A', a],
      ['B', b],
      ['C', c],
    ])
    expect(correlatedPairs(['A', 'B', 'C'], book, END).map((p) => p.a + p.b)).toEqual(['AB'])
  })
})

const fund = (code: string, target: number, s: PricePoint[] | undefined, risky = true): FundInput => ({
  code,
  name: code,
  risky,
  target,
  weight: target,
  stats: s && trendStats(code, s, END),
})

describe('recommend', () => {
  const winner = series('WIN', 0.002, 0.006)
  const loser = series('LOSE', -0.0025, 0.006, 1)
  const calm = series('CALM', 0.0003, 0.002, 2)
  const funds = [fund('WIN', 40, winner), fund('LOSE', 40, loser), fund('CALM', 20, calm, false)]

  it('tilts toward stronger risk-adjusted trends and adds up to 100', () => {
    const r = recommend(funds, { style: 'balanced', maxPct: 100 })
    const to = Object.fromEntries(r.lines.map((l) => [l.code, l.to]))
    expect(to.WIN).toBeGreaterThan(to.LOSE)
    expect(to.LOSE).toBeLessThan(40)
    expect(r.lines.reduce((s, l) => s + l.to, 0)).toBeCloseTo(100, 5)
    expect(r.lines.find((l) => l.code === 'LOSE')!.reasons.some((x) => x.includes('부진'))).toBe(true)
  })

  it('moves further the more active the style', () => {
    const gentle = recommend(funds, { style: 'gentle', maxPct: 100 }).lines[1].to
    const active = recommend(funds, { style: 'active', maxPct: 100 }).lines[1].to
    expect(active).toBeLessThan(gentle)
  })

  it('caps a single fund', () => {
    const r = recommend([fund('WIN', 80, winner), fund('CALM', 20, calm)], { style: 'active', maxPct: 40 })
    // two funds can't both stay under 40%, so the cap gives what it can
    expect(r.lines[0].to).toBeLessThanOrEqual(60)
    const three = recommend([fund('WIN', 70, winner), fund('LOSE', 15, loser), fund('CALM', 15, calm)], { style: 'active', maxPct: 40 })
    expect(Math.max(...three.lines.map((l) => l.to))).toBeLessThanOrEqual(40)
    expect(three.lines[0].reasons.some((x) => x.includes('최대 40%'))).toBe(true)
  })

  it('suggests dropping tiny holdings when asked', () => {
    const r = recommend([...funds, fund('TINY', 1, series('TINY', 0.0005, 0.004))], { style: 'balanced', minPct: 3 })
    const tiny = r.lines.find((l) => l.code === 'TINY')!
    expect(tiny.to).toBe(0)
    expect(tiny.dropped).toBe(true)
    expect(r.lines.reduce((s, l) => s + l.to, 0)).toBeCloseTo(100, 5)
  })

  it('keeps the target of a fund without enough history', () => {
    const r = recommend([...funds.map((f) => ({ ...f, target: f.target * 0.9 })), fund('NEW', 10, series('NEW', 0.001, 0, 0, 30))], { style: 'balanced' })
    const n = r.lines.find((l) => l.code === 'NEW')!
    expect(n.to).toBeCloseTo(10, 5)
    expect(n.kept).toBe(true)
  })

  it('keeps risky assets within the IRP/DC limit', () => {
    const heavy = [fund('WIN', 45, winner), fund('LOSE', 45, loser), fund('CALM', 10, calm, false)]
    const r = recommend(heavy, { style: 'gentle', riskyLimitPct: 70, maxPct: 100 })
    const risky = r.lines.filter((l) => l.code !== 'CALM').reduce((s, l) => s + l.to, 0)
    expect(risky).toBeLessThanOrEqual(70.05)
    expect(r.notes.length).toBe(1)
  })
})
