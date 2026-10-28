import { describe, expect, it } from 'vitest'
import type { Entry, Etf } from '../model'
import { accountOn, priceBook, priceChange, priceOn, summarize, valueHistory } from './portfolio'

const etf = (code: string, targetPct: number): Etf => ({ code, name: code, category: '해외주식', risky: true, targetPct, createdAt: 0 })

describe('accountOn', () => {
  it('tracks cash, quantity, average cost and principal', () => {
    const entries: Entry[] = [
      { date: '2026-01-21', kind: 'deposit', amount: 700_000 },
      { date: '2026-01-21', kind: 'buy', code: 'A', qty: 30, price: 20_000 },
      { date: '2026-02-21', kind: 'deposit', amount: 700_000 },
      { date: '2026-02-21', kind: 'buy', code: 'A', qty: 20, price: 25_000, fee: 100 },
      { date: '2026-03-02', kind: 'sell', code: 'A', qty: 10, price: 30_000 },
      { date: '2026-03-03', kind: 'dividend', code: 'A', amount: 5_000 },
    ]
    const acc = accountOn(entries)
    const a = acc.positions.get('A')!
    expect(a.qty).toBe(40)
    // average cost (600,000 + 500,100) / 50 = 22,002 → 40 left
    expect(a.cost).toBeCloseTo(22_002 * 40)
    expect(a.realized).toBeCloseTo(300_000 - 220_020)
    expect(a.dividends).toBe(5_000)
    expect(acc.principal).toBe(1_400_000)
    expect(acc.cash).toBe(1_400_000 - 600_000 - 500_100 + 300_000 + 5_000)
  })

  it('counts an opening holding as money put in without touching cash', () => {
    const acc = accountOn([{ date: '2026-01-01', kind: 'buy', code: 'A', qty: 100, price: 10_000, opening: true }])
    expect(acc.cash).toBe(0)
    expect(acc.principal).toBe(1_000_000)
  })

  it('stops at asOf', () => {
    const entries: Entry[] = [
      { date: '2026-01-21', kind: 'deposit', amount: 700_000 },
      { date: '2026-02-21', kind: 'deposit', amount: 700_000 },
    ]
    expect(accountOn(entries, '2026-01-31').principal).toBe(700_000)
  })
})

describe('prices', () => {
  const entries: Entry[] = [{ date: '2026-01-21', kind: 'buy', code: 'A', qty: 1, price: 100, opening: true }]
  const book = priceBook([{ code: 'A', date: '2026-02-21', price: 110 }, { code: 'A', date: '2026-01-21', price: 101 }], entries)

  it('uses entered prices over trade prices on the same day', () => {
    expect(priceOn(book, 'A', '2026-01-21')?.price).toBe(101)
    expect(priceOn(book, 'A', '2026-02-20')?.price).toBe(101)
    expect(priceOn(book, 'A')?.price).toBe(110)
    expect(priceOn(book, 'A', '2025-12-31')).toBeUndefined()
  })

  it('measures change only when there is a price from around then', () => {
    expect(priceChange(book, 'A', '2026-02-21', 31)).toBeCloseTo(110 / 101 - 1)
    expect(priceChange(book, 'A', '2026-02-21', 365)).toBeUndefined()
  })
})

describe('summarize', () => {
  it('values holdings at the latest price and weighs them against the whole account', () => {
    const entries: Entry[] = [
      { date: '2026-01-21', kind: 'deposit', amount: 1_000_000 },
      { date: '2026-01-21', kind: 'buy', code: 'A', qty: 40, price: 10_000 },
      { date: '2026-01-21', kind: 'buy', code: 'B', qty: 40, price: 10_000 },
    ]
    const book = priceBook([{ code: 'A', date: '2026-02-01', price: 12_000 }], entries)
    const s = summarize([etf('A', 50), etf('B', 50), etf('C', 0)], entries, book)
    expect(s.cash).toBe(200_000)
    expect(s.total).toBe(480_000 + 400_000 + 200_000)
    expect(s.gain).toBe(80_000)
    expect(s.holdings.map((h) => h.code)).toEqual(['A', 'B', 'C'])
    expect(s.holdings[0].gainPct).toBeCloseTo(0.2)
    expect(s.holdings[0].weightPct).toBeCloseTo((480 / 1080) * 100)

    const hist = valueHistory([etf('A', 50), etf('B', 50)], entries, book)
    expect(hist.map((h) => h.total)).toEqual([1_000_000, 1_080_000])
  })
})
