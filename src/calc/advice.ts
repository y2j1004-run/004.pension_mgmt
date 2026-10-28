import type { AccountType, Category, Etf } from '../model'
import type { Summary } from './portfolio'

export const RISKY_LIMIT_PCT = 70
export const HIGH_FEE_PCT = 0.3
export const CONCENTRATION_PCT = 50

export interface Tip {
  level: 'warn' | 'info' | 'good'
  text: string
}

const p1 = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })

/** 목표 비중·보수·한도·예수금을 기준으로 지금 확인할 것들 (투자 권유가 아니라 내가 정한 기준에 대한 점검) */
export function checkPortfolio(opts: {
  summary: Summary
  etfs: Etf[]
  accountType: AccountType
  driftBand: number
  monthlyAmount: number
  daysSincePrice?: number
}): Tip[] {
  const { summary, etfs, accountType, driftBand } = opts
  const tips: Tip[] = []
  const etfBy = new Map(etfs.map((e) => [e.code, e]))
  const targetSum = etfs.reduce((s, e) => s + e.targetPct, 0)

  if (!etfs.length) return tips
  if (Math.round(targetSum) !== 100) {
    tips.push({ level: 'warn', text: `목표 비중 합이 ${p1(targetSum)}%입니다. 100%가 되게 맞추면 배분이 정확해집니다.` })
  }

  if (opts.daysSincePrice != null && opts.daysSincePrice > 35) {
    tips.push({ level: 'info', text: `가격을 ${opts.daysSincePrice}일 동안 업데이트하지 않았습니다. 지금 평가금액은 예전 가격 기준입니다.` })
  }

  // compare against what is invested, so cash waiting to be spent doesn't read as every fund being under target
  if (summary.invested > 0 && targetSum > 0) {
    let drifted = 0
    for (const h of summary.holdings) {
      const target = (h.targetPct / targetSum) * 100
      const diff = (h.value / summary.invested) * 100 - target
      if (Math.abs(diff) < driftBand) continue
      drifted++
      if (diff < 0) {
        tips.push({ level: 'info', text: `${h.name}: 목표 ${p1(target)}%보다 ${p1(-diff)}%p 낮습니다 → 이번 불입에서 우선 매수.` })
      } else if (diff >= driftBand * 2) {
        tips.push({
          level: 'warn',
          text: `${h.name}: 목표보다 ${p1(diff)}%p 높습니다. 불입금만으로는 맞추기 어려우니 일부 매도 후 재배분을 고려하세요 (연금계좌 안 매매는 그때 세금이 붙지 않습니다).`,
        })
      } else {
        tips.push({ level: 'info', text: `${h.name}: 목표보다 ${p1(diff)}%p 높습니다 → 이번 달은 매수를 쉬어도 됩니다.` })
      }
    }
    if (!drifted) tips.push({ level: 'good', text: `모든 종목이 목표 비중 ±${driftBand}%p 안에 있습니다.` })
  }

  for (const h of summary.holdings) {
    // a fund meant to be half the account is a choice already made; point it out only once it has run past that
    const targetShare = targetSum ? (h.targetPct / targetSum) * 100 : 0
    if (h.weightPct > CONCENTRATION_PCT && h.weightPct - targetShare >= driftBand && etfs.length > 1) {
      tips.push({ level: 'warn', text: `${h.name} 한 종목이 ${p1(h.weightPct)}%입니다. 한 종목·한 시장 집중이 의도한 것인지 확인하세요.` })
    }
    const etf = etfBy.get(h.code)
    if (etf?.feePct != null && etf.feePct >= HIGH_FEE_PCT && h.qty > 0) {
      tips.push({
        level: 'info',
        text: `${h.name} 총보수 ${etf.feePct}%: 같은 지수를 따라가는 더 싼 ETF가 있는지 확인해 보세요 (장기로는 보수 차이가 수익률 차이로 쌓입니다).`,
      })
    }
    if (etf && etf.targetPct === 0 && h.qty > 0) {
      tips.push({ level: 'info', text: `${h.name}: 목표 0%라 새로 사지 않습니다. 정리할 종목이면 매도 후 다른 종목으로 옮기세요.` })
    }
  }

  if (accountType !== 'saving' && summary.total > 0) {
    const risky = summary.holdings.filter((h) => etfBy.get(h.code)?.risky).reduce((s, h) => s + h.value, 0)
    const pct = (risky / summary.total) * 100
    if (pct > RISKY_LIMIT_PCT) {
      tips.push({ level: 'warn', text: `위험자산이 ${p1(pct)}%로 한도 ${RISKY_LIMIT_PCT}%를 넘었습니다. 위험자산 추가 매수가 막힐 수 있습니다.` })
    } else if (pct > RISKY_LIMIT_PCT - 5) {
      tips.push({ level: 'info', text: `위험자산 ${p1(pct)}% — 한도 ${RISKY_LIMIT_PCT}%에 가깝습니다.` })
    }
    const riskyTarget = etfs.filter((e) => e.risky).reduce((s, e) => s + e.targetPct, 0)
    if (targetSum > 0 && (riskyTarget / targetSum) * 100 > RISKY_LIMIT_PCT) {
      tips.push({ level: 'warn', text: `목표 비중에서 위험자산이 ${p1((riskyTarget / targetSum) * 100)}%입니다. IRP·DC는 ${RISKY_LIMIT_PCT}%까지만 담을 수 있습니다.` })
    }
  }

  if (summary.cash >= opts.monthlyAmount * 1.5) {
    tips.push({ level: 'info', text: `예수금 ${Math.round(summary.cash).toLocaleString('ko-KR')}원이 투자되지 않고 있습니다.` })
  }
  return tips
}

export interface NewFundCheck {
  sameCategory: Etf[]
  tips: Tip[]
}

/** 새 종목을 넣기 전에: 이미 같은 분류를 갖고 있는지, 보수는 어떤지 */
export function checkNewFund(candidate: { category: Category; feePct?: number }, etfs: Etf[]): NewFundCheck {
  const sameCategory = etfs.filter((e) => e.category === candidate.category)
  const tips: Tip[] = []
  if (sameCategory.length) {
    const cheaper = sameCategory.filter((e) => e.feePct != null && candidate.feePct != null && e.feePct < candidate.feePct)
    tips.push({
      level: 'info',
      text: `이미 같은 분류(${candidate.category})의 ${sameCategory.map((e) => e.name).join(', ')}이(가) 있습니다. 추종 지수가 다르거나 보수가 더 싸지 않다면 기존 종목에 넣는 편이 관리가 쉽습니다.`,
    })
    if (cheaper.length) tips.push({ level: 'warn', text: `기존 ${cheaper.map((e) => e.name).join(', ')}의 보수가 더 낮습니다.` })
  } else {
    tips.push({ level: 'good', text: `아직 없는 분류(${candidate.category})입니다. 분산 효과를 기대할 수 있습니다.` })
  }
  if (candidate.feePct != null && candidate.feePct >= HIGH_FEE_PCT) {
    tips.push({ level: 'info', text: `총보수 ${candidate.feePct}%는 높은 편입니다. 같은 지수의 저보수 ETF와 비교해 보세요.` })
  }
  if (etfs.length >= 6) tips.push({ level: 'info', text: `이미 ${etfs.length}종목입니다. 종목이 많아지면 매달 1주 단위로 맞추기 어려워집니다.` })
  return { sameCategory, tips }
}
