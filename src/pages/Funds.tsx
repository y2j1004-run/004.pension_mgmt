import { useState } from 'react'
import { checkNewFund } from '../calc/advice'
import { priceChange, type Holding } from '../calc/portfolio'
import TrendCard from '../components/TrendCard'
import TrendChart from '../components/TrendChart'
import { Button, Card, NumberInput, Tips, WeightBar } from '../components/ui'
import { db, deleteEtf } from '../db/db'
import { lookupEtf, syncMarket } from '../db/market'
import { gainColor, pct, signedWon, targetLabel, won } from '../format'
import { CATEGORIES, RISKY_BY_DEFAULT, type Category, type Etf } from '../model'
import { usePortfolio, type Portfolio } from '../usePortfolio'

export default function Funds() {
  const p = usePortfolio()
  const [open, setOpen] = useState<string>()
  const [adding, setAdding] = useState(false)
  if (!p) return null
  const { etfs, summary } = p
  const targetSum = etfs.reduce((s, e) => s + e.targetPct, 0)

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">종목</h1>
        <span className={`text-sm tabular-nums ${Math.round(targetSum) === 100 ? 'text-slate-500' : 'font-semibold text-amber-700'}`}>목표 합 {targetSum}%</span>
      </div>

      {etfs.length > 0 && <TrendCard p={p} />}

      {summary.holdings.map((h) => {
        const etf = etfs.find((e) => e.code === h.code)
        return (
          <Card key={h.code}>
            <button className="w-full text-left" onClick={() => setOpen(open === h.code ? undefined : h.code)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{h.name}</div>
                  <div className="text-xs text-slate-500">
                    {h.code} · {etf?.category ?? '목록에 없음'}
                    {etf?.feePct != null && ` · 보수 ${etf.feePct}%`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums">{won(h.value)}</div>
                  <div className={`text-xs tabular-nums ${gainColor(h.gain)}`}>
                    {signedWon(h.gain)} ({pct(h.gainPct)})
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <WeightBar pct={h.weightPct} target={targetSum ? (h.targetPct / targetSum) * 100 : undefined} />
                <div className="mt-1 text-xs text-slate-500 tabular-nums">
                  지금 {h.weightPct.toFixed(1)}% · 목표 {targetLabel(targetSum ? (h.targetPct / targetSum) * 100 : 0)}
                </div>
                <Changes p={p} code={h.code} />
              </div>
            </button>
            {open === h.code && <Detail p={p} h={h} etf={etf} onDone={() => setOpen(undefined)} />}
          </Card>
        )
      })}

      {adding ? (
        <Card title="종목 추가">
          <EtfForm p={p} onDone={() => setAdding(false)} />
        </Card>
      ) : (
        <Button className="w-full" onClick={() => setAdding(true)}>
          + 종목 추가
        </Button>
      )}
    </section>
  )
}

function Changes({ p, code }: { p: Portfolio; code: string }) {
  const periods: [string, number][] = [
    ['1개월', 30],
    ['3개월', 91],
    ['1년', 365],
  ]
  const shown = periods.map(([label, days]) => [label, priceChange(p.book, code, p.today, days)] as const).filter(([, c]) => c != null)
  if (!shown.length) return null
  return (
    <div className="mt-0.5 flex gap-3 text-xs text-slate-500 tabular-nums">
      {shown.map(([label, c]) => (
        <span key={label} className="whitespace-nowrap">
          {label} <span className={gainColor(c!)}>{pct(c!)}</span>
        </span>
      ))}
    </div>
  )
}

function Detail({ p, h, etf, onDone }: { p: Portfolio; h: Holding; etf?: Etf; onDone: () => void }) {
  const [editing, setEditing] = useState(false)
  const series = p.book.get(h.code) ?? []
  return (
    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <Item label="보유" value={`${h.qty.toLocaleString('ko-KR')}주`} />
        <Item label="평균단가" value={won(h.avgPrice)} />
        <Item label="현재가" value={won(h.price)} sub={h.priceDate?.replaceAll('-', '.')} />
        <Item label="매수원가" value={won(h.cost)} />
        <Item label="실현손익" value={signedWon(h.realized)} />
        <Item label="분배금" value={won(h.dividends)} />
      </dl>
      {series.length >= 2 && (
        <TrendChart
          height={150}
          data={series.map((s) => ({ date: s.date, value: s.price, ref: h.avgPrice || undefined }))}
          axis={(v) => v.toLocaleString('ko-KR')}
          format={(d) => `${d.date.replaceAll('-', '.')} · ${won(d.value)}${h.avgPrice ? ` (평균단가 ${won(h.avgPrice)})` : ''}`}
        />
      )}
      {etf?.memo && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{etf.memo}</p>}
      {editing && etf ? (
        <EtfForm p={p} etf={etf} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex gap-2">
          {etf && (
            <Button kind="secondary" className="flex-1" onClick={() => setEditing(true)}>
              수정·목표 비중
            </Button>
          )}
          {etf && h.qty === 0 && (
            <Button
              kind="danger"
              onClick={async () => {
                if (!confirm(`${etf.name}을(를) 목록에서 지울까요? 가격 기록도 지워집니다.`)) return
                await deleteEtf(etf.code)
                onDone()
              }}
            >
              삭제
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function Item({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-slate-400">{sub}</dd>}
    </div>
  )
}

function EtfForm({ p, etf, onDone }: { p: Portfolio; etf?: Etf; onDone: () => void }) {
  const [code, setCode] = useState(etf?.code ?? '')
  const [name, setName] = useState(etf?.name ?? '')
  const [category, setCategory] = useState<Category>(etf?.category ?? '해외주식')
  const [risky, setRisky] = useState(etf?.risky ?? RISKY_BY_DEFAULT['해외주식'])
  const [targetPct, setTargetPct] = useState<number | undefined>(etf?.targetPct)
  const [feePct, setFeePct] = useState<number | undefined>(etf?.feePct)
  const [memo, setMemo] = useState(etf?.memo ?? '')
  // 지금 이미 갖고 있는 수량 (처음 등록할 때만)
  const [qty, setQty] = useState<number>()
  const [avg, setAvg] = useState<number>()
  const [heldSince, setHeldSince] = useState(p.today)
  const [err, setErr] = useState('')
  const [found, setFound] = useState('')

  // 6자리 코드를 넣으면 이름·분류를 채움 (받아 둔 전체 ETF 목록에서)
  const lookup = async (c: string) => {
    if (etf || c.trim().length !== 6) return
    try {
      const hit = await lookupEtf(c)
      if (!hit) return setFound('목록에 없는 코드입니다. 이름을 직접 넣으세요.')
      setName((n) => n || hit.name)
      setCategory(hit.category)
      setRisky(RISKY_BY_DEFAULT[hit.category])
      setFound(`${hit.name} — 이름·분류를 채웠습니다. 혼합형이면 분류를 확인하세요.`)
    } catch {
      setFound('')
    }
  }

  const others = p.etfs.filter((e) => e.code !== etf?.code)
  const otherSum = others.reduce((s, e) => s + e.targetPct, 0)
  const check = etf ? undefined : checkNewFund({ category, feePct }, others)

  const save = async () => {
    const c = code.trim()
    if (!c || !name.trim()) return setErr('종목코드와 이름을 넣으세요.')
    if (!etf && p.etfs.some((e) => e.code === c)) return setErr('이미 있는 종목코드입니다.')
    await db.transaction('rw', db.etfs, db.entries, db.prices, async () => {
      await db.etfs.put({
        code: c,
        name: name.trim(),
        category,
        risky,
        targetPct: targetPct ?? 0,
        feePct: feePct || undefined,
        memo: memo.trim() || undefined,
        createdAt: etf?.createdAt ?? Date.now(),
      })
      if (!etf && qty && avg) {
        await db.entries.add({ date: heldSince, kind: 'buy', code: c, qty, price: avg, opening: true, memo: '앱 시작 전 보유' })
      }
    })
    // get the new fund's price history right away
    if (!etf) syncMarket([c], true).catch(() => {})
    onDone()
  }

  const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900'
  return (
    <div className="space-y-3 text-xs text-slate-500">
      <div className="grid grid-cols-3 gap-2">
        <label>
          종목코드
          <input className={input} value={code} disabled={!!etf} inputMode="numeric" placeholder="360750" onChange={(e) => {
              setCode(e.target.value)
              lookup(e.target.value)
            }} />
        </label>
        <label className="col-span-2">
          이름
          <input className={input} value={name} placeholder="예: TIGER 미국S&P500" onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      {found && <p className="text-indigo-700">{found}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label>
          분류
          <select
            className={input}
            value={category}
            onChange={(e) => {
              const c = e.target.value as Category
              setCategory(c)
              setRisky(RISKY_BY_DEFAULT[c])
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div>
          총보수 (연 %)
          <NumberInput className="mt-1" value={feePct} onChange={setFeePct} decimals suffix="%" placeholder="0.07" />
        </div>
      </div>
      <div className="grid grid-cols-2 items-end gap-2">
        <div>
          목표 비중
          <NumberInput className="mt-1" value={targetPct} onChange={setTargetPct} decimals suffix="%" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={risky} onChange={(e) => setRisky(e.target.checked)} />
          위험자산 (IRP·DC 70% 한도)
        </label>
      </div>
      <p>
        다른 종목 목표 합 {otherSum}% → 이 종목 {Math.max(0, 100 - otherSum)}%면 합이 100%입니다.
        {otherSum > 0 && targetPct != null && otherSum + targetPct !== 100 && ' 나머지 종목의 목표도 함께 조정하세요.'}
      </p>
      {!etf && (
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">지금 이미 갖고 있다면 (선택)</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              수량
              <NumberInput className="mt-1" value={qty} onChange={setQty} suffix="주" />
            </div>
            <div>
              평균단가
              <NumberInput className="mt-1" value={avg} onChange={setAvg} suffix="원" />
            </div>
            <label>
              기준일
              <input type="date" className={input} value={heldSince} onChange={(e) => setHeldSince(e.target.value)} />
            </label>
          </div>
          <p className="mt-2">ETF로 전환한 잔고입니다. 수량 × 평균단가가 "넣은 돈"으로 잡힙니다.</p>
        </div>
      )}
      <label className="block">
        메모 (추종 지수, 고른 이유 등)
        <textarea className={input} rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </label>
      {check && (
        <div>
          <div className="mb-1 text-sm font-semibold text-slate-700">기존 종목에 넣을까, 새 종목을 살까</div>
          <Tips tips={check.tips} />
        </div>
      )}
      {p.settings.accountType === 'saving' && !etf && <p>연금저축에서는 레버리지·인버스 ETF를 살 수 없습니다.</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={save}>
          저장
        </Button>
        <Button kind="secondary" onClick={onDone}>
          취소
        </Button>
      </div>
    </div>
  )
}
