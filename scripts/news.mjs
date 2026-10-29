// News headlines by theme for the app's closing briefing.
// The themes are a fixed list (the same for everyone), so the published file says nothing about anyone's funds;
// the app matches each fund to themes on the phone (src/calc/news.ts).

export const THEMES = [
  { id: 'kospi', label: '국내 증시', query: '코스피 마감' },
  { id: 'kosdaq', label: '코스닥', query: '코스닥 마감' },
  { id: 'us', label: '뉴욕 증시', query: '뉴욕증시 마감' },
  { id: 'semi', label: '반도체', query: '반도체 주가' },
  { id: 'nvidia', label: '엔비디아', query: '엔비디아 주가' },
  { id: 'google', label: '구글', query: '구글 알파벳 주가' },
  { id: 'tesla', label: '테슬라', query: '테슬라 주가' },
  { id: 'palantir', label: '팔란티어', query: '팔란티어 주가' },
  { id: 'power', label: 'AI 전력 인프라', query: 'AI 전력 인프라' },
  { id: 'gold', label: '금', query: '국제 금값' },
  { id: 'rates', label: '금리·채권', query: '미국 국채 금리' },
  { id: 'fx', label: '환율', query: '원달러 환율' },
  { id: 'dividend', label: '배당', query: '고배당주 주주환원' },
  { id: 'etf', label: 'ETF 시장', query: 'ETF 순자산 자금 유입' },
]

const decodeEntities = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .trim()

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m ? decodeEntities(m[1]) : ''
}

/** Google News RSS → [{ title, source, link, date }] newest first; "제목 - 언론사"에서 언론사를 떼어 냄 */
export function parseRss(xml) {
  const items = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1]
    const source = tag(body, 'source')
    let title = tag(body, 'title')
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3))
    const time = Date.parse(tag(body, 'pubDate'))
    const link = tag(body, 'link')
    if (title && link && Number.isFinite(time)) items.push({ title, source, link, date: new Date(time).toISOString() })
  }
  return items.sort((a, b) => b.date.localeCompare(a.date))
}

/** 최근 hours시간 안의 기사, 같은 제목은 하나만, 최대 n개 */
export function recent(items, now, n = 5, hours = 36) {
  const since = now - hours * 3600_000
  const seen = new Set()
  return items
    .filter((it) => Date.parse(it.date) >= since)
    .filter((it) => {
      const key = it.title.replace(/\s+/g, '').slice(0, 30)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, n)
}

export const googleNewsUrl = (query) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:2d`)}&hl=ko&gl=KR&ceid=KR:ko`

/** 참고하는 유튜브 채널 (채널의 공개 새 영상 피드) */
// 예: { id: 'example', label: '채널 이름', handle: 'example', channelId: 'UC…' } — 지금은 참고하는 채널 없음
export const CHANNELS = []

export const youtubeFeedUrl = (channelId) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
/** 채널의 '업로드' 재생목록 피드 (UC… → UU…) — 채널 피드가 안 될 때 */
export const youtubeUploadsUrl = (channelId) => `https://www.youtube.com/feeds/videos.xml?playlist_id=UU${channelId.slice(2)}`
export const youtubeHandleUrl = (handle) => `https://www.youtube.com/@${handle}`

/** 채널 페이지 HTML에서 채널 ID (UC로 시작하는 24자) */
export function extractChannelId(html) {
  return (
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ??
    html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ??
    html.match(/"channelId":"(UC[\w-]{22})"/)?.[1]
  )
}

/** 설명 첫 줄을 짧게 (링크·해시태그 빼고) */
function snippet(text, max = 120) {
  const line =
    text
      .split('\n')
      .map((l) => l.replace(/https?:\/\/\S+/g, '').replace(/#\S+/g, '').trim())
      .find((l) => l.length >= 10) ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** YouTube 채널 피드(Atom) → [{ title, link, date, summary }] newest first */
export function parseYoutubeFeed(xml) {
  const items = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = m[1]
    const title = tag(body, 'title')
    const link = body.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] ?? ''
    const time = Date.parse(tag(body, 'published'))
    if (title && link && Number.isFinite(time)) items.push({ title, link: decodeEntities(link), date: new Date(time).toISOString(), summary: snippet(tag(body, 'media:description')) })
  }
  return items.sort((a, b) => b.date.localeCompare(a.date))
}
