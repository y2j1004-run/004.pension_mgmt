import type { PricePoint } from '../model'
import { correlation, trendStats, type TrendStats } from './trend'

export interface Candidate {
  code: string
  name: string
  /** 네이버 ETF 분류 (1 국내지수 2 국내업종·테마 3 국내파생 4 해외주식 5 원자재 6 채권 7 기타) */
  tab: number
  /** 하루 평균 거래대금 (억원) */
  amount: number
  series: PricePoint[]
}

export type DiscoverStyle = 'trend' | 'balanced' | 'diversify'

export const DISCOVER_STYLE_LABEL: Record<DiscoverStyle, string> = { trend: '추세 우선', balanced: '균형', diversify: '분산 우선' }

/** 점수에 넣는 비중: 위험 대비 성과, 추세의 꾸준함, 낙폭, 내 포트폴리오와 다르게 움직이는 정도 */
const WEIGHTS: Record<DiscoverStyle, { perf: number; steady: number; dd: number; div: number }> = {
  trend: { perf: 0.55, steady: 0.25, dd: 0.1, div: 0.1 },
  balanced: { perf: 0.4, steady: 0.2, dd: 0.15, div: 0.25 },
  diversify: { perf: 0.25, steady: 0.15, dd: 0.15, div: 0.45 },
}

/** 연금저축에서 살 수 없거나(레버리지·인버스) 장기 투자 대상이 아닌 종목 */
const EXCLUDE_NAME = /레버리지|인버스|2X|곱버스|선물인버스|머니마켓|CD금리|KOFR|SOFR|단기자금|단기채|단기통안|초단기|1년|금리액티브/i
export const MIN_DAYS = 100
export const MIN_AMOUNT = 5 // 억원/일
const MIN_VOL = 0.04
/** 이미 고른 종목과 이보다 비슷하게 움직이면 건너뜀 (같은 종목을 여러 개 추천하지 않도록) */
const MAX_PICK_CORR = 0.85
/** 갖고 있는 종목과 이만큼 같이 움직이면 사실상 같은 지수 (예: 다른 운용사의 S&P500) */
const SAME_AS_HELD_CORR = 0.95

export const TAB_LABEL: Record<number, string> = { 1: '국내 시장지수', 2: '국내 업종·테마', 3: '국내 파생', 4: '해외주식', 5: '원자재', 6: '채권', 7: '기타' }

export interface Pick {
  code: string
  name: string
  tab: number
  stats: TrendStats
  amount: number
  /** 내 포트폴리오와의 상관계수 */
  corr?: number
  score: number
  reasons: string[]
  cautions: string[]
}

export interface DiscoverResult {
  picks: Pick[]
  /** 조건을 통과해 비교한 종목 수 */
  screened: number
  total: number
}

/** 보유 종목들을 지금 금액 비중대로 섞은 가상의 지수 (상관계수 계산용) */
export function compositeSeries(holdings: { series: PricePoint[]; weight: number }[]): PricePoint[] {
  const used = holdings.filter((h) => h.weight > 0 && h.series.length > 1)
  const total = used.reduce((s, h) => s + h.weight, 0)
  if (!total) return []
  const maps = used.map((h) => new Map(h.series.map((p) => [p.date, p.price])))
  const dates = [...new Set(used.flatMap((h) => h.series.map((p) => p.date)))].sort().filter((d) => maps.every((m) => m.has(d)))
  let level = 100
  return dates.map((date, i) => {
    if (i) {
      const ret = used.reduce((s, h, k) => s + (h.weight / total) * (maps[k].get(date)! / maps[k].get(dates[i - 1])! - 1), 0)
      level *= 1 + ret
    }
    return { code: 'PORTFOLIO', date, price: level }
  })
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
function zscores(xs: number[]): number[] {
  const m = mean(xs)
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1))
  return xs.map((x) => (sd ? Math.max(-3, Math.min(3, (x - m) / sd)) : 0))
}

