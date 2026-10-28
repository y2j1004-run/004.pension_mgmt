import type { PricePoint } from '../model'
import { addDays } from './portfolio'

/** 분석 기간 (일) — 약 6개월 */
export const WINDOW_DAYS = 182
/** 이보다 거래일이 적으면(신규 상장 등) 추천에서 지금 목표를 그대로 둠 */
export const MIN_TRADING_DAYS = 40
const TRADING_DAYS_PER_YEAR = 250

export interface TrendStats {
  code: string
  /** 분석에 쓴 거래일 수 */
  days: number
  start: string
  end: string
  ret6m: number
  ret3m?: number
  ret1m?: number
  /** 연환산 변동성 (일간 수익률 표준편차 × √250) */
  vol: number
  /** 기간 중 고점 대비 최대 하락 (음수) */
  mdd: number
  /** 추세선 기울기, 연환산 (로그 가격 회귀) */
  slope: number
  /** 추세선이 가격을 얼마나 잘 설명하나 (0~1, 높을수록 꾸준한 추세) */
  r2: number
  /** 마지막 가격이 기간 평균보다 위인지 */
  aboveAvg: boolean
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const std = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

function window(series: PricePoint[], end: string): PricePoint[] {
  const from = addDays(end, -WINDOW_DAYS)
  return series.filter((p) => p.date > from && p.date <= end)
}

function changeSince(pts: PricePoint[], end: string, days: number): number | undefined {
  const from = addDays(end, -days)
  const base = pts.filter((p) => p.date <= from).at(-1)
  // the window has to reach back that far
  return base && pts[0].date <= addDays(from, 7) ? pts.at(-1)!.price / base.price - 1 : undefined
}

/** 최근 6개월 종가로 수익률·변동성·낙폭·추세를 계산합니다. */
export function trendStats(code: string, series: PricePoint[], end: string): TrendStats | undefined {
  const pts = window(series, end)
  if (pts.length < 2) return undefined
  const prices = pts.map((p) => p.price)
  const logs = prices.map(Math.log)
  const daily = logs.slice(1).map((l, i) => l - logs[i])

  let peak = prices[0]
  let mdd = 0
  for (const p of prices) {
    peak = Math.max(peak, p)
    mdd = Math.min(mdd, p / peak - 1)
  }

  // least squares of log price on trading-day index
  const xs = logs.map((_, i) => i)
  const mx = mean(xs)
  const my = mean(logs)
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (logs[i] - my), 0)
  const b = sxx ? sxy / sxx : 0
  const ssTot = logs.reduce((s, y) => s + (y - my) ** 2, 0)
  const ssRes = logs.reduce((s, y, i) => s + (y - (my + b * (i - mx))) ** 2, 0)

  return {
    code,
    days: pts.length,
    start: pts[0].date,
    end: pts.at(-1)!.date,
    ret6m: prices.at(-1)! / prices[0] - 1,
    ret3m: changeSince(pts, pts.at(-1)!.date, 91),
    ret1m: changeSince(pts, pts.at(-1)!.date, 30),
    vol: daily.length > 1 ? std(daily) * Math.sqrt(TRADING_DAYS_PER_YEAR) : 0,
    mdd,
    slope: Math.exp(b * TRADING_DAYS_PER_YEAR) - 1,
    r2: ssTot ? 1 - ssRes / ssTot : 0,
    aboveAvg: prices.at(-1)! >= mean(prices),
  }
}

/** 같은 날짜끼리 맞춘 일간 수익률의 상관계수. 겹치는 날이 적으면 undefined */
export function correlation(a: PricePoint[], b: PricePoint[], end: string): number | undefined {
  const bBy = new Map(window(b, end).map((p) => [p.date, p.price]))
  const both = window(a, end).filter((p) => bBy.has(p.date))
  if (both.length < 30) return undefined
  const ra = both.slice(1).map((p, i) => Math.log(p.price / both[i].price))
  const rb = both.slice(1).map((p, i) => Math.log(bBy.get(p.date)! / bBy.get(both[i].date)!))
  const ma = mean(ra)
  const mb = mean(rb)
  let cov = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb)
    va += (ra[i] - ma) ** 2
    vb += (rb[i] - mb) ** 2
  }
  return va && vb ? cov / Math.sqrt(va * vb) : undefined
}

export type Style = 'gentle' | 'balanced' | 'active'

export const STYLE_LABEL: Record<Style, string> = { gentle: '조금만', balanced: '보통', active: '적극적으로' }

