import { describe, expect, it } from 'vitest'
import { googleNewsUrl, parseRss, recent } from './news.mjs'

const rss = `<?xml version="1.0"?><rss><channel><title>x</title>
<item><title>코스피, 외국인 매수에 2% 상승 마감 - 한국경제</title><link>https://news.google.com/a</link><pubDate>Wed, 28 Oct 2026 07:10:00 GMT</pubDate><source url="https://www.hankyung.com">한국경제</source></item>
<item><title><![CDATA[반도체 &amp; AI 랠리 "계속될까" - 매일경제]]></title><link>https://news.google.com/b</link><pubDate>Wed, 28 Oct 2026 08:00:00 GMT</pubDate><source url="https://www.mk.co.kr">매일경제</source></item>
<item><title>코스피, 외국인 매수에 2% 상승 마감 - 연합뉴스</title><link>https://news.google.com/c</link><pubDate>Wed, 28 Oct 2026 07:05:00 GMT</pubDate><source url="https://www.yna.co.kr">연합뉴스</source></item>
<item><title>지난주 기사 - 조선일보</title><link>https://news.google.com/d</link><pubDate>Mon, 19 Oct 2026 07:00:00 GMT</pubDate><source url="https://www.chosun.com">조선일보</source></item>
</channel></rss>`

describe('news', () => {
  it('reads Google News RSS, splitting off the outlet name', () => {
    const items = parseRss(rss)
    expect(items[0]).toEqual({ title: '반도체 & AI 랠리 "계속될까"', source: '매일경제', link: 'https://news.google.com/b', date: '2026-10-28T08:00:00.000Z' })
    expect(items).toHaveLength(4)
  })

  it('keeps recent, distinct headlines', () => {
    const kept = recent(parseRss(rss), Date.parse('2026-10-28T09:00:00Z'))
    expect(kept.map((i) => i.source)).toEqual(['매일경제', '한국경제'])
  })

  it('builds a Korean search feed URL', () => {
    expect(googleNewsUrl('코스피 마감')).toBe('https://news.google.com/rss/search?q=%EC%BD%94%EC%8A%A4%ED%94%BC%20%EB%A7%88%EA%B0%90%20when%3A2d&hl=ko&gl=KR&ceid=KR:ko')
  })
})
