import { addDays } from '../calc/portfolio'
import { depositDateOf } from '../calc/schedule'
import type { Entry, Etf, PricePoint } from '../model'
import { clearAll, db } from './db'

// Made-up funds and prices for trying the app out; not real products or quotes.
const ETFS: Etf[] = [
  { code: '900001', name: '(예시) 미국 S&P500', category: '해외주식', risky: true, targetPct: 50, feePct: 0.07, createdAt: 0 },
  { code: '900002', name: '(예시) 미국 나스닥100', category: '해외주식', risky: true, targetPct: 20, feePct: 0.07, createdAt: 0 },
  { code: '900003', name: '(예시) 국내 코스피200', category: '국내주식', risky: true, targetPct: 10, feePct: 0.15, createdAt: 0 },
  { code: '900004', name: '(예시) 미국채 10년', category: '채권', risky: false, targetPct: 20, feePct: 0.05, createdAt: 0 },
]
const START = { '900001': 17_000, '900002': 95_000, '900003': 33_000, '900004': 10_500 } as Record<string, number>
const DRIFT = { '900001': 0.012, '900002': 0.016, '900003': 0.004, '900004': 0.002 } as Record<string, number>

export function sampleData(today: string): { etfs: Etf[]; entries: Entry[]; prices: PricePoint[] } {
  const [y, m] = today.split('-').map(Number)
  const months = Array.from({ length: 14 }, (_, i) => {
    const k = y * 12 + (m - 1) - 13 + i
    return depositDateOf(Math.floor(k / 12), (k % 12) + 1, 21)
  }).filter((d) => d <= today)
  // a fixed wobble so every run of the sample looks the same
  const wobble = (i: number, j: number) => Math.sin(i * 1.7 + j * 2.3) * 0.035
  const priceAt = (code: string, i: number, j: number) => Math.round(START[code] * (1 + DRIFT[code]) ** i * (1 + wobble(i, j)) / 5) * 5

  const entries: Entry[] = []
  const prices: PricePoint[] = []
  const opening = addDays(months[0], -20)
  ETFS.forEach((e) => {
    const qty = Math.round((5_000_000 * e.targetPct) / 100 / START[e.code])
    entries.push({ date: opening, kind: 'buy', code: e.code, qty, price: START[e.code], opening: true })
  })
  const held: Record<string, number> = Object.fromEntries(entries.map((e) => [e.code!, e.qty!]))
  let cash = 0
  months.forEach((date, i) => {
    entries.push({ date, kind: 'deposit', amount: 700_000 })
    cash += 700_000
    const p = Object.fromEntries(ETFS.map((e, j) => [e.code, priceAt(e.code, i + 1, j)]))
    ETFS.forEach((e) => prices.push({ code: e.code, date, price: p[e.code] }))
    const total = cash + ETFS.reduce((s, e) => s + held[e.code] * p[e.code], 0)
    for (const e of ETFS) {
      const qty = Math.max(0, Math.floor(((e.targetPct / 100) * total - held[e.code] * p[e.code]) / p[e.code]))
      const n = Math.min(qty, Math.floor(cash / p[e.code]))
      if (!n) continue
      entries.push({ date, kind: 'buy', code: e.code, qty: n, price: p[e.code] })
      held[e.code] += n
      cash -= n * p[e.code]
    }
  })
  // prices a week ago, so the trend and 1-month change have something to show
  const last = months.length
  ETFS.forEach((e, j) => prices.push({ code: e.code, date: addDays(today, -1), price: priceAt(e.code, last + 0.3, j + 1) }))
  return { etfs: ETFS, entries, prices }
}

export async function loadSample(today: string) {
  const s = sampleData(today)
  await clearAll()
  await db.transaction('rw', db.etfs, db.entries, db.prices, db.meta, async () => {
    await db.etfs.bulkPut(s.etfs)
    await db.entries.bulkAdd(s.entries)
    await db.prices.bulkPut(s.prices)
    await db.meta.put({ key: 'sample', value: true })
  })
}

export async function isSample(): Promise<boolean> {
  return !!(await db.meta.get('sample'))?.value
}