/** 추세(k)와 변동성(v)을 얼마나 반영할지 */
const STYLE: Record<Style, { k: number; v: number }> = {
  gentle: { k: 0.3, v: 0.25 },
  balanced: { k: 0.6, v: 0.5 },
  active: { k: 1, v: 0.75 },
}

export interface FundInput {
  code: string
  name: string
  risky: boolean
  /** 지금 목표 비중 % */
  target: number
  /** 지금 실제 비중 % (목표가 없을 때 출발점) */
  weight: number
  stats?: TrendStats
}

export interface RecLine {
  code: string
  name: string
  from: number
  to: number
  reasons: string[]
  /** 데이터가 부족해 지금 목표를 그대로 둠 */
  kept?: boolean
  /** 너무 작아 정리 후보로 0% */
  dropped?: boolean
}

export interface RecOptions {
  style: Style
  maxPct?: number
  /** 이보다 작은 종목은 0%로 (정리 제안) */
  minPct?: number
  riskyLimitPct?: number
}

export interface Recommendation {
  lines: RecLine[]
  notes: string[]
}

const p1 = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`

/**
 * 지금 목표 비중에서 출발해, 최근 6개월에 위험 대비 성과가 좋았던 종목은 조금 늘리고 부진했던 종목은 줄이며,
 * 변동성이 큰 종목은 줄입니다. 한 종목 최대 비중, 작은 종목 정리, IRP·DC 위험자산 한도를 지킵니다.
 * 과거 추세가 이어진다는 보장은 없으므로 결과는 참고용입니다.
 */
export function recommend(funds: FundInput[], opts: RecOptions): Recommendation {
  const { k, v } = STYLE[opts.style]
  const maxPct = opts.maxPct ?? 40
  const notes: string[] = []
  const targetSum = funds.reduce((s, f) => s + f.target, 0)
  // start from the targets, or from what is held when no targets are set
  const start = funds.map((f) => (targetSum > 0 ? (f.target / targetSum) * 100 : f.weight))
  const startSum = start.reduce((s, x) => s + x, 0) || 1
  const from = start.map((x) => (x / startSum) * 100)

  const usable = funds.map((f, i) => !!f.stats && f.stats.days >= MIN_TRADING_DAYS && from[i] > 0)
  const scores = funds.map((f) => (f.stats ? f.stats.ret6m / Math.max(f.stats.vol, 0.05) : 0))
  const used = scores.filter((_, i) => usable[i])
  const m = used.length ? mean(used) : 0
  const sd = used.length > 1 ? std(used) : 0
  const vols = funds.filter((_, i) => usable[i]).map((f) => f.stats!.vol)
  const volRef = vols.length ? Math.exp(mean(vols.map((x) => Math.log(Math.max(x, 0.05))))) : 1

  const reasons: string[][] = funds.map(() => [])
  const z = scores.map((s) => (sd ? Math.max(-1.5, Math.min(1.5, (s - m) / sd)) : 0))
  let w = from.map((x, i) => {
    if (!usable[i]) return x
    const s = funds[i].stats!
    const trendFactor = Math.max(0.25, 1 + (k * z[i]) / 1.5)
    const volFactor = (volRef / Math.max(s.vol, 0.05)) ** v
    return x * trendFactor * volFactor
  })

  // funds without enough data keep their share; the rest share what is left
  const fixed = funds.reduce((s, _, i) => s + (usable[i] ? 0 : from[i]), 0)
  const normalize = () => {
    const free = w.reduce((s, x, i) => s + (usable[i] ? x : 0), 0)
    w = w.map((x, i) => (usable[i] && free ? (x / free) * (100 - fixed) : usable[i] ? 0 : from[i]))
  }
  normalize()

  const dropped = new Set<number>()
  const capped = new Set<number>()
  for (let round = 0; round < 10; round++) {
    let changed = false
    // cap: spread what is over the cap across the funds under it
    for (let pass = 0; pass < 10; pass++) {
      const over = w.map((x, i) => (usable[i] && x > maxPct ? i : -1)).filter((i) => i >= 0)
      if (!over.length) break
      let excess = 0
      for (const i of over) {
        excess += w[i] - maxPct
        w[i] = maxPct
        capped.add(i)
      }
      const room = w.map((x, i) => (usable[i] && !dropped.has(i) && x < maxPct ? x : 0))
      const roomSum = room.reduce((s, x) => s + x, 0)
      if (!roomSum) break
      w = w.map((x, i) => x + (room[i] / roomSum) * excess)
      changed = true
    }
    if (opts.minPct) {
      const small = w.map((x, i) => (usable[i] && x > 0 && x < opts.minPct! && !dropped.has(i) ? i : -1)).filter((i) => i >= 0)
      if (small.length && small.length < usable.filter(Boolean).length) {
        for (const i of small) {
          dropped.add(i)
          w[i] = 0
        }
        normalize()
        changed = true
      }
    }
    if (!changed) break
  }

  if (opts.riskyLimitPct != null) {
    const risky = w.reduce((s, x, i) => s + (funds[i].risky ? x : 0), 0)
    const safe = 100 - risky
    if (risky > opts.riskyLimitPct) {
      if (safe > 0) {
        w = w.map((x, i) => (funds[i].risky ? (x * opts.riskyLimitPct!) / risky : (x * (100 - opts.riskyLimitPct!)) / safe))
        notes.push(`IRP·DC 위험자산 한도 ${opts.riskyLimitPct}%에 맞춰 위험자산을 줄이고 안전자산을 늘렸습니다.`)
      } else {
        notes.push(`위험자산이 ${opts.riskyLimitPct}% 한도를 넘지만 안전자산(채권·혼합 등) 종목이 없어 맞출 수 없습니다. 안전자산 종목을 추가하세요.`)
      }
    }
  }

  // one decimal place, adding up to exactly 100
  let to = w.map((x) => Math.round(x * 10) / 10)
  const diff = Math.round((100 - to.reduce((s, x) => s + x, 0)) * 10) / 10
  if (diff && to.some((x) => x > 0)) {
    const big = to.indexOf(Math.max(...to))
    to[big] = Math.round((to[big] + diff) * 10) / 10
  }
  if (!to.some((x) => x > 0)) to = from.map((x) => Math.round(x * 10) / 10)

  funds.forEach((f, i) => {
    const s = f.stats
    const r = reasons[i]
    if (!s || s.days < MIN_TRADING_DAYS) {
      r.push(s ? `가격 기록이 ${s.days}거래일뿐이라 지금 목표를 유지합니다.` : '가격 기록이 없어 지금 목표를 유지합니다.')
      return
    }
    r.push(`6개월 ${p1(s.ret6m)} · 변동성 ${(s.vol * 100).toFixed(0)}% · 최대낙폭 ${(s.mdd * 100).toFixed(0)}%`)
    if (s.r2 >= 0.6) r.push(s.slope > 0 ? '꾸준한 상승 추세입니다.' : '꾸준한 하락 추세입니다.')
    else if (s.r2 < 0.25) r.push('뚜렷한 방향 없이 오르내렸습니다.')
    if (dropped.has(i)) {
      r.push(`추천 비중이 ${opts.minPct}% 미만이라 수익률에 주는 영향이 작고 관리만 늘어, 정리 후보로 0%를 제안합니다.`)
      return
    }
    if (!from[i]) return
    if (z[i] >= 0.5) r.push('위험 대비 성과가 다른 종목보다 좋아 비중을 늘렸습니다.')
    if (z[i] <= -0.5) r.push('위험 대비 성과가 다른 종목보다 부진해 비중을 줄였습니다.')
    if (s.vol > volRef * 1.3) r.push('다른 종목보다 많이 출렁여 비중을 낮췄습니다.')
    if (s.vol < volRef / 1.3) r.push('다른 종목보다 덜 출렁여 비중을 높였습니다.')
    if (capped.has(i)) r.push(`한 종목 최대 ${maxPct}%로 제한했습니다.`)
  })

  return {
    lines: funds.map((f, i) => ({
      code: f.code,
      name: f.name,
      from: Math.round(from[i] * 10) / 10,
      to: to[i],
      reasons: reasons[i],
      kept: !usable[i] && !dropped.has(i) && from[i] > 0 ? true : undefined,
      dropped: dropped.has(i) || undefined,
    })),
    notes,
  }
}

export interface CorrelatedPair {
  a: string
  b: string
  corr: number
}

/** 거의 같이 움직이는 종목 쌍 (분산 효과가 작음) */
export function correlatedPairs(codes: string[], book: Map<string, PricePoint[]>, end: string, threshold = 0.9): CorrelatedPair[] {
  const out: CorrelatedPair[] = []
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const c = correlation(book.get(codes[i]) ?? [], book.get(codes[j]) ?? [], end)
      if (c != null && c >= threshold) out.push({ a: codes[i], b: codes[j], corr: c })
    }
  }
  return out.sort((x, y) => y.corr - x.corr)
}
