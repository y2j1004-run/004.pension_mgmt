import { describe, expect, it } from 'vitest'
import type { PricePoint } from '../model'
import { compositeSeries, discover, type Candidate } from './discover'
import { addDays } from './portfolio'

const END = '2026-10-28'
let seed = 3
const noise = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647 - 0.5
}
const days: string[] = []
for (let d = 200; d >= 0; d--) {
  const date = addDays(END, -d)
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  if (dow && dow < 6) days.push(date)
}
const market = days.map(() => noise())

/** drift per day, own noise, and how much it follows the shared market */
function series(code: string, drift: number, own: number, beta: number): PricePoint[] {
  let p = 10_000
  return days.map((date, i) => {
    if (i) p *= 1 + drift + beta * market[i] * 0.02 + own * noise() * 0.02
    return { code, date, price: p }
  })
}
const cand = (code: string, name: string, s: PricePoint[], tab = 4, amount = 50): Candidate => ({ code, name, tab, amount, series: s })

const mine = series('MINE', 0.001, 0.3, 1)
const tech = series('TECH1', 0.003, 0.5, 0.8)
const universe: Candidate[] = [
  cand('MINE', '내 종목', mine, 1),
  cand('TWIN', '내 종목과 같은 지수', series('TWIN', 0.0012, 0.1, 1), 1),
  cand('GOLD', '금 현물', series('GOLD', 0.0015, 0.6, 0), 5),
  cand('BOND', '장기채', series('BOND', 0.0006, 0.4, -0.2), 6),
  cand('TECH1', '테크 A', tech),
  // another fund on the same index: same moves, a little tracking noise
  cand('TECH2', '테크 A 복제', tech.map((p) => ({ ...p, code: 'TECH2', price: p.price * (1 + noise() * 0.001) }))),
  cand('HOT', '레버리지 테크', series('HOT', 0.006, 1, 1.5)),
  cand('THIN', '거래 없는 테마', series('THIN', 0.004, 0.5, 0.3), 2, 0.3),
  cand('NEW', '신규 상장', series('NEW', 0.003, 0.5, 0.3).slice(-50)),
  cand('CASH', '머니마켓액티브', series('CASH', 0.0001, 0.01, 0)),
  cand('DOWN', '하락 테마', series('DOWN', -0.003, 0.5, 0.5), 2),
  cand('KR2', '국내 배당', series('KR2', 0.0008, 0.5, 0.6), 1),
]

describe('discover', () => {
  const portfolio = compositeSeries([{ series: mine, weight: 1 }])
  const run = (style: 'trend' | 'balanced' | 'diversify') =>
    discover({ candidates: universe, held: new Set(['MINE']), portfolio, heldTabs: new Set([1]), end: END, style })

  it('screens out held, leveraged, cash-like, thin and too-new funds', () => {
    const r = run('balanced')
    const codes = r.picks.map((p) => p.code)
    for (const c of ['MINE', 'HOT', 'THIN', 'NEW', 'CASH']) expect(codes).not.toContain(c)
    expect(r.screened).toBe(universe.length - 5)
    expect(codes).toHaveLength(5)
  })

  it('skips a fund that tracks the same thing as one already held', () => {
    const same = cand('SAME', '같은 지수 다른 운용사', mine.map((p) => ({ ...p, code: 'SAME', price: p.price * (1 + noise() * 0.001) })), 1)
    const args = { candidates: [...universe.filter((c) => c.code !== 'TWIN'), same], held: new Set(['MINE']), portfolio: compositeSeries([{ series: mine, weight: 1 }]), heldTabs: new Set([1]), end: END }
    expect(discover({ ...args, style: 'diversify', n: 12 }).picks.map((p) => p.code)).toContain('SAME')
    expect(discover({ ...args, style: 'diversify', n: 12, heldSeries: [mine] }).picks.map((p) => p.code)).not.toContain('SAME')
  })

  it('does not pick two funds that move the same way', () => {
    const codes = run('trend').picks.map((p) => p.code)
    expect(codes.includes('TECH1') && codes.includes('TECH2')).toBe(false)
  })

  it('leans to funds unlike the portfolio when diversifying', () => {
    const div = run('diversify').picks.map((p) => p.code)
    expect(div.slice(0, 2).sort()).toEqual(['BOND', 'GOLD'])
    expect(run('diversify').picks.find((p) => p.code === 'TWIN')?.cautions.some((c) => c.includes('비슷하게 움직여'))).not.toBe(false)
  })

  it('gives reasons for every pick', () => {
    for (const p of run('balanced').picks) {
      expect(p.reasons[0]).toMatch(/^6개월 /)
      expect(p.reasons.some((r) => r.includes('거래대금'))).toBe(true)
    }
    const gold = run('balanced').picks.find((p) => p.code === 'GOLD')!
    expect(gold.reasons.some((r) => r.includes('아직 갖고 있지 않은 분류(원자재)'))).toBe(true)
  })

  it('builds a weighted index of holdings', () => {
    const a = days.slice(0, 3).map((date, i) => ({ code: 'A', date, price: [100, 110, 121][i] }))
    const b = days.slice(0, 3).map((date) => ({ code: 'B', date, price: 50 }))
    const c = compositeSeries([
      { series: a, weight: 1 },
      { series: b, weight: 1 },
    ])
    expect(c.map((p) => Math.round(p.price * 100) / 100)).toEqual([100, 105, 110.25])
  })
})
