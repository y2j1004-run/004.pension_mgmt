import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { briefing, type FundDay } from '../calc/brief'
import { MARKET_THEMES, relatedThemes, videoTopics, type Headline } from '../calc/news'
import { storedBrief, storedNews } from '../db/market'
import { gainColor, pct, signedWon } from '../format'
import type { PricePoint } from '../model'
import type { Portfolio } from '../usePortfolio'
import { Card } from './ui'

const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
const ago = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3600_000)
  return h < 1 ? '방금' : h < 24 ? `${h}시간 전` : `${Math.round(h / 24)}일 전`
}

// 가장 최근 거래일의 장 마감 결과: 내 ETF 손익과 특이 사항, 시장 흐름, 관련 뉴스
export default function BriefCard({ p }: { p: Portfolio }) {
  const market = useLiveQuery(storedBrief)
  const news = useLiveQuery(storedNews)
  const [all, setAll] = useState(false)
  const [moreNews, setMoreNews] = useState(false)

  const b = useMemo(() => {
    // trading-day closes only, so a price typed in on a weekend doesn't count as a session
    const byCode = new Map<string, PricePoint[]>()
    for (const pt of p.market) byCode.set(pt.code, [...(byCode.get(pt.code) ?? []), pt])
    for (const list of byCode.values()) list.sort((a, c) => a.date.localeCompare(c.date))
    return briefing(
      p.summary.holdings.map((h) => ({ code: h.code, name: h.name, qty: h.qty })),
      byCode,
    )
  }, [p.market, p.summary])

  if (!b) return null
  const funds = all ? b.funds : b.funds.slice(0, 5)
  const related = news ? relatedThemes(b.funds.map((f) => f.name), news) : []
  const marketNews = news?.themes.filter((t) => MARKET_THEMES.includes(t.id) && t.items.length) ?? []

  return (
    <Card
      title={`📰 ${dayLabel(b.date)} 장 마감 브리핑`}
      right={
        b.weekChange != null && (
          <span className={`text-xs tabular-nums ${gainColor(b.weekChange)}`}>
            5일 {pct(b.weekChange)}
          </span>
        )
      }
    >
      <p className={`text-lg font-semibold tabular-nums ${gainColor(b.pnl)}`}>
        {signedWon(b.pnl)} ({pct(b.change, 2)})
      </p>
      <p className="mt-1 text-sm text-slate-700">{b.headline}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {b.lead && <Mover label={b.pnl >= 0 ? '가장 크게 올린 종목' : '가장 크게 내린 종목'} f={b.lead} />}
        {b.against && <Mover label="반대로 움직인 종목" f={b.against} />}
      </ul>

      <h3 className="mt-4 mb-1 text-xs font-semibold text-slate-500">종목별</h3>
      <ul className="divide-y divide-slate-100">
        {funds.map((f) => (
          <li key={f.code} className="py-2">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{f.name}</span>
              <span className={`shrink-0 tabular-nums ${gainColor(f.change)}`}>
                {pct(f.change)} <span className="text-xs">({signedWon(f.pnl)})</span>
              </span>
            </div>
            {f.signals.length > 0 && <p className="mt-0.5 text-xs text-amber-800">{f.signals.join(' ')}</p>}
          </li>
        ))}
      </ul>
      {b.funds.length > 5 && (
        <button className="mt-1 text-xs text-indigo-700" onClick={() => setAll(!all)}>
          {all ? '접기' : `${b.funds.length - 5}종목 더 보기`}
        </button>
      )}
      {b.missing.length > 0 && <p className="mt-1 text-xs text-slate-400">이날 가격이 없는 종목: {b.missing.join(', ')}</p>}

      {market && (
        <>
          <h3 className="mt-4 mb-1 text-xs font-semibold text-slate-500">
            ETF 시장{market.date !== b.date && ` (${dayLabel(market.date)})`} · 상승 {market.up.toLocaleString('ko-KR')} · 하락 {market.down.toLocaleString('ko-KR')}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {market.groups
              .filter(([, , n]) => n > 0)
              .map(([name, change]) => (
                <span key={name} className="rounded-lg bg-slate-50 px-2 py-1 text-xs">
                  {name} <span className={`tabular-nums ${gainColor(change)}`}>{pct(change)}</span>
                </span>
              ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
            <TopList title="많이 오른 ETF" rows={market.gainers.slice(0, 3)} />
            <TopList title="많이 내린 ETF" rows={market.losers.slice(0, 3)} />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">분류별은 중앙값, 상위·하위는 하루 거래대금 5억원 이상(레버리지·인버스 제외)</p>
        </>
      )}

      {news && (marketNews.length > 0 || related.length > 0) && (
        <>
          <h3 className="mt-4 mb-1 text-xs font-semibold text-slate-500">언론 보도 · {ago(news.updatedAt)} 수집</h3>
          {marketNews.map((t) => (
            <NewsGroup key={t.id} label={t.label} items={t.items.slice(0, moreNews ? 4 : 2)} />
          ))}
          {related.slice(0, moreNews ? undefined : 3).map((t) => (
            <NewsGroup key={t.id} label={`${t.label} — ${t.funds.length === 1 ? t.funds[0] : `${t.funds[0]} 외 ${t.funds.length - 1}`}`} items={t.items.slice(0, moreNews ? 4 : 2)} />
          ))}
          <button className="mt-1 text-xs text-indigo-700" onClick={() => setMoreNews(!moreNews)}>
            {moreNews ? '뉴스 접기' : '뉴스 더 보기'}
          </button>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Google 뉴스 검색에서 정해진 주제(시장·업종)별로 모은 제목입니다. 기사 속 전망은 언론사·필자의 의견이니 참고만 하세요.
          </p>
        </>
      )}

      {news?.channels
        ?.filter((c) => c.items.length)
        .map((c) => (
          <div key={c.id}>
            <h3 className="mt-4 mb-1 text-xs font-semibold text-slate-500">▶ 유튜브 · {c.label} 최근 영상</h3>
            <ul className="space-y-2">
              {c.items.slice(0, moreNews ? 6 : 3).map((v) => {
                const topics = videoTopics(v.title, b.funds.map((f) => f.name), news)
                return (
                  <li key={v.link} className="text-sm leading-snug">
                    <a href={v.link} target="_blank" rel="noopener noreferrer" className="text-slate-900 underline decoration-slate-300 underline-offset-2">
                      {v.title}
                    </a>
                    <span className="ml-1 text-xs text-slate-400">{ago(v.date)}</span>
                    {topics.length > 0 && <span className="ml-1 rounded bg-indigo-50 px-1 text-[11px] text-indigo-700">내 종목: {topics.join(', ')}</span>}
                    {v.summary && <p className="mt-0.5 text-xs text-slate-500">{v.summary}</p>}
                  </li>
                )
              })}
            </ul>
            <p className="mt-1 text-[11px] text-slate-400">채널의 공개 영상 목록에서 가져온 제목·소개 문구입니다. 영상 속 의견은 진행자의 견해이니 참고만 하세요.</p>
          </div>
        ))}
    </Card>
  )
}

function Mover({ label, f }: { label: string; f: FundDay }) {
  return (
    <li className="flex justify-between gap-2">
      <span className="min-w-0 truncate text-slate-600">
        {label}: <span className="text-slate-900">{f.name}</span>
      </span>
      <span className={`shrink-0 tabular-nums ${gainColor(f.pnl)}`}>{signedWon(f.pnl)}</span>
    </li>
  )
}

function TopList({ title, rows }: { title: string; rows: [string, string, number][] }) {
  return (
    <div>
      <div className="mb-0.5 text-slate-500">{title}</div>
      <ol className="space-y-0.5">
        {rows.map(([code, name, change]) => (
          <li key={code} className="flex justify-between gap-1">
            <span className="min-w-0 truncate">{name}</span>
            <span className={`shrink-0 tabular-nums ${gainColor(change)}`}>{pct(change)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function NewsGroup({ label, items }: { label: string; items: Headline[] }) {
  return (
    <div className="mt-2">
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <ul className="mt-0.5 space-y-1">
        {items.map((h) => (
          <li key={h.link} className="text-sm leading-snug">
            <a href={h.link} target="_blank" rel="noopener noreferrer" className="text-slate-900 underline decoration-slate-300 underline-offset-2">
              {h.title}
            </a>
            <span className="ml-1 text-xs text-slate-400">
              {h.source} · {ago(h.date)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
