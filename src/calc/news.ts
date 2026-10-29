export interface Headline {
  title: string
  source: string
  link: string
  date: string
}

export interface Video {
  title: string
  link: string
  date: string
  summary: string
}

export interface NewsFile {
  updatedAt: string
  themes: { id: string; label: string; items: Headline[] }[]
  /** 참고하는 유튜브 채널의 최근 영상 (없던 때의 파일에는 없음) */
  channels?: { id: string; label: string; items: Video[] }[]
}

/** 종목 이름 → 관련 뉴스 주제 (scripts/news.mjs의 THEMES id) */
const RULES: [RegExp, string[]][] = [
  [/200|코스피|KOSPI|밸류업/i, ['kospi']],
  [/코스닥|KOSDAQ/i, ['kosdaq']],
  [/미국|S&P|나스닥|다우|NASDAQ/i, ['us', 'fx']],
  [/반도체/, ['semi']],
  [/엔비디아|NVIDIA/i, ['nvidia', 'semi']],
  [/구글|알파벳/, ['google']],
  [/테슬라/, ['tesla']],
  [/팔란티어/, ['palantir']],
  [/전력|원자력|원전/, ['power']],
  [/금현물|금액티브|골드|KRX금|금선물/i, ['gold']],
  [/채권|국채|국고채|채혼합|회사채/, ['rates']],
  [/배당|주주환원|커버드콜/, ['dividend']],
]

/** 시장 전체 흐름으로 늘 보여 주는 주제 */
export const MARKET_THEMES = ['kospi', 'us']

export function themesOf(name: string): string[] {
  return [...new Set(RULES.flatMap(([re, ids]) => (re.test(name) ? ids : [])))]
}

/** 내 종목과 관련된 주제들 (시장 전체 주제 제외), 관련 종목 이름과 함께 */
export function relatedThemes(names: string[], news: NewsFile): { id: string; label: string; funds: string[]; items: Headline[] }[] {
  return news.themes
    .filter((t) => !MARKET_THEMES.includes(t.id) && t.items.length)
    .map((t) => ({ ...t, funds: names.filter((n) => themesOf(n).includes(t.id)) }))
    .filter((t) => t.funds.length)
}

/** 영상 제목이 내 종목의 주제를 다루면 그 주제 이름들 (예: 반도체, 금리·채권) */
export function videoTopics(title: string, fundNames: string[], news: NewsFile): string[] {
  const mine = new Set(fundNames.flatMap(themesOf))
  const label = new Map(news.themes.map((t) => [t.id, t.label]))
  return themesOf(title)
    .filter((id) => mine.has(id))
    .map((id) => label.get(id) ?? id)
}
