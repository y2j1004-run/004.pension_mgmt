import type { Entry, Etf, PricePoint } from '../model'

export interface Position {
  code: string
  qty: number
  /** 남은 수량의 매수 원가 (이동평균법) */
  cost: number
  realized: number
  dividends: number
}

export interface Account {
  positions: Map<string, Position>
  cash: number
  /** 넣은 돈 합계 (전환 당시 잔고 포함) */
  principal: number
}

const tradeValue = (e: Entry) => (e.qty ?? 0) * (e.price ?? 0)

export function sortEntries(entries: Entry[]): Entry[] {
  // same day: money in before it is spent
  const order = { deposit: 0, dividend: 1, sell: 2, buy: 3 }
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || (a.id ?? 0) - (b.id ?? 0))
}

/** 기록을 처음부터 따라가며 asOf(포함)까지의 보유·예수금·원금을 계산합니다. */
export function accountOn(entries: Entry[], asOf = '9999-12-31'): Account {
  const positions = new Map<string, Position>()
  let cash = 0
  let principal = 0
  const pos = (code: string) => {
    let p = positions.get(code)
    if (!p) positions.set(code, (p = { code, qty: 0, cost: 0, realized: 0, dividends: 0 }))
    return p
  }
  for (const e of sortEntries(entries)) {
    if (e.date > asOf) break
    const fee = e.fee ?? 0
    switch (e.kind) {
      case 'deposit':
        cash += e.amount ?? 0
        principal += e.amount ?? 0
        break
      case 'dividend':
        cash += e.amount ?? 0
        if (e.code) pos(e.code).dividends += e.amount ?? 0
        break
      case 'buy': {
        const p = pos(e.code!)
        p.qty += e.qty ?? 0
        p.cost += tradeValue(e) + fee
        // a holding from before the app was paid for outside these records: its cost counts as money put in
        if (e.opening) principal += tradeValue(e) + fee
        else cash -= tradeValue(e) + fee
        break
      }
      case 'sell': {
        const p = pos(e.code!)
        const qty = Math.min(e.qty ?? 0, p.qty)
        const avg = p.qty ? p.cost / p.qty : 0
        p.realized += tradeValue(e) - fee - avg * qty
        p.cost -= avg * qty
        p.qty -= qty
        cash += tradeValue(e) - fee
        break
      }
    }
  }
  return { positions, cash, principal }
}

/** 종목별 가격 기록 (날짜순). 매수·매도 체결가도 그날의 가격으로 씁니다. */
export function priceBook(prices: PricePoint[], entries: Entry[]): Map<string, PricePoint[]> {
  const byCode = new Map<string, Map<string, number>>()
  const add = (code: string, date: string, price: number) => {
    if (!(price > 0)) return
    let m = byCode.get(code)
    if (!m) byCode.set(code, (m = new Map()))
    m.set(date, price)
  }
  for (const e of entries) if ((e.kind === 'buy' || e.kind === 'sell') && e.code && e.price) add(e.code, e.date, e.price)
  // an entered price wins over a trade price on the same day
  for (const p of prices) add(p.code, p.date, p.price)
  const book = new Map<string, PricePoint[]>()
  for (const [code, m] of byCode) {
    book.set(
      code,
      [...m].map(([date, price]) => ({ code, date, price })).sort((a, b) => a.date.localeCompare(b.date)),
    )
  }
  return book
}

/** date 당일이나 그 전 가장 가까운 가격 */
export function priceOn(book: Map<string, PricePoint[]>, code: string, date = '9999-12-31'): PricePoint | undefined {
  const list = book.get(code)
  if (!list) return undefined
  let found: PricePoint | undefined
  for (const p of list) {
    if (p.date > date) break
    found = p
  }
  return found
}

export interface Holding {
  code: string
  name: string
  qty: number
  cost: number
  avgPrice: number
  price: number
  priceDate?: string
  value: number
  gain: number
  gainPct: number
  realized: number
  dividends: number
  /** 계좌 전체(예수금 포함) 대비 % */
  weightPct: number
  targetPct: number
}

export interface Summary {
  holdings: Holding[]
  cash: number
  invested: number
  total: number
  principal: number
  gain: number
  gainPct: number
}

export function summarize(etfs: Etf[], entries: Entry[], book: Map<string, PricePoint[]>, asOf?: string): Summary {
  const acc = accountOn(entries, asOf)
  const etfBy = new Map(etfs.map((e) => [e.code, e]))
  const codes = [...new Set([...etfs.map((e) => e.code), ...acc.positions.keys()])]
  const rows = codes
    .map((code) => {
      const p = acc.positions.get(code)
      const qty = p?.qty ?? 0
      const cost = p?.cost ?? 0
      const pp = priceOn(book, code, asOf)
      const avgPrice = qty ? cost / qty : 0
      const price = pp?.price ?? avgPrice
      const value = qty * price
      return {
        code,
        name: etfBy.get(code)?.name ?? code,
        qty,
        cost,
        avgPrice,
        price,
        priceDate: pp?.date,
        value,
        gain: value - cost,
        gainPct: cost ? (value - cost) / cost : 0,
        realized: p?.realized ?? 0,
        dividends: p?.dividends ?? 0,
        weightPct: 0,
        targetPct: etfBy.get(code)?.targetPct ?? 0,
      }
    })
    // a sold-out fund that is no longer on the list has nothing left to show
    .filter((h) => h.qty > 0 || etfBy.has(h.code))
  const invested = rows.reduce((s, h) => s + h.value, 0)
  const total = invested + acc.cash
  for (const h of rows) h.weightPct = total ? (h.value / total) * 100 : 0
  rows.sort((a, b) => b.value - a.value || b.targetPct - a.targetPct)
  const gain = total - acc.principal
  return {
    holdings: rows,
    cash: acc.cash,
    invested,
    total,
    principal: acc.principal,
    gain,
    gainPct: acc.principal ? gain / acc.principal : 0,
  }
}

export interface HistoryPoint {
  date: string
  total: number
  principal: number
}

/** 기록·가격이 있는 날마다의 평가금액과 원금 */
export function valueHistory(etfs: Etf[], entries: Entry[], book: Map<string, PricePoint[]>): HistoryPoint[] {
  const dates = new Set(entries.map((e) => e.date))
  for (const list of book.values()) for (const p of list) dates.add(p.date)
  const first = entries.length ? sortEntries(entries)[0].date : undefined
  return [...dates]
    .filter((d) => first && d >= first)
    .sort()
    .map((date) => {
      const s = summarize(etfs, entries, book, date)
      return { date, total: s.total, principal: s.principal }
    })
}

/** 지금 가격이 days일 전 가격보다 몇 % 올랐는지. 그 무렵 가격 기록이 없으면 undefined */
export function priceChange(book: Map<string, PricePoint[]>, code: string, today: string, days: number): number | undefined {
  const now = priceOn(book, code, today)
  const then = priceOn(book, code, addDays(today, -days))
  // the older price has to be from around that time, not from long before
  if (!now || !then || then.date === now.date || then.date < addDays(today, -days * 1.5)) return undefined
  return now.price / then.price - 1
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + Math.round(n))
  return d.toISOString().slice(0, 10)
}
