import { describe, expect, it } from 'vitest'
import type { PricePoint } from '../model'
import { briefing, expectedTradingDay, signalsOf } from './brief'
import { addDays } from './portfolio'

const END = '2026-10-28'
function days(n: number): string[] {
  const out: string[] = []
  for (let d = n * 2; d >= 0; d--) {
    const date = addDays(END, -d)
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (dow && dow < 6) out.push(date)
  }
  // keep the last n weekdays ending at END
  return out.slice(-n)
}
const series = (code: string, prices: number[]): PricePoint[] => {
  const ds = days(prices.length)
  return prices.map((price, i) => ({ code, date: ds[i], price }))
}
/** 130 quiet days wobbling ±0.5% around 10,000, then the given closes */
const quiet = (tail: number[]) => [...Array.from({ length: 130 }, (_, i) => 10_000 * (1 + 0.005 * Math.sin(i * 1.3))), ...tail]

describe('signalsOf', () => {
  it('flags a big move to a new six-month high, and a run of rises', () => {
    const s = series('A', quiet([10_060, 10_120, 10_200, 10_600]))
    const sig = signalsOf(s, END)
    expect(sig.some((x) => x.startsWith('평소(하루'))).toBe(true)
    expect(sig).toContain('6개월 최고가(종가 기준)입니다.')
    expect(sig).toContain('4거래일 연속 상승입니다.')
  })

  it('flags falling below the 20-day average and sitting well under the high', () => {
    const tail = [...Array.from({ length: 25 }, () => 10_000), 8_200, 8_300, 8_250]
    const s = series('B', [...Array.from({ length: 100 }, () => 10_000), ...tail])
    s[s.length - 2] = { ...s[s.length - 2], price: 10_100 } // was above the average the day before
    const sig = signalsOf(s, END)
    expect(sig).toContain('20일 평균선 아래로 내려왔습니다.')
    expect(sig.some((x) => x.startsWith('6개월 고점보다'))).toBe(true)
  })

  it('says nothing about an ordinary day', () => {
    expect(signalsOf(series('C', quiet([10_010, 9_990])), END)).toEqual([])
  })
})

describe('briefing', () => {
  const market = new Map([
    ['UP', series('UP', quiet([10_000, 10_200]))],
    ['DOWN', series('DOWN', quiet([10_000, 9_950]))],
    ['STALE', series('STALE', quiet([10_000])).map((p) => ({ ...p, date: addDays(p.date, -1) }))],
  ])

  it('adds up the day in won and percent and names who moved it', () => {
    const b = briefing(
      [
        { code: 'UP', name: '상승 종목', qty: 100 },
        { code: 'DOWN', name: '하락 종목', qty: 100 },
        { code: 'NONE', name: '가격 없음', qty: 10 },
        { code: 'SOLD', name: '다 판 종목', qty: 0 },
      ],
      market,
    )!
    expect(b.date).toBe(END)
    expect(b.pnl).toBeCloseTo(100 * 200 - 100 * 50)
    expect(b.change).toBeCloseTo(15_000 / 2_000_000)
    expect(b.lead!.code).toBe('UP')
    expect(b.against!.code).toBe('DOWN')
    expect(b.missing).toEqual(['가격 없음'])
    expect(b.headline).toBe('내 ETF 2종목 평가금액이 +15,000원(+0.75%) 올랐습니다. 상승 1 · 하락 1.')
    expect(b.weekPnl).not.toBeUndefined()
  })

  it('has nothing to say without prices', () => {
    expect(briefing([{ code: 'X', name: 'x', qty: 1 }], new Map())).toBeUndefined()
  })

  it('knows which close should be in by now', () => {
    expect(expectedTradingDay(new Date(2026, 9, 30, 20, 10))).toBe('2026-10-30') // Fri evening
    expect(expectedTradingDay(new Date(2026, 9, 30, 9, 0))).toBe('2026-10-29') // Fri morning
    expect(expectedTradingDay(new Date(2026, 10, 2, 8, 0))).toBe('2026-10-30') // Mon morning
    expect(expectedTradingDay(new Date(2026, 9, 31, 12, 0))).toBe('2026-10-30') // Saturday
  })
})