const pctText = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`

/**
 * 갖고 있지 않은 ETF 중에서 최근 6개월 데이터로 점수를 매겨 서로 겹치지 않는 n개를 고릅니다.
 * 과거 성과 기반의 참고용 후보이며, 보수·추종지수·구성은 직접 확인해야 합니다.
 */
export function discover(opts: {
  candidates: Candidate[]
  held: Set<string>
  /** 내 포트폴리오 (보유 금액 비중으로 섞은 지수) */
  portfolio: PricePoint[]
  /** 보유 종목별 가격 (같은 지수를 따르는 다른 ETF를 거르는 데 씀) */
  heldSeries?: PricePoint[][]
  heldTabs: Set<number>
  end: string
  style: DiscoverStyle
  n?: number
}): DiscoverResult {
  const n = opts.n ?? 5
  const pool = opts.candidates
    .filter((c) => !opts.held.has(c.code) && !EXCLUDE_NAME.test(c.name) && c.amount >= MIN_AMOUNT)
    .map((c) => ({ c, s: trendStats(c.code, c.series, opts.end) }))
    .filter((x): x is { c: Candidate; s: TrendStats } => !!x.s && x.s.days >= MIN_DAYS && x.s.vol >= MIN_VOL)
  if (!pool.length) return { picks: [], screened: 0, total: opts.candidates.length }

  const corr = pool.map((x) => (opts.portfolio.length ? correlation(x.c.series, opts.portfolio, opts.end) : undefined))
  const perf = zscores(pool.map((x) => x.s.ret6m / x.s.vol))
  const steady = zscores(pool.map((x) => x.s.r2 * Math.sign(x.s.slope)))
  const dd = zscores(pool.map((x) => x.s.mdd))
  const div = zscores(corr.map((c) => -(c ?? 0.5)))
  const w = WEIGHTS[opts.style]
  const scored = pool
    .map((x, i) => ({ ...x, i, score: w.perf * perf[i] + w.steady * steady[i] + w.dd * dd[i] + w.div * div[i] }))
    .sort((a, b) => b.score - a.score)
  const perfRank = new Map([...pool.map((_, i) => i)].sort((a, b) => perf[b] - perf[a]).map((i, r) => [i, r]))

  const chosen: typeof scored = []
  for (const x of scored) {
    if (chosen.length >= n) break
    if ((opts.heldSeries ?? []).some((h) => (correlation(x.c.series, h, opts.end) ?? 0) >= SAME_AS_HELD_CORR)) continue
    if (chosen.some((y) => (correlation(x.c.series, y.c.series, opts.end) ?? 0) >= MAX_PICK_CORR)) continue
    chosen.push(x)
  }

  const picks = chosen.map((x): Pick => {
    const s = x.s
    const c = corr[x.i]
    const reasons = [`6개월 ${pctText(s.ret6m)} · 변동성 ${(s.vol * 100).toFixed(0)}% · 최대낙폭 ${(s.mdd * 100).toFixed(0)}%`]
    const top = Math.max(1, Math.ceil(((perfRank.get(x.i)! + 1) / pool.length) * 100))
    if (top <= 30) reasons.push(`위험 대비 성과(수익률 ÷ 변동성)가 비교한 ${pool.length}개 중 상위 ${top}%입니다.`)
    if (s.r2 >= 0.6 && s.slope > 0) reasons.push(`꾸준한 상승 추세입니다 (추세 설명력 ${(s.r2 * 100).toFixed(0)}%).`)
    if (s.mdd > -0.08) reasons.push(`6개월 동안 고점 대비 ${Math.abs(s.mdd * 100).toFixed(0)}%보다 크게 떨어진 적이 없습니다.`)
    if (c != null) {
      if (c < 0.3) reasons.push(`내 포트폴리오와 상관계수 ${c.toFixed(2)} — 다르게 움직여 분산 효과를 기대할 수 있습니다.`)
      else if (c < 0.6) reasons.push(`내 포트폴리오와 상관계수 ${c.toFixed(2)} — 어느 정도 다르게 움직입니다.`)
    }
    if (!opts.heldTabs.has(x.c.tab) && TAB_LABEL[x.c.tab]) reasons.push(`아직 갖고 있지 않은 분류(${TAB_LABEL[x.c.tab]})입니다.`)
    reasons.push(`하루 평균 거래대금 ${x.c.amount.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}억원으로 사고팔기 어렵지 않습니다.`)

    const cautions: string[] = []
    if (c != null && c >= 0.7) cautions.push(`내 포트폴리오와 상관계수 ${c.toFixed(2)}로 비슷하게 움직여 분산 효과는 작습니다.`)
    if (s.ret6m > 0.6) cautions.push(`6개월 ${pctText(s.ret6m)}로 많이 올라, 단기 과열이나 되돌림 가능성이 있습니다.`)
    if (s.ret1m != null && s.ret1m < -0.05) cautions.push(`최근 1개월 ${pctText(s.ret1m)}로 조정 중입니다.`)
    if (s.vol > 0.35) cautions.push('변동성이 커서 비중을 작게 시작하는 편이 안전합니다.')
    return { code: x.c.code, name: x.c.name, tab: x.c.tab, stats: s, amount: x.c.amount, corr: c, score: x.score, reasons, cautions }
  })
  return { picks, screened: pool.length, total: opts.candidates.length }
}
