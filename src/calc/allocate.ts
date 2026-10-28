export interface PlanItem {
  code: string
  price: number
  /** 지금 보유 수량 */
  qty: number
  /** 목표 비중 (합이 100이 아니어도 비율로 맞춥니다) */
  targetPct: number
  risky?: boolean
}

export interface PlanLine extends PlanItem {
  buyQty: number
  amount: number
  beforePct: number
  afterPct: number
}

export interface Plan {
  lines: PlanLine[]
  spent: number
  leftover: number
  total: number
  riskyBeforePct: number
  riskyAfterPct: number
  /** 위험자산 한도 때문에 덜 산 경우 */
  limitedByRisk: boolean
}

export interface PlanOptions {
  /** IRP·DC 위험자산 한도 (예: 70). 없으면 한도 없음 */
  riskyLimitPct?: number
}

/**
 * 예수금으로 살 수 있는 만큼, 목표 비중에서 가장 많이 모자란 종목부터 1주씩 삽니다 (팔지 않고 맞추기).
 * 한 주를 사면 목표를 반 주 이상 넘어서는 종목은 사지 않으므로, 남는 돈은 다음 달로 넘어갑니다.
 */
export function planBuys(items: PlanItem[], cash: number, opts: PlanOptions = {}): Plan {
  const lines: PlanLine[] = items.map((it) => ({ ...it, buyQty: 0, amount: 0, beforePct: 0, afterPct: 0 }))
  const held = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const total = held + cash
  const targetSum = lines.reduce((s, l) => s + Math.max(0, l.targetPct), 0)
  const riskyValue = (withBuys: boolean) =>
    lines.filter((l) => l.risky).reduce((s, l) => s + (l.qty + (withBuys ? l.buyQty : 0)) * l.price, 0)
  let left = cash
  let limitedByRisk = false

  if (targetSum > 0 && total > 0) {
    let risky = riskyValue(true)
    for (;;) {
      let best: PlanLine | undefined
      let bestGap = 0
      for (const l of lines) {
        if (!(l.price > 0) || l.price > left || l.targetPct <= 0) continue
        const gap = (l.targetPct / targetSum) * total - (l.qty + l.buyQty) * l.price
        if (gap < l.price / 2 || gap <= bestGap) continue
        if (l.risky && opts.riskyLimitPct != null && ((risky + l.price) / total) * 100 > opts.riskyLimitPct) {
          limitedByRisk = true
          continue
        }
        best = l
        bestGap = gap
      }
      if (!best) break
      best.buyQty++
      left -= best.price
      if (best.risky) risky += best.price
    }
  }

  for (const l of lines) {
    l.amount = l.buyQty * l.price
    l.beforePct = total ? ((l.qty * l.price) / total) * 100 : 0
    l.afterPct = total ? (((l.qty + l.buyQty) * l.price) / total) * 100 : 0
  }
  return {
    lines,
    spent: cash - left,
    leftover: left,
    total,
    riskyBeforePct: total ? (riskyValue(false) / total) * 100 : 0,
    riskyAfterPct: total ? (riskyValue(true) / total) * 100 : 0,
    limitedByRisk,
  }
}

/** 지금 보유 비중을 목표로 삼은 경우 (새 돈도 지금 비율대로) */
export function currentWeights(items: PlanItem[]): PlanItem[] {
  return items.map((it) => ({ ...it, targetPct: it.qty * it.price }))
}

/** 한 종목에 전부 */
export function only(items: PlanItem[], code: string): PlanItem[] {
  return items.map((it) => ({ ...it, targetPct: it.code === code ? 100 : 0 }))
}
