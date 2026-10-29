// Parsing for Naver Finance responses, kept apart from the network code so it can be tested.

/** etfItemList.nhn → [{ code, name, tab }] (tab: 1 국내지수 2 국내업종·테마 3 국내파생 4 해외주식 5 원자재 6 채권 7 기타) */
export function parseEtfList(json) {
  const list = json?.result?.etfItemList
  if (!Array.isArray(list)) throw new Error('unexpected ETF list response')
  return list
    .filter((it) => it.itemcode && it.itemname)
    .map((it) => ({ code: String(it.itemcode), name: String(it.itemname), tab: Number(it.etfTabCode) || 0, aum: Number(it.marketSum) || 0 }))
}

/** fchart sise.nhn XML (<item data="20261028|open|high|low|close|volume" />) → [['2026-10-28', close, volume], ...] oldest first */
export function parseDailyBars(xml) {
  const out = []
  for (const m of xml.matchAll(/data="(\d{4})(\d{2})(\d{2})\|[^|"]*\|[^|"]*\|[^|"]*\|([\d.]+)\|([\d.]*)"/g)) {
    const close = Number(m[4])
    if (close > 0) out.push([`${m[1]}-${m[2]}-${m[3]}`, close, Number(m[5]) || 0])
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]))
}

export const parseDailyCloses = (xml) => parseDailyBars(xml).map(([date, close]) => [date, close])

/** 최근 days거래일 하루 평균 거래대금 (억원) */
export function avgTradingValue(bars, days = 20) {
  const recent = bars.slice(-days)
  return recent.length ? Math.round(recent.reduce((s, [, close, vol]) => s + close * vol, 0) / recent.length / 1e6) / 100 : 0
}

/**
 * 모든 ETF의 종가를 날짜 하나의 목록에 맞춘 표 (새종목 추천에서 한 번에 받음).
 * closes는 dates와 같은 순서이고, 그날 가격이 없으면(상장 전 등) null.
 */
export function buildAll(entries, updatedAt) {
  const dates = [...new Set(entries.flatMap((e) => e.prices.map(([d]) => d)))].sort()
  const at = new Map(dates.map((d, i) => [d, i]))
  return {
    updatedAt,
    dates,
    items: entries.map((e) => {
      const closes = Array(dates.length).fill(null)
      for (const [d, c] of e.prices) closes[at.get(d)] = c
      return [e.code, e.name, e.tab, e.aum, e.amount, closes]
    }),
  }
}

/** Naver serves some pages as EUC-KR; read the bytes in whichever encoding gives clean text. */
export function decode(buf, contentType = '') {
  if (/euc-kr|ks_c_5601|cp949/i.test(contentType)) return new TextDecoder('euc-kr').decode(buf)
  const utf8 = new TextDecoder('utf-8').decode(buf)
  return utf8.includes('�') ? new TextDecoder('euc-kr').decode(buf) : utf8
}

/** 레버리지·인버스는 시장 요약의 상승·하락 상위에서 뺌 (연금저축에서 살 수 없고, 움직임이 2배로 과장됨) */
const GEARED = /레버리지|인버스|2X|곱버스/i
const TAB_NAME = { 1: '국내 시장지수', 2: '국내 업종·테마', 4: '해외주식', 5: '원자재', 6: '채권' }

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}
const round4 = (x) => Math.round(x * 10000) / 10000

/**
 * 가장 최근 거래일의 ETF 시장 요약 (앱의 장 마감 브리핑용).
 * entries: [{ code, name, tab, amount, prices: [[date, close], ...] }]
 */
export function buildBrief(entries, updatedAt, top = 5, minAmount = 5) {
  const date = entries.map((e) => e.prices.at(-1)?.[0]).filter(Boolean).sort().at(-1)
  const moves = []
  for (const e of entries) {
    const n = e.prices.length
    if (n < 2 || e.prices[n - 1][0] !== date) continue
    moves.push({ code: e.code, name: e.name, tab: e.tab, amount: e.amount, change: e.prices[n - 1][1] / e.prices[n - 2][1] - 1 })
  }
  const plain = moves.filter((m) => !GEARED.test(m.name))
  const liquid = plain.filter((m) => m.amount >= minAmount).sort((a, b) => b.change - a.change)
  const pick = (m) => [m.code, m.name, round4(m.change)]
  return {
    updatedAt,
    date,
    up: moves.filter((m) => m.change > 0).length,
    down: moves.filter((m) => m.change < 0).length,
    flat: moves.filter((m) => m.change === 0).length,
    // median of the plain (not geared) funds in each group, so one wild theme fund doesn't set the tone
    groups: Object.entries(TAB_NAME).map(([tab, name]) => {
      const xs = plain.filter((m) => m.tab === Number(tab)).map((m) => m.change)
      return [name, round4(median(xs)), xs.length]
    }),
    gainers: liquid.slice(0, top).map(pick),
    losers: liquid.slice(-top).reverse().map(pick),
  }
}
