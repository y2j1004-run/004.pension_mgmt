import { useMemo, useState } from 'react'
import { compositeSeries, discover, DISCOVER_STYLE_LABEL, MIN_AMOUNT, MIN_DAYS, TAB_LABEL, type Candidate, type DiscoverStyle } from '../calc/discover'
import { loadAllEtfs } from '../db/market'
import { gainColor, pct } from '../format'
import type { Category } from '../model'
import type { Portfolio } from '../usePortfolio'
import { Button, Card, Segmented } from './ui'

const TAB_TO_CATEGORY: Record<number, Category> = { 1: '국내주식', 2: '국내주식', 3: '기타', 4: '해외주식', 5: '금·원자재', 6: '채권', 7: '기타' }
const CATEGORY_TABS: Record<Category, number[]> = {
  국내주식: [1, 2],
  해외주식: [4],
  채권: [6],
  '금·원자재': [5],
  리츠: [7],
  '혼합·TDF': [7],
  현금성: [],
  기타: [3, 7],
}

// 갖고 있지 않은 ETF 중 최근 6개월 데이터로 5개를 골라 이유와 함께 보여 줍니다.
export default function DiscoverCard({ p, onAdd }: { p: Portfolio; onAdd: (code: string) => void }) {
  const [data, setData] = useState<{ updatedAt: string; candidates: Candidate[] }>()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [style, setStyle] = useState<DiscoverStyle>('balanced')
  const [open, setOpen] = useState<string>()
  const { etfs, book, summary, today } = p

  const result = useMemo(() => {
    if (!data) return undefined
    const portfolio = compositeSeries(summary.holdings.map((h) => ({ series: book.get(h.code) ?? [], weight: h.value })))
    const heldTabs = new Set(etfs.flatMap((e) => CATEGORY_TABS[e.category]))
    const heldSeries = summary.holdings.filter((h) => h.qty > 0).map((h) => book.get(h.code) ?? [])
    return discover({ candidates: data.candidates, held: new Set(etfs.map((e) => e.code)), portfolio, heldSeries, heldTabs, end: today, style })
  }, [data, etfs, book, summary, today, style])

  const load = async () => {
    setLoading(true)
    setErr('')
    try {
      setData(await loadAllEtfs())
    } catch {
      setErr('ETF 데이터를 받지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도하세요.')
    }
    setLoading(false)
  }

  return (
    <Card title="새종목 추천 (최근 6개월)">
      {!data ? (
        <>
          <p className="text-sm text-slate-600">
            상장 ETF 전체에서 갖고 있지 않은 종목을 최근 6개월 수익률·변동성·낙폭·추세, 그리고 내 포트폴리오와 얼마나 다르게 움직이는지로 비교해 5개를 골라 드립니다.
          </p>
          <Button className="mt-3 w-full" disabled={loading} onClick={load}>
            {loading ? 'ETF 전체 데이터 받는 중… (약 1MB)' : '추천 받기'}
          </Button>
        </>
      ) : (
        <>
          <Segmented value={style} onChange={setStyle} options={(Object.keys(DISCOVER_STYLE_LABEL) as DiscoverStyle[]).map((s) => ({ id: s, label: DISCOVER_STYLE_LABEL[s] }))} />
          <p className="mt-2 text-xs text-slate-500">
            {style === 'trend' && '최근 6개월 위험 대비 성과와 추세를 가장 크게 봅니다.'}
            {style === 'balanced' && '성과·추세·낙폭과 분산 효과를 고루 봅니다.'}
            {style === 'diversify' && '내 포트폴리오와 다르게 움직이는 종목을 가장 크게 봅니다.'}
            {result && ` 전체 ${result.total.toLocaleString('ko-KR')}개 중 조건을 통과한 ${result.screened.toLocaleString('ko-KR')}개를 비교했습니다.`}
          </p>
          <ol className="mt-3 space-y-3">
            {result?.picks.map((x, i) => (
              <li key={x.code} className="rounded-xl border border-slate-200 p-3">
                <button className="w-full text-left" onClick={() => setOpen(open === x.code ? undefined : x.code)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {i + 1}. {x.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {x.code} · {TAB_LABEL[x.tab] ?? '기타'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm tabular-nums">
                      <div className={`font-semibold ${gainColor(x.stats.ret6m)}`}>{pct(x.stats.ret6m)}</div>
                      <div className="text-xs text-slate-500">6개월</div>
                    </div>
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                    {(open === x.code ? x.reasons : x.reasons.slice(0, 2)).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  {x.cautions.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                      {x.cautions.map((c) => (
                        <li key={c}>⚠️ {c}</li>
                      ))}
                    </ul>
                  )}
                  {open !== x.code && x.reasons.length > 2 && <div className="mt-1 text-xs text-indigo-700">이유 더 보기</div>}
                </button>
                <Button kind="secondary" className="mt-2 w-full text-sm" onClick={() => onAdd(x.code)}>
                  이 종목 추가 ({TAB_TO_CATEGORY[x.tab] ?? '기타'})
                </Button>
              </li>
            ))}
          </ol>
          {result && !result.picks.length && <p className="mt-3 text-sm text-slate-600">조건을 통과한 종목이 없습니다.</p>}
          <p className="mt-3 text-xs text-slate-500">
            {new Date(data.updatedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 종가 기준. 제외: 갖고 있는 종목, 레버리지·인버스(연금저축에서 매수 불가), 머니마켓·초단기채 같은 현금성,
            갖고 있는 종목과 사실상 같은 지수(상관계수 0.95 이상), 거래일 {MIN_DAYS}일 미만, 하루 거래대금 {MIN_AMOUNT}억원 미만.
          </p>
        </>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        지난 6개월 가격만으로 고른 후보입니다. 총보수·추종 지수·구성 종목은 앱이 알 수 없으니 운용사 홈페이지에서 꼭 확인하세요. 지난 성과가 앞으로도 이어진다는 보장은 없으며 투자 권유가 아닙니다.
      </p>
    </Card>
  )
}
