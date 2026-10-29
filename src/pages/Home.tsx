import { useLiveQuery } from 'dexie-react-hooks'
import { checkPortfolio } from '../calc/advice'
import { valueHistory } from '../calc/portfolio'
import { boughtIn, daysBetween, depositedIn, depositsLeftThisYear, nextDepositDate, nextWeekday } from '../calc/schedule'
import { paidInYear, taxCredit } from '../calc/tax'
import { xirr } from '../calc/xirr'
import type { Tab } from '../components/TabBar'
import BriefCard from '../components/BriefCard'
import TrendChart from '../components/TrendChart'
import { Button, Card, Stat, Tips, WeightBar } from '../components/ui'
import { isSample, loadSample } from '../db/sample'
import { dateLabel, gainColor, manwon, pct, signedWon, targetLabel, won } from '../format'
import { ACCOUNT_LABEL } from '../model'
import { usePortfolio } from '../usePortfolio'

export default function Home({ go }: { go: (t: Tab) => void }) {
  const p = usePortfolio()
  const sample = useLiveQuery(isSample)
  if (!p) return null
  const { today, etfs, entries, settings, summary, book } = p

  if (!etfs.length && !entries.length) {
    return (
      <section className="space-y-4">
        <Header today={today} />
        <Card title="시작하기">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>⚙️ 설정에서 계좌 종류·월 불입액(70만원)·불입일(21일)을 확인하세요.</li>
            <li>📈 종목 탭에서 지금 가진 ETF를 추가하고 목표 비중을 정하세요. "지금 보유" 수량·평균단가를 넣으면 전환 당시 잔고로 기록됩니다.</li>
            <li>💰 매달 21일에 "이번 달 불입"에서 살 수량을 계산하고 체결을 기록하세요.</li>
          </ol>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => go('funds')} className="flex-1">
              종목 추가하기
            </Button>
            <Button kind="secondary" onClick={() => loadSample(today)}>
              예시로 둘러보기
            </Button>
          </div>
        </Card>
        <Disclaimer />
      </section>
    )
  }

  const month = today.slice(0, 7)
  const next = nextDepositDate(today, settings.depositDay)
  const dday = daysBetween(today, next)
  const deposited = depositedIn(entries, month)
  const bought = boughtIn(entries, month)
  const thisMonthDay = nextDepositDate(`${month}-01`, settings.depositDay)

  const history = valueHistory(etfs, entries, book)
  const flows = [
    ...entries
      .filter((e) => e.kind === 'deposit' || (e.kind === 'buy' && e.opening))
      .map((e) => ({ date: e.date, amount: -(e.kind === 'deposit' ? (e.amount ?? 0) : (e.qty ?? 0) * (e.price ?? 0) + (e.fee ?? 0)) })),
    { date: today, amount: summary.total },
  ]
  const annual = xirr(flows)
  const daysSincePrice = p.lastPriceDate ? daysBetween(p.lastPriceDate, today) : undefined
  const tips = checkPortfolio({ summary, etfs, accountType: settings.accountType, driftBand: settings.driftBand, monthlyAmount: settings.monthlyAmount, daysSincePrice })
  const year = today.slice(0, 4)
  const tax = taxCredit({
    type: settings.accountType,
    paid: paidInYear(entries, year, settings),
    other: settings.otherAnnual,
    monthly: settings.monthlyAmount,
    depositsLeft: depositsLeftThisYear(today, settings.depositDay, deposited),
    rate: settings.taxRate,
  })
  const targetSum = etfs.reduce((s, e) => s + e.targetPct, 0)

  return (
    <section className="space-y-4">
      <Header today={today} />
      {sample && (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">예시 데이터입니다. ⚙️ 설정 → "모든 데이터 지우기" 후 내 종목을 넣으세요.</div>
      )}

      <BriefCard p={p} />

      <Card>
        {today >= thisMonthDay && !deposited ? (
          <button onClick={() => go('monthly')} className="flex w-full items-center justify-between text-left">
            <div>
              <div className="text-sm font-semibold text-indigo-700">이번 달 불입일이 지났습니다</div>
              <div className="text-xs text-slate-500">{won(settings.monthlyAmount)} 배분하고 체결을 기록하세요</div>
            </div>
            <span className="rounded-lg bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white">배분하기</span>
          </button>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">다음 불입</div>
              <div className="font-semibold">
                {dateLabel(next)} {dday === 0 ? '(오늘)' : `· D-${dday}`}
              </div>
              {nextWeekday(next) !== next && <div className="text-xs text-slate-500">주말이라 매수는 {dateLabel(nextWeekday(next))}(월)</div>}
            </div>
            <div className="text-right text-xs text-slate-500">
              이번 달 {deposited ? '불입 ✓' : '불입 전'}
              <br />
              {deposited && (bought ? '매수 ✓' : '매수 전')}
            </div>
          </div>
        )}
      </Card>

      <Card title={`${ACCOUNT_LABEL[settings.accountType]} 평가금액`}>
        <div className="text-3xl font-bold tabular-nums">{won(summary.total)}</div>
        <div className={`mt-1 text-sm font-semibold tabular-nums ${gainColor(summary.gain)}`}>
          {signedWon(summary.gain)} ({pct(summary.gainPct)})
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="넣은 돈" value={manwon(summary.principal)} />
          <Stat
            label="연환산 수익률"
            value={annual == null ? '–' : pct(annual)}
            className={annual == null ? '' : gainColor(annual)}
            sub={annual == null ? '3개월 이후 계산' : '넣은 시점 반영'}
          />
          <Stat label="예수금" value={manwon(summary.cash)} />
        </div>
        {history.length >= 2 && (
          <div className="mt-4">
            <TrendChart
              data={history.map((h) => ({ date: h.date, value: h.total, ref: h.principal }))}
              axis={(v) => `${Math.round(v / 10_000).toLocaleString('ko-KR')}`}
              format={(d) => `${d.date.replaceAll('-', '.')} · ${manwon(d.value)} (원금 ${manwon(d.ref ?? 0)})`}
            />
            <div className="mt-1 flex gap-3 text-xs text-slate-500">
              <span>━ 평가금액</span>
              <span>┅ 넣은 돈</span>
              <span className="ml-auto">단위: 만원</span>
            </div>
          </div>
        )}
      </Card>

      <Card title="비중" right={<span className="text-xs text-slate-500">막대 = 지금, 선 = 목표</span>}>
        <ul className="space-y-3">
          {summary.holdings.map((h) => (
            <li key={h.code}>
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="truncate">{h.name}</span>
                <span className="shrink-0 tabular-nums text-slate-600">
                  {h.weightPct.toFixed(1)}% / {targetLabel(targetSum ? (h.targetPct / targetSum) * 100 : 0)}
                </span>
              </div>
              <WeightBar pct={h.weightPct} target={targetSum ? (h.targetPct / targetSum) * 100 : undefined} />
            </li>
          ))}
          {summary.cash > 0 && (
            <li>
              <div className="mb-1 flex justify-between text-sm text-slate-500">
                <span>예수금</span>
                <span className="tabular-nums">{((summary.cash / summary.total) * 100).toFixed(1)}%</span>
              </div>
              <WeightBar pct={(summary.cash / summary.total) * 100} color="bg-slate-300" />
            </li>
          )}
        </ul>
      </Card>

      {tips.length > 0 && (
        <Card title="점검">
          <Tips tips={tips} />
        </Card>
      )}

      <Card title={`${year}년 세액공제`} right={<span className="text-xs text-slate-500">공제율 {(settings.taxRate * 100).toFixed(1)}%</span>}>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="올해 불입" value={manwon(tax.paid)} sub={`예상 환급 ${won(tax.credit)}`} />
          <Stat label="연말 예상" value={manwon(tax.projected)} sub={`예상 환급 ${won(tax.projectedCredit)}`} />
        </div>
        <p className="mt-3 text-xs text-slate-600">
          {tax.room > 0
            ? `연말까지 ${manwon(tax.room)}을 더 넣으면 공제 한도를 다 채웁니다.`
            : tax.projected > tax.projectedEligible
              ? `연말 예상 불입이 공제 한도보다 ${manwon(tax.projected - tax.projectedEligible)} 많습니다. 넘는 금액은 공제되지 않습니다(다음 해로 이월 신청 가능).`
              : '올해 공제 한도를 채울 예정입니다.'}
        </p>
      </Card>
      <Disclaimer />
    </section>
  )
}

function Header({ today }: { today: string }) {
  const label = new Date(`${today}T00:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
  return (
    <header>
      <div className="text-sm text-slate-500">{label}</div>
      <h1 className="text-2xl font-bold">개인연금</h1>
    </header>
  )
}

function Disclaimer() {
  return (
    <p className="px-1 text-xs leading-relaxed text-slate-400">
      이 앱의 계산과 점검은 내가 정한 목표 비중과 입력한 가격을 기준으로 한 참고용이며 투자 권유가 아닙니다. 세액공제 한도·공제율은 2026년 세법 기준이니 연말정산 전에 확인하세요.
    </p>
  )
}
