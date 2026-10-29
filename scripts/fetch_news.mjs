// Nightly: recent headlines for each theme in scripts/news.mjs, written next to the built app.
// Usage: node scripts/fetch_news.mjs <outDir>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHANNELS, extractChannelId, googleNewsUrl, parseRss, parseYoutubeFeed, recent, THEMES, youtubeFeedUrl, youtubeHandleUrl, youtubeUploadsUrl } from './news.mjs'

const OUT = process.argv[2] ?? 'dist/prices'
const now = Date.now()
const themes = []
for (const t of THEMES) {
  try {
    const res = await fetch(googleNewsUrl(t.query), { headers: { 'User-Agent': 'Mozilla/5.0 (pension-mgmt news)' }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    themes.push({ id: t.id, label: t.label, items: recent(parseRss(await res.text()), now) })
  } catch (e) {
    console.warn(`${t.label}: ${e.message}`)
    themes.push({ id: t.id, label: t.label, items: [] })
  }
  await new Promise((r) => setTimeout(r, 300))
}
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9' }
const getText = async (url) => {
  const res = await fetch(url, { headers: BROWSER, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

/** 채널 영상 목록: 적어 둔 ID → 핸들 페이지에서 찾은 ID → 업로드 재생목록 순으로 시도 */
async function channelVideos(c) {
  const ids = [c.channelId]
  try {
    const found = extractChannelId(await getText(youtubeHandleUrl(c.handle)))
    if (found && found !== c.channelId) {
      console.log(`${c.label}: the handle page says ${found} (configured ${c.channelId})`)
      ids.unshift(found)
    }
  } catch (e) {
    console.warn(`${c.label}: handle page ${e.message}`)
  }
  const errors = []
  for (const id of ids) {
    for (const url of [youtubeFeedUrl(id), youtubeUploadsUrl(id)]) {
      try {
        const items = parseYoutubeFeed(await getText(url))
        console.log(`${c.label}: ${items.length} videos from ${url}`)
        return items
      } catch (e) {
        errors.push(`${url} ${e.message}`)
      }
    }
  }
  throw new Error(errors.join('; '))
}

const channels = []
for (const c of CHANNELS) {
  try {
    // a channel posts a few times a day; three days gives the last handful
    channels.push({ id: c.id, label: c.label, items: recent(await channelVideos(c), now, 6, 72) })
  } catch (e) {
    console.warn(`${c.label}: ${e.message}`)
    channels.push({ id: c.id, label: c.label, items: [] })
  }
}
writeFileSync(join(OUT, 'news.json'), JSON.stringify({ updatedAt: new Date(now).toISOString(), themes, channels }))
console.log(`channels: ${channels.map((c) => `${c.label} ${c.items.length} videos${c.items[0] ? ` (latest: ${c.items[0].title})` : ''}`).join('; ')}`)
const total = themes.reduce((s, t) => s + t.items.length, 0)
console.log(`news.json: ${total} headlines in ${themes.filter((t) => t.items.length).length}/${themes.length} themes; e.g. ${themes[0].items[0]?.title ?? '-'}`)
if (!total) process.exit(1)
