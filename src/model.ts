/** 연금저축 / IRP / DC형 퇴직연금 (DC는 본인 추가 납입분 기준) */
export type AccountType = 'saving' | 'irp' | 'dc'

export const ACCOUNT_LABEL: Record<AccountType, string> = {
  saving: '연금저축',
  irp: 'IRP',
  dc: 'DC형 퇴직연금',
}

export const CATEGORIES = ['국내주식', '해외주식', '채권', '금·원자재', '리츠', '혼합·TDF', '현금성', '기타'] as const
export type Category = (typeof CATEGORIES)[number]

/** IRP·DC에서 위험자산 한도(70%)에 들어가는 분류. 혼합·TDF는 상품마다 달라 직접 고릅니다. */
export const RISKY_BY_DEFAULT: Record<Category, boolean> = {
  국내주식: true,
  해외주식: true,
  채권: false,
  '금·원자재': true,
  리츠: true,
  '혼합·TDF': false,
  현금성: false,
  기타: true,
}

export interface Etf {
  /** 종목코드 (예: 069500) */
  code: string
  name: string
  category: Category
  /** IRP·DC 위험자산 여부 */
  risky: boolean
  /** 목표 비중 % (0이면 신규 매수 제외) */
  targetPct: number
  /** 총보수 % (연) */
  feePct?: number
  memo?: string
  createdAt: number
}

export type EntryKind = 'deposit' | 'buy' | 'sell' | 'dividend'

/**
 * 계좌의 모든 돈 흐름. 입금(불입), 매수, 매도, 분배금을 한 표에 시간순으로 둡니다.
 * 예수금·보유수량·원금은 전부 이 표에서 계산합니다.
 */
export interface Entry {
  id?: number
  date: string
  kind: EntryKind
  code?: string
  qty?: number
  price?: number
  /** deposit·dividend의 금액 (buy·sell은 qty × price) */
  amount?: number
  fee?: number
  /** ETF로 전환할 때 이미 있던 잔고 (매월 불입이 아님) */
  opening?: boolean
  memo?: string
}

export interface PricePoint {
  code: string
  date: string
  price: number
}

export interface Settings {
  accountType: AccountType
  monthlyAmount: number
  depositDay: number
  /** 세액공제율: 총급여 5,500만원 이하 16.5%, 초과 13.2% */
  taxRate: number
  /** 다른 연금계좌(IRP 등)에 올해 넣었거나 넣을 금액 */
  otherAnnual: number
  /** 목표 비중에서 이만큼(%p) 벗어나면 알림 */
  driftBand: number
}

export const DEFAULT_SETTINGS: Settings = {
  accountType: 'saving',
  monthlyAmount: 700_000,
  depositDay: 21,
  taxRate: 0.165,
  otherAnnual: 0,
  driftBand: 5,
}
