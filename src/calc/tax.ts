import type { AccountType, Entry } from '../model'

/** 세액공제 대상 납입 한도 (연금저축 단독 600만원, IRP 포함 합산 900만원) */
export const SAVING_LIMIT = 6_000_000
export const TOTAL_LIMIT = 9_000_000

export interface TaxCredit {
  /** 이 계좌에 올해 넣은 돈 (전환 잔고 제외) */
  paid: number
  /** 연말까지 매월 불입을 계속했을 때 */
  projected: number
  eligible: number
  projectedEligible: number
  credit: number
  projectedCredit: number
  /** 연말 예상 기준, 공제 한도까지 더 넣을 수 있는 금액 */
  room: number
}

export function paidInYear(entries: Entry[], year: string): number {
  return entries.filter((e) => e.kind === 'deposit' && !e.opening && e.date.startsWith(year)).reduce((s, e) => s + (e.amount ?? 0), 0)
}

/** 이 계좌 납입액 + 다른 연금계좌(IRP로 봄) 납입액 → 공제 대상 금액 */
export function eligibleAmount(type: AccountType, own: number, other: number): number {
  if (type === 'saving') return Math.min(Math.min(own, SAVING_LIMIT) + other, TOTAL_LIMIT)
  return Math.min(own + other, TOTAL_LIMIT)
}

export function taxCredit(opts: {
  type: AccountType
  paid: number
  other: number
  monthly: number
  depositsLeft: number
  rate: number
}): TaxCredit {
  const projected = opts.paid + opts.monthly * opts.depositsLeft
  const eligible = eligibleAmount(opts.type, opts.paid, opts.other)
  const projectedEligible = eligibleAmount(opts.type, projected, opts.other)
  const cap = opts.type === 'saving' ? Math.min(SAVING_LIMIT, Math.max(0, TOTAL_LIMIT - opts.other)) : Math.max(0, TOTAL_LIMIT - opts.other)
  return {
    paid: opts.paid,
    projected,
    eligible,
    projectedEligible,
    credit: Math.round(eligible * opts.rate),
    projectedCredit: Math.round(projectedEligible * opts.rate),
    room: Math.max(0, cap - projected),
  }
}
