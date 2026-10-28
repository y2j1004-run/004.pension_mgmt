import { useState } from 'react'
import { Button, Card, NumberInput, Segmented } from '../components/ui'
import { db } from '../db/db'
import { dateLabel, won } from '../format'
import type { Entry, EntryKind } from '../model'
import { usePortfolio } from '../usePortfolio'

const KIND_LABEL: Record<EntryKind, string> = { deposit: '입금', buy: '매수', sell: '매도', dividend: '분배금' }

export default function Records() {
  const p = usePortfolio()
  const [adding, setAdding] = useState(false)
  if (!p) return null
  const name = (code?: string) => p.etfs.find((e) => e.code === code)?.name ?? code ?? ''
  const months = new Map<string, Entry[]>()
  for (const e of [...p.entries].reverse()) {
    const m = e.date.slice(0, 7)
    months.set(m, [...(months.get(m) ?? []), e])
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">기록</h1>
      {adding ? (
        <Card title="기록 추가">
          <EntryForm today={p.today} codes={p.etfs.map((e) => [e.code, e.name])} onDone={() => setAdding(false)} />
        </Card>
      ) : (
        <Button className="w-full" onClick={() => setAdding(true)}>
          + 입금·매수·매도·분배금 기록
        </Button>
      )}
      {!p.entries.length && <p className="text-sm text-slate-500">아직 기록이 없습니다. 매달 불입은 💰 이번 달 불입에서 한 번에 기록됩니다.</p>}
      {[...months].map(([m, list]) => {
        const deposits = list.filter((e) => e.kind === 'deposit' && !e.opening).reduce((s, e) => s + (e.amount ?? 0), 0)
        return (
          <Card key={m} title={`${m.slice(0, 4)}년 ${Number(m.slice(5))}월`} right={deposits ? <span className="text-xs text-slate-500">입금 {won(deposits)}</span> : undefined}>
            <ul className="divide-y divide-slate-100">
              {list.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="w-14 shrink-0 text-xs text-slate-500">{dateLabel(e.date)}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                      e.kind === 'buy' ? 'bg-red-50 text-red-700' : e.kind === 'sell' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {e.opening ? '전환' : KIND_LABEL[e.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {e.code ? name(e.code) : e.memo}
                    {e.qty != null && <span className="text-xs text-slate-500"> {e.qty}주 × {won(e.price ?? 0)}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">{won(e.amount ?? (e.qty ?? 0) * (e.price ?? 0))}</span>
                  <button
                    className="shrink-0 px-1 text-slate-400"
                    aria-label="삭제"
                    onClick={() => confirm('이 기록을 지울까요?') && db.entries.delete(e.id!)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
    </section>
  )
}

function EntryForm({ today, codes, onDone }: { today: string; codes: [string, string][]; onDone: () => void }) {
  const [kind, setKind] = useState<EntryKind>('deposit')
  const [date, setDate] = useState(today)
  const [code, setCode] = useState(codes[0]?.[0])
  const [qty, setQty] = useState<number>()
  const [price, setPrice] = useState<number>()
  const [amount, setAmount] = useState<number>()
  const [fee, setFee] = useState<number>()
  const [memo, setMemo] = useState('')
  const trade = kind === 'buy' || kind === 'sell'
  const ok = trade ? !!code && !!qty && !!price : !!amount && (kind !== 'dividend' || !!code)

  const save = async () => {
    await db.entries.add(
      trade
        ? { date, kind, code, qty, price, fee: fee || undefined, memo: memo || undefined }
        : { date, kind, code: kind === 'dividend' ? code : undefined, amount, memo: memo || undefined },
    )
    onDone()
  }
  const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900'
  return (
    <div className="space-y-3 text-xs text-slate-500">
      <Segmented
        value={kind}
        onChange={setKind}
        options={(Object.keys(KIND_LABEL) as EntryKind[]).map((k) => ({ id: k, label: KIND_LABEL[k] }))}
      />
      <div className="grid grid-cols-2 gap-2">
        <label>
          날짜
          <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {kind !== 'deposit' && (
          <label>
            종목
            <select className={input} value={code} onChange={(e) => setCode(e.target.value)}>
              {codes.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {trade ? (
        <div className="grid grid-cols-3 gap-2">
          <div>
            수량
            <NumberInput className="mt-1" value={qty} onChange={setQty} suffix="주" />
          </div>
          <div>
            단가
            <NumberInput className="mt-1" value={price} onChange={setPrice} suffix="원" />
          </div>
          <div>
            수수료
            <NumberInput className="mt-1" value={fee} onChange={setFee} suffix="원" />
          </div>
        </div>
      ) : (
        <div>
          금액
          <NumberInput className="mt-1" value={amount} onChange={setAmount} suffix="원" />
        </div>
      )}
      {kind === 'deposit' && <p>매달 정기 불입 외에 추가로 넣은 돈도 여기 기록하면 세액공제 계산에 들어갑니다.</p>}
      <label className="block">
        메모
        <input className={input} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!ok} onClick={save}>
          저장
        </Button>
        <Button kind="secondary" onClick={onDone}>
          취소
        </Button>
      </div>
    </div>
  )
}
