// Nightly: recent headlines for each theme in scripts/news.mjs, written next to the built app.
// Usage: node scripts/fetch_news.mjs <outDir>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHANNELS, googleNewsUrl, parseRss, parseYoutubeFeed, recent, THEMES, youtubeFeedUrl } from './news.mjs'

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
const channels = []
for (const c of CHANNELS) {
  try {
    const res = await fetch(youtubeFeedUrl(c.channelId), { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // a channel posts a few times a day; three days gives the last handful
    channels.push({ id: c.id, label: c.label, items: recent(parseYoutubeFeed(await res.text()), now, 6, 72) })
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
