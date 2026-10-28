import { describe, expect, it } from 'vitest'
import type { Entry, Etf } from '../model'
import { checkNewFund, checkPortfolio } from './advice'
import { priceBook, summarize } from './portfolio'

const etfs: Etf[] = [
  { code: 'US', name: '미국주식', category: '해외주식', risky: true, targetPct: 50, feePct: 0.07, createdAt: 0 },
  { code: 'KR', name: '국내주식', category: '국내주식', risky: true, targetPct: 30, feePct: 0.45, createdAt: 0 },
  { code: 'BOND', name: '채권', category: '채권', risky: false, targetPct: 20, createdAt: 0 },
]
const entries: Entry[] = [
  { date: '2026-01-01', kind: 'buy', code: 'US', qty: 80, price: 10_000, opening: true },
  { date: '2026-01-01', kind: 'buy', code: 'KR', qty: 10, price: 10_000, opening: true },
  { date: '2026-01-01', kind: 'buy', code: 'BOND', qty: 10, price: 10_000, opening: true },
]
const summary = summarize(etfs, entries, priceBook([], entries))

describe('checkPortfolio', () => {
  it('points out drift, concentration, fees and the IRP risky limit', () => {
    const texts = checkPortfolio({ summary, etfs, accountType: 'irp', driftBand: 5, monthlyAmount: 700_000 }).map((t) => t.text)
    expect(texts.some((t) => t.startsWith('미국주식: 목표보다 30%p 높습니다'))).toBe(true)
    expect(texts.some((t) => t.startsWith('국내주식: 목표 30%보다 20%p 낮습니다'))).toBe(true)
    expect(texts.some((t) => t.startsWith('미국주식 한 종목이 80%'))).toBe(true)
    expect(texts.some((t) => t.startsWith('국내주식 총보수 0.45%'))).toBe(true)
    expect(texts.some((t) => t.startsWith('위험자산이 90%'))).toBe(true)
  })

  it('says so when everything is on target', () => {
    const even = summarize(
      etfs.map((e) => ({ ...e, targetPct: e.code === 'US' ? 80 : 10, feePct: undefined })),
      entries,
      priceBook([], entries),
    )
    const tips = checkPortfolio({ summary: even, etfs: etfs.map((e) => ({ ...e, targetPct: e.code === 'US' ? 80 : 10, feePct: undefined })), accountType: 'saving', driftBand: 5, monthlyAmount: 700_000 })
    expect(tips.some((t) => t.level === 'good')).toBe(true)
  })
})

describe('checkNewFund', () => {
  it('warns when the same kind of fund is already held for less', () => {
    const c = checkNewFund({ category: '해외주식', feePct: 0.2 }, etfs)
    expect(c.sameCategory.map((e) => e.code)).toEqual(['US'])
    expect(c.tips.some((t) => t.level === 'warn')).toBe(true)
    expect(checkNewFund({ category: '금·원자재' }, etfs).tips[0].level).toBe('good')
  })
})
