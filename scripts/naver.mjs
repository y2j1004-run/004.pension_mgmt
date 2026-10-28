// Parsing for Naver Finance responses, kept apart from the network code so it can be tested.

/** etfItemList.nhn → [{ code, name, tab }] (tab: 1 국내지수 2 국내업종·테마 3 국내파생 4 해외주식 5 원자재 6 채권 7 기타) */
export function parseEtfList(json) {
  const list = json?.result?.etfItemList
  if (!Array.isArray(list)) throw new Error('unexpected ETF list response')
  return list.filter((it) => it.itemcode && it.itemname).map((it) => ({ code: String(it.itemcode), name: String(it.itemname), tab: Number(it.etfTabCode) || 0 }))
}

/** fchart sise.nhn XML (<item data="20261028|open|high|low|close|volume" />) → [['2026-10-28', close], ...] oldest first */
export function parseDailyCloses(xml) {
  const out = []
  for (const m of xml.matchAll(/data="(\d{4})(\d{2})(\d{2})\|[^|"]*\|[^|"]*\|[^|"]*\|([\d.]+)\|/g)) {
    const close = Number(m[4])
    if (close > 0) out.push([`${m[1]}-${m[2]}-${m[3]}`, close])
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]))
}

/** Naver serves some pages as EUC-KR; read the bytes in whichever encoding gives clean text. */
export function decode(buf, contentType = '') {
  if (/euc-kr|ks_c_5601|cp949/i.test(contentType)) return new TextDecoder('euc-kr').decode(buf)
  const utf8 = new TextDecoder('utf-8').decode(buf)
  return utf8.includes('�') ? new TextDecoder('euc-kr').decode(buf) : utf8
}
