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
