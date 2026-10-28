import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { RISKY_LIMIT_PCT } from '../calc/advice'
import { correlatedPairs, MIN_TRADING_DAYS, recommend, STYLE_LABEL, trendStats, type Style } from '../calc/trend'
import { db } from '../db/db'
import { marketUpdatedAt, syncMarket } from '../db/market'
import { gainColor, pct } from '../format'
import type { Portfolio } from '../usePortfolio'
import { Button, Card, Segmented } from './ui'

const MIN_PCT = 3

interface PreviousTargets {
  at: string
  targets: Record<string, number>
}

// 최근 6개월 종가로 종목별 추세를 보여 주고, 지금 목표 비중을 얼마나 바꾸면 좋을지 제안합니다.
export default function TrendCard({ p }: { p: Portfolio }) {
  const updatedAt = useLiveQuery(marketUpdatedAt)
  const previous = useLiveQuery(async () => (await db.meta.get('previousTargets'))?.value as PreviousTargets | undefined)
  const [style, setStyle] = useState<Style>('balanced')
  const [dropSmall, setDropSmall] = useState(false)
  const [open, setOpen] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const { etfs, book, today, summary, settings } = p

  const stats = useMemo(() => new Map(etfs.map((e) => [e.code, trendStats(e.code, book.get(e.code) ?? [], today)])), [etfs, book, today])
  const rec = useMemo(
    () =>
      recommend(
        etfs.map((e) => ({
          code: e.code,
          name: e.name,
          risky: e.risky,
          target: e.targetPct,
          weight: summary.holdings.find((h) => h.code === e.code)?.weightPct ?? 0,
          stats: stats.get(e.code),
        })),
        { style, minPct: dropSmall ? MIN_PCT : undefined, riskyLimitPct: settings.accountType === 'saving' ? undefined : RISKY_LIMIT_PCT },
      ),
    [etfs, stats, summary, style, dropSmall, settings.accountType],
  )
  const pairs = useMemo(() => correlatedPairs(etfs.map((e) => e.code), book, today), [etfs, book, today])
  const nameOf = (code: string) => etfs.find((e) => e.code === code)?.name ?? code
  const analysed = etfs.filter((e) => (stats.get(e.code)?.days ?? 0) >= MIN_TRADING_DAYS).length
  const small = rec.lines.filter((l) => l.from > 0 && l.from < MIN_PCT).length
  const changed = rec.lines.some((l) => Math.abs(l.to - l.from) >= 0.1)

  const refresh = async () => {
    setBusy(true)
    setMsg('')
    try {
      const r = await syncMarket(
        etfs.map((e) => e.code),
        true,
      )
      setMsg(r?.failed.length ? `${r.failed.map(nameOf).join(', ')}의 가격을 받지 못했습니다.` : '최신 종가를 받았습니다.')
    } catch {
      setMsg('가격 데이터를 받지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도하세요.')
    }
    setBusy(false)
  }

  const apply = async () => {
    if (!confirm('추천 비중을 목표 비중으로 바꿀까요? 지금 목표는 되돌리기용으로 저장해 둡니다.')) return
    await db.transaction('rw', db.etfs, db.meta, async () => {
      await db.meta.put({ key: 'previousTargets', value: { at: today, targets: Object.fromEntries(etfs.map((e) => [e.code, e.targetPct])) } })
      for (const l of rec.lines) await db.etfs.update(l.code, { targetPct: l.to })
    })
    setMsg('목표 비중을 바꿨습니다. 💰 이번 달 불입에서 새 목표대로 배분됩니다.')
  }

  const undo = async () => {
    if (!previous) return
    await db.transaction('rw', db.etfs, db.meta, async () => {
      for (const [code, t] of Object.entries(previous.targets)) await db.etfs.update(code, { targetPct: t })
      await db.meta.delete('previousTargets')
    })
    setMsg(`${previous.at}에 바꾸기 전 목표로 되돌렸습니다.`)
  }

  return (
    <Card
      title="6개월 추세 · 목표 비중 추천"
      right={
        <button className="text-xs text-indigo-700 disabled:opacity-40" disabled={busy} onClick={refresh}>
          {busy ? '받는 중…' : '가격 새로 받기'}
        </button>
      }
    >
      <p className="text-xs text-slate-500">
        {updatedAt
          ? `${new Date(updatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}에 받은 종가 기준 · 평일 장 마감 후 매일 갱신`
          : '아직 종가를 받지 못했습니다. "가격 새로 받기"를 누르세요.'}
      </p>

      {analysed === 0 ? (
        <p className="mt-3 text-sm text-slate-600">분석할 가격 기록이 없습니다. 종목마다 {MIN_TRADING_DAYS}거래일 이상의 종가가 필요합니다.</p>
      ) : (
        <>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="pb-1 text-left font-normal">종목</th>
                <th className="pb-1 text-right font-normal">6개월</th>
                <th className="pb-1 text-right font-normal">목표 → 추천</th>
              </tr>
            </thead>
            <tbody>
              {rec.lines.map((l) => {
                const s = stats.get(l.code)
                const d = l.to - l.from
                return (
                  <tr key={l.code} className="cursor-pointer border-t border-slate-100 align-top" onClick={() => setOpen(open === l.code ? undefined : l.code)}>
                    <td className="py-2 pr-2">
                      <div className="line-clamp-2">{l.name}</div>
                      {s && s.days >= MIN_TRADING_DAYS && (
                        <div className="text-xs text-slate-500 tabular-nums">
                          변동성 {(s.vol * 100).toFixed(0)}% · 낙폭 {(s.mdd * 100).toFixed(0)}%
                        </div>
                      )}
                      {open === l.code && (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                          {l.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className={`py-2 text-right whitespace-nowrap tabular-nums ${s && s.days >= MIN_TRADING_DAYS ? gainColor(s.ret6m) : 'text-slate-400'}`}>
                      {s && s.days >= MIN_TRADING_DAYS ? pct(s.ret6m) : '–'}
                    </td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap tabular-nums">
                      <span className="text-slate-500">{l.from.toFixed(1)}</span> → <b>{l.to.toFixed(1)}%</b>
                      {Math.abs(d) >= 0.1 && <div className={`text-xs ${d > 0 ? 'text-red-600' : 'text-blue-600'}`}>{`${d > 0 ? '+' : ''}${d.toFixed(1)}%p`}</div>}
                      {l.dropped && <div className="text-xs text-amber-700">정리 후보</div>}
                      {l.kept && <div className="text-xs text-slate-400">유지</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-400">종목을 누르면 추천 이유가 보입니다.</p>

          {(pairs.length > 0 || rec.notes.length > 0) && (
            <ul className="mt-3 space-y-2">
              {pairs.slice(0, 3).map((x) => (
                <li key={x.a + x.b} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  🔗 {nameOf(x.a)}와 {nameOf(x.b)}는 6개월 상관계수 {x.corr.toFixed(2)}로 거의 같이 움직입니다. 분산 효과가 작으니 두 종목을 합친 비중으로 생각하세요.
                </li>
              ))}
              {rec.notes.map((n) => (
                <li key={n} className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {n}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-2 text-xs text-slate-500">
            <div>추세를 얼마나 반영할까</div>
            <Segmented value={style} onChange={setStyle} options={(Object.keys(STYLE_LABEL) as Style[]).map((s) => ({ id: s, label: STYLE_LABEL[s] }))} />
            <label className="flex items-center gap-2 pt-1 text-sm text-slate-700">
              <input type="checkbox" checked={dropSmall} onChange={(e) => setDropSmall(e.target.checked)} />
              {MIN_PCT}% 미만 종목은 정리 제안{small > 0 && ` (지금 ${small}개)`}
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <Button className="flex-1" disabled={!changed} onClick={apply}>
              추천 비중을 목표로 적용
            </Button>
            {previous && (
              <Button kind="secondary" onClick={undo}>
                되돌리기
              </Button>
            )}
          </div>
        </>
      )}
      {msg && <p className="mt-2 text-sm text-slate-700">{msg}</p>}
      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        지금 목표에서 출발해 최근 6개월 위험 대비 성과가 좋았던 종목은 늘리고 부진했던 종목은 줄이며, 많이 출렁인 종목은 낮춥니다(한 종목 최대 40%). 지난 추세가 앞으로도 이어진다는 보장은 없습니다. 추천은 계산 결과일 뿐 투자 권유가 아니니, 적용 전에 직접 판단하세요.
      </p>
    </Card>
  )
}
