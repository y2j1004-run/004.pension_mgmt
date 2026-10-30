import type { PricePoint } from '../model'
import { addDays } from './portfolio'

/** 나이틀리 작업이 만드는 시장 요약 (scripts/naver.mjs buildBrief) */
export interface MarketBrief {
  updatedAt: string
  date: string
  up: number
  down: number
  flat: number
  groups: [name: string, medianChange: number, count: number][]
  gainers: [code: string, name: string, change: number][]
  losers: [code: string, name: string, change: number][]
}

export interface FundDay {
  code: string
  name: string
  qty: number
  close: number
  prevClose: number
  change: number
  /** 보유 수량 × 가격 변화 */
  pnl: number
  signals: string[]
}

export interface Briefing {
  /** 브리핑하는 거래일 */
  date: string
  prevDate: string
  pnl: number
  /** 전날 평가금액 대비 */
  change: number
  /** 전날 종가가 없는 등으로 빠진 보유 종목 */
  missing: string[]
  funds: FundDay[]
  /** 최근 5거래일 평가금액 변화 */
  weekPnl?: number
  weekChange?: number
  headline: string
  /** 전체 방향으로 가장 크게 움직인 종목 */
  lead?: FundDay
  /** 전체와 반대로 가장 크게 움직인 종목 */
  against?: FundDay
}

const pctText = (x: number, digits = 1) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`
const wonText = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(Math.round(n)).toLocaleString('ko-KR')}원`
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/** 그 종목의 가격 기록에서 이날의 특이 사항 */
export function signalsOf(series: PricePoint[], date: string): string[] {
  const i = series.findIndex((p) => p.date === date)
  if (i < 1) return []
  const out: string[] = []
  const close = series[i].price
  const change = close / series[i - 1].price - 1

  // a move well beyond what this fund usually does in a day (last ~3 months)
  const past: number[] = []
  for (let k = Math.max(1, i - 60); k < i; k++) past.push(Math.log(series[k].price / series[k - 1].price))
  if (past.length >= 20) {
    const m = mean(past)
    const sd = Math.sqrt(past.reduce((s, x) => s + (x - m) ** 2, 0) / (past.length - 1))
    if (sd && Math.abs(change) >= Math.max(2 * sd, 0.015)) {
      out.push(`평소(하루 ±${(sd * 100).toFixed(1)}%)보다 크게 ${change > 0 ? '올랐습니다' : '떨어졌습니다'}.`)
    }
  }

  // highest / lowest close of the last 6 months
  const from = addDays(date, -182)
  const window = series.slice(0, i + 1).filter((p) => p.date > from)
  if (window.length >= 60) {
    const before = window.slice(0, -1).map((p) => p.price)
    if (close > Math.max(...before)) out.push('6개월 최고가(종가 기준)입니다.')
    else if (close < Math.min(...before)) out.push('6개월 최저가(종가 기준)입니다.')
    else {
      const fromHigh = close / Math.max(...before) - 1
      if (fromHigh <= -0.15) out.push(`6개월 고점보다 ${Math.abs(fromHigh * 100).toFixed(0)}% 낮습니다.`)
    }
  }

  // runs of rises or falls
  let run = 0
  for (let k = i; k >= 1; k--) {
    const d = Math.sign(series[k].price - series[k - 1].price)
    if (!d || (run && Math.sign(run) !== d)) break
    run += d
  }
  if (Math.abs(run) >= 3) out.push(`${Math.abs(run)}거래일 연속 ${run > 0 ? '상승' : '하락'}입니다.`)

  // crossing the 20-day average, by at least 1% so a fund hovering on it isn't reported every day
  if (i >= 21) {
    const avg = (end: number) => mean(series.slice(end - 19, end + 1).map((p) => p.price))
    const now = close / avg(i) - 1
    const was = series[i - 1].price / avg(i - 1) - 1
    if (now >= 0.01 && was < 0) out.push('20일 평균선 위로 올라섰습니다.')
    if (now <= -0.01 && was >= 0) out.push('20일 평균선 아래로 내려왔습니다.')
  }
  return out
}

/**
 * 가장 최근 거래일의 내 ETF 결과. market은 매일 받은 종가(거래일 기준)만 넘깁니다.
 */
export function briefing(holdings: { code: string; name: string; qty: number }[], market: Map<string, PricePoint[]>): Briefing | undefined {
  const held = holdings.filter((h) => h.qty > 0)
  const date = held
    .map((h) => market.get(h.code)?.at(-1)?.date)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1)
  if (!date) return undefined

  const funds: FundDay[] = []
  const missing: string[] = []
  let prevDate = ''
  for (const h of held) {
    const s = market.get(h.code) ?? []
    const i = s.findIndex((p) => p.date === date)
    if (i < 1) {
      missing.push(h.name)
      continue
    }
    prevDate = prevDate > s[i - 1].date ? prevDate : s[i - 1].date
    const close = s[i].price
    const prevClose = s[i - 1].price
    funds.push({ code: h.code, name: h.name, qty: h.qty, close, prevClose, change: close / prevClose - 1, pnl: h.qty * (close - prevClose), signals: signalsOf(s, date) })
  }
  if (!funds.length) return undefined
  funds.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))

  const pnl = funds.reduce((s, f) => s + f.pnl, 0)
  const before = funds.reduce((s, f) => s + f.qty * f.prevClose, 0)
  const change = before ? pnl / before : 0

  // the last five trading days, for funds with a price five sessions back
  let weekPnl: number | undefined
  let weekStart = 0
  for (const f of funds) {
    const s = market.get(f.code)!
    const i = s.findIndex((p) => p.date === date)
    if (i < 5) continue
    weekPnl = (weekPnl ?? 0) + f.qty * (s[i].price - s[i - 5].price)
    weekStart += f.qty * s[i - 5].price
  }

  const up = funds.filter((f) => f.change > 0).length
  const down = funds.filter((f) => f.change < 0).length
  const dir = pnl >= 0 ? 1 : -1
  const byPnl = [...funds].sort((a, b) => dir * (b.pnl - a.pnl))
  const lead = byPnl[0]?.pnl * dir > 0 ? byPnl[0] : undefined
  const against = byPnl.at(-1)!.pnl * dir < 0 ? byPnl.at(-1) : undefined
  const verb = pnl > 0 ? '올랐습니다' : pnl < 0 ? '내렸습니다' : '그대로입니다'
  const headline = `내 ETF ${funds.length}종목 평가금액이 ${wonText(pnl)}(${pctText(change, 2)}) ${verb}. 상승 ${up} · 하락 ${down}.`

  return {
    date,
    prevDate,
    pnl,
    change,
    missing,
    funds,
    weekPnl,
    weekChange: weekPnl != null && weekStart ? weekPnl / weekStart : undefined,
    headline,
    lead,
    against,
  }
}

/**
 * 지금(휴대폰 시각) 기준으로 장 마감 데이터가 있어야 할 가장 최근 평일.
 * 평일 readyHour시 이후면 오늘, 아니면 그 전 평일. 공휴일은 모르므로 휴장일에는 하루 앞서 나옵니다.
 */
export function expectedTradingDay(now: Date, readyHour = 17): string {
  const d = new Date(now)
  const weekday = (x: Date) => x.getDay() >= 1 && x.getDay() <= 5
  if (!(weekday(d) && d.getHours() >= readyHour)) {
    do d.setDate(d.getDate() - 1)
    while (!weekday(d))
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
