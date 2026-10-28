import type { Entry } from '../model'

const pad = (n: number) => String(n).padStart(2, '0')

/** 그 달에 그날이 없으면(예: 31일) 말일 */
export function depositDateOf(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad(month)}-${pad(Math.min(day, last))}`
}

/** 오늘이거나 오늘 이후 가장 가까운 불입일 */
export function nextDepositDate(today: string, day: number): string {
  const [y, m] = today.split('-').map(Number)
  const thisMonth = depositDateOf(y, m, day)
  if (thisMonth >= today) return thisMonth
  return m === 12 ? depositDateOf(y + 1, 1, day) : depositDateOf(y, m + 1, day)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** 주말이면 다음 월요일 (공휴일은 따로 확인) */
export function nextWeekday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const dow = d.getUTCDay()
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2)
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** 이번 달(YYYY-MM) 매월 불입이 기록됐는지 */
export function depositedIn(entries: Entry[], month: string): boolean {
  return entries.some((e) => e.kind === 'deposit' && !e.opening && e.date.startsWith(month))
}

/** 이 달에 아직 매수 안 된 돈이 있는지: 불입은 했고 같은 달 불입 이후 매수가 없음 */
export function boughtIn(entries: Entry[], month: string): boolean {
  return entries.some((e) => e.kind === 'buy' && !e.opening && e.date.startsWith(month))
}

/** 올해 남은 불입 횟수 (오늘 불입일이 지났으면 이번 달은 뺌) */
export function depositsLeftThisYear(today: string, day: number, alreadyThisMonth: boolean): number {
  const [y, m] = today.split('-').map(Number)
  const thisMonthCounts = !alreadyThisMonth && depositDateOf(y, m, day) >= today
  return 12 - m + (thisMonthCounts ? 1 : 0)
}

export function localToday(now = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
