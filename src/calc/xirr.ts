export interface Flow {
  date: string
  /** 투자자 기준: 넣은 돈은 음수, 지금 평가금액은 양수 */
  amount: number
}

const YEAR_MS = 365 * 86_400_000

/**
 * 연환산 수익률(XIRR, 돈을 넣은 시점을 반영한 수익률).
 * 기간이 minDays보다 짧으면 연환산이 과장되므로 undefined.
 */
export function xirr(flows: Flow[], minDays = 90): number | undefined {
  const fs = flows.filter((f) => f.amount !== 0).sort((a, b) => a.date.localeCompare(b.date))
  if (fs.length < 2 || !fs.some((f) => f.amount > 0) || !fs.some((f) => f.amount < 0)) return undefined
  const t0 = Date.parse(fs[0].date)
  if (Date.parse(fs.at(-1)!.date) - t0 < minDays * 86_400_000) return undefined
  const years = fs.map((f) => (Date.parse(f.date) - t0) / YEAR_MS)
  const npv = (r: number) => fs.reduce((s, f, i) => s + f.amount / (1 + r) ** years[i], 0)

  // npv falls as r rises (money in comes first), so bisect between a loss of 99.9% and a gain of 1000%
  let lo = -0.999
  let hi = 10
  if (npv(lo) < 0 || npv(hi) > 0) return undefined
  for (let i = 0; i < 200 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2
    if (npv(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
