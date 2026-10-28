export const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

/** 1,234만원 / 1억 2,345만원 */
export function manwon(n: number): string {
  const sign = n < 0 ? '-' : ''
  const man = Math.round(Math.abs(n) / 10_000)
  if (man >= 10_000) {
    const rest = man % 10_000
    return `${sign}${Math.floor(man / 10_000)}억${rest ? ` ${rest.toLocaleString('ko-KR')}만` : ''}원`
  }
  return `${sign}${man.toLocaleString('ko-KR')}만원`
}

export const pct = (ratio: number, digits = 1) => `${ratio > 0 ? '+' : ''}${(ratio * 100).toFixed(digits)}%`

export const signedWon = (n: number) => `${n > 0 ? '+' : ''}${won(n)}`

/** 오르면 빨강, 내리면 파랑 (국내 증권앱 관례) */
export const gainColor = (n: number) => (n > 0 ? 'text-red-600' : n < 0 ? 'text-blue-600' : 'text-slate-500')

export const dateLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`

export function parseNumber(s: string): number {
  const n = Number(s.replace(/[,\s원]/g, ''))
  return Number.isFinite(n) ? n : 0
}
