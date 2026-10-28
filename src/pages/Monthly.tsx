import { useEffect, useMemo, useState } from 'react'
import { RISKY_LIMIT_PCT } from '../calc/advice'
import { currentWeights, only, planBuys, type PlanItem } from '../calc/allocate'
import { priceOn } from '../calc/portfolio'
import { depositedIn, nextDepositDate } from '../calc/schedule'
import type { Tab } from '../components/TabBar'
import { Button, Card, NumberInput, Segmented } from '../components/ui'
import { savePrices, saveMonthly } from '../db/db'
import { targetLabel, won } from '../format'
import { usePortfolio } from '../usePortfolio'

type Mode = 'target' | 'keep' | 'one'

export default function Monthly({ go }: { go: (t: Tab) => void }) {
  const p = usePortfolio()
  const [date, setDate] = useState<string>()
  const [deposit, setDeposit] = useState<number>()
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<Mode>('target')
  const [oneCode, setOneCode] = useState<string>()
  const [edits, setEdits] = useState<Record<string, number>>({})
  const [msg, setMsg] = useState('')

  // fill in defaults once the data has loaded
  useEffect(() => {
    if (!p || date) return
    const month = p.today.slice(0, 7)
    setDate(p.today)
    setDeposit(depositedIn(p.entries, month) ? 0 : p.settings.monthlyAmount)
    setPrices(Object.fromEntries(p.etfs.map((e) => [e.code, priceOn(p.book, e.code)?.price ?? 0])))
    setOneCode(p.etfs.find((e) => e.targetPct > 0)?.code ?? p.etfs[0]?.code)
  }, [p, date])

  const items: PlanItem[] = useMemo(
    () =>
      p
        ? p.etfs.map((e) => ({
            code: e.code,
            price: prices[e.code] ?? 0,
            qty: p.summary.holdings.find((h) => h.code === e.code)?.qty ?? 0,
            targetPct: e.targetPct,
            risky: e.risky,
          }))
        : [],
    [p, prices],
  )
  const cash = (p?.summary.cash ?? 0) + (deposit ?? 0)
  const riskyLimitPct = p && p.settings.accountType !== 'saving' ? RISKY_LIMIT_PCT : undefined
  const plan = useMemo(() => {
    const goal = mode === 'keep' ? currentWeights(items) : mode === 'one' && oneCode ? only(items, oneCode) : items
    return planBuys(goal, Math.max(0, cash), { riskyLimitPct })
  }, [items, cash, mode, oneCode, riskyLimitPct])

  // a new plan replaces quantities typed for the old one
  useEffect(() => setEdits({}), [mode, oneCode, deposit])

  if (!p || date == null) return null
  const { etfs, settings, summary, entries, today } = p
  const month = today.slice(0, 7)
  const already = depositedIn(entries, month)

  if (!etfs.length) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">이번 달 불입</h1>
        <Card>
          <p className="text-sm text-slate-600">먼저 📈 종목 탭에서 ETF와 목표 비중을 넣으세요.</p>
          <Button className="mt-3 w-full" onClick={() => go('funds')}>
            종목 추가하기
          </Button>
        </Card>
      </section>
    )
  }

  const lines = plan.lines.map((l) => {
    const buyQty = edits[l.code] ?? l.buyQty
    return { ...l, buyQty, amount: buyQty * l.price, afterPct: plan.total ? (((l.qty + buyQty) * l.price) / plan.total) * 100 : 0 }
  })
  const spent = lines.reduce((s, l) => s + l.amount, 0)
  const left = cash - spent
  const missingPrice = etfs.some((e) => !(prices[e.code] > 0))
  const riskyAfter = plan.total ? (lines.filter((l) => l.risky).reduce((s, l) => s + (l.qty + l.buyQty) * l.price, 0) / plan.total) * 100 : 0
  const targetSum = etfs.reduce((s, e) => s + e.targetPct, 0)

  const save = async () => {
    await saveMonthly(
      date,
      deposit ?? 0,
      lines.map((l) => ({ code: l.code, qty: l.buyQty, price: l.price })),
    )
    setMsg(`${date} 불입 ${won(deposit ?? 0)}, 매수 ${lines.filter((l) => l.buyQty).length}종목 ${won(spent)}을 기록했습니다.`)
    setDeposit(0)
    setEdits({})
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">이번 달 불입</h1>

      <Card title="1. 넣을 돈">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">
            날짜
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
            />
          </label>
          <div className="text-xs text-slate-500">
            이번 입금액
            <NumberInput className="mt-1" value={deposit} onChange={setDeposit} suffix="원" />
          </div>
        </div>
        {already && (
          <p className="mt-2 text-xs text-amber-700">이번 달 불입은 이미 기록했습니다. 남은 예수금으로만 살 때는 입금액을 0으로 두세요.</p>
        )}
        <div className="mt-3 flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-600">쓸 수 있는 돈 (예수금 {won(summary.cash)} 포함)</span>
          <span className="font-semibold tabular-nums">{won(cash)}</span>
        </div>
        {date < nextDepositDate(`${month}-01`, settings.depositDay) && !already && (
          <p className="mt-2 text-xs text-slate-500">아직 이번 달 불입일({settings.depositDay}일) 전입니다.</p>
        )}
      </Card>

      <Card title="2. 지금 가격" right={<span className="text-xs text-slate-500">증권앱 현재가</span>}>
        <ul className="space-y-2">
          {etfs.map((e) => (
            <li key={e.code} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{e.name}</div>
                <div className="text-xs text-slate-400">{e.code}</div>
              </div>
              <NumberInput className="w-32" value={prices[e.code] || undefined} onChange={(n) => setPrices({ ...prices, [e.code]: n })} suffix="원" />
            </li>
          ))}
        </ul>
        <button
          className="mt-3 text-sm text-indigo-700"
          disabled={missingPrice}
          onClick={async () => {
            await savePrices(etfs.map((e) => ({ code: e.code, date, price: prices[e.code] })))
            setMsg(`${date} 가격을 저장했습니다 (수익률·추세에 반영).`)
          }}
        >
          가격만 저장 (매수 없이 추적용)
        </button>
      </Card>

      <Card title="3. 어디에 넣을까">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { id: 'target', label: '목표 비중대로' },
            { id: 'keep', label: '지금 비중대로' },
            { id: 'one', label: '한 종목에' },
          ]}
        />
        <p className="mt-2 text-xs text-slate-500">
          {mode === 'target' && '목표보다 모자란 종목부터 1주씩 삽니다. 팔지 않고 매달 불입금으로 비중을 맞춥니다.'}
          {mode === 'keep' && '지금 갖고 있는 비율 그대로 늘립니다.'}
          {mode === 'one' && '고른 한 종목을 살 수 있는 만큼 삽니다.'}
        </p>
        {mode === 'one' && (
          <select value={oneCode} onChange={(e) => setOneCode(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
            {etfs.map((e) => (
              <option key={e.code} value={e.code}>
                {e.name}
              </option>
            ))}
          </select>
        )}
        {mode === 'target' && Math.round(targetSum) !== 100 && <p className="mt-2 text-xs text-amber-700">목표 비중 합이 {targetSum}%라 비율로 환산해 계산합니다.</p>}

        {missingPrice ? (
          <p className="mt-4 text-sm text-amber-700">가격이 비어 있는 종목이 있습니다. 2번에서 모든 가격을 넣어 주세요.</p>
        ) : (
          <>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="pb-1 text-left font-normal">종목</th>
                  <th className="pb-1 text-right font-normal">비중 → 후</th>
                  <th className="w-20 pb-1 text-right font-normal">수량</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const etf = etfs.find((e) => e.code === l.code)!
                  return (
                    <tr key={l.code} className="border-t border-slate-100">
                      <td className="py-2 pr-2">
                        <div className="line-clamp-2">{etf.name}</div>
                        <div className="text-xs text-slate-500 tabular-nums">{l.buyQty ? won(l.amount) : '–'}</div>
                      </td>
                      <td className="py-2 text-right text-xs whitespace-nowrap tabular-nums text-slate-600">
                        {l.beforePct.toFixed(1)} → <b className="text-slate-900">{l.afterPct.toFixed(1)}%</b>
                        <div className="text-slate-400">목표 {targetLabel(targetSum ? (etf.targetPct / targetSum) * 100 : 0)}</div>
                      </td>
                      <td className="py-2 pl-2">
                        <NumberInput value={l.buyQty} onChange={(n) => setEdits({ ...edits, [l.code]: Math.max(0, Math.floor(n)) })} suffix="주" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="mt-3 space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-sm tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-600">매수 합계</span>
                <span className="font-semibold">{won(spent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">남는 예수금</span>
                <span className={left < 0 ? 'font-semibold text-red-600' : ''}>{won(left)}</span>
              </div>
              {riskyLimitPct != null && (
                <div className="flex justify-between">
                  <span className="text-slate-600">위험자산 비중 (한도 {riskyLimitPct}%)</span>
                  <span className={riskyAfter > riskyLimitPct ? 'font-semibold text-red-600' : ''}>{riskyAfter.toFixed(1)}%</span>
                </div>
              )}
            </div>
            {left < 0 && <p className="mt-2 text-xs text-red-600">쓸 수 있는 돈보다 많이 샀습니다. 수량을 줄이세요.</p>}
            {plan.limitedByRisk && <p className="mt-2 text-xs text-amber-700">위험자산 한도 때문에 일부 종목을 덜 샀습니다.</p>}
            {Object.keys(edits).length > 0 && (
              <button className="mt-2 text-xs text-indigo-700" onClick={() => setEdits({})}>
                계산된 수량으로 되돌리기
              </button>
            )}
          </>
        )}
      </Card>

      <Card title="새 종목에 넣고 싶다면">
        <p className="text-sm text-slate-600">
          📈 종목 탭에서 새 ETF를 추가하고 목표 비중을 주면, 여기서 그 종목이 가장 모자란 종목이 되어 먼저 배분됩니다. 추가할 때 이미 같은 분류를 갖고 있는지, 보수가 비싼지 점검해 줍니다.
        </p>
        <Button kind="secondary" className="mt-3 w-full" onClick={() => go('funds')}>
          종목 추가·목표 비중 바꾸기
        </Button>
      </Card>

      <Card title="4. 체결 후 기록">
        <p className="text-sm text-slate-600">증권앱에서 위 수량대로 주문하고, 체결가가 다르면 2번 가격·3번 수량을 고친 뒤 기록하세요.</p>
        <Button className="mt-3 w-full" disabled={missingPrice || left < 0 || (!deposit && !spent)} onClick={save}>
          입금 {won(deposit ?? 0)} + 매수 {won(spent)} 기록
        </Button>
        {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
      </Card>
    </section>
  )
}
