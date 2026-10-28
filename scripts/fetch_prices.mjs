// Nightly: daily closes of every listed Korean ETF for the last ~6.5 months, written next to the built app.
// Covering every ETF means the published files say nothing about which funds anyone holds.
// Usage: node scripts/fetch_prices.mjs <outDir>   (LIVE_URL = the deployed prices/ folder, used when a fetch fails)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { avgTradingValue, buildAll, decode, parseDailyBars, parseEtfList } from './naver.mjs'

const OUT = process.argv[2] ?? 'dist/prices'
const LIVE = process.env.LIVE_URL?.replace(/\/$/, '')
const COUNT = 140 // trading days, a bit over 6 months
const CONCURRENCY = 4
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (pension-mgmt price snapshot)', Referer: 'https://finance.naver.com/' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return decode(await res.arrayBuffer(), res.headers.get('content-type') ?? '')
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${e.message}`)
      await sleep(1000 * i)
    }
  }
}

async function live(path) {
  if (!LIVE) throw new Error('no LIVE_URL')
  return JSON.parse(await get(`${LIVE}/${path}`, 2))
}

async function etfList() {
  try {
    return parseEtfList(JSON.parse(await get('https://finance.naver.com/api/sise/etfItemList.nhn')))
  } catch (e) {
    console.warn(`ETF list failed (${e.message}); using the published list`)
    return (await live('index.json')).items.map(([code, name, tab, aum]) => ({ code, name, tab, aum }))
  }
}

const items = await etfList()
mkdirSync(OUT, { recursive: true })
let fresh = 0
let reused = 0
const missing = []
const all = []
const queue = [...items]
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let it; (it = queue.shift()); ) {
      let prices
      let amount = 0
      try {
        const bars = parseDailyBars(await get(`https://fchart.stock.naver.com/sise.nhn?symbol=${it.code}&timeframe=day&count=${COUNT}&requestType=0`))
        if (!bars.length) throw new Error('no prices')
        prices = bars.map(([date, close]) => [date, close])
        amount = avgTradingValue(bars)
        fresh++
      } catch (e) {
        try {
          const old = await live(`${it.code}.json`)
          prices = old.prices
          amount = old.amount ?? 0
          reused++
        } catch {
          missing.push(`${it.code} ${it.name}: ${e.message}`)
          continue
        }
      }
      writeFileSync(join(OUT, `${it.code}.json`), JSON.stringify({ code: it.code, prices, amount }))
      all.push({ ...it, amount, prices })
      await sleep(100)
    }
  }),
)

const updatedAt = new Date().toISOString()
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ updatedAt, count: items.length, items: items.map((it) => [it.code, it.name, it.tab, it.aum ?? 0]) }))
// every fund in one file, for screening new funds in the app
writeFileSync(join(OUT, 'all.json'), JSON.stringify(buildAll(all, updatedAt)))
console.log(`ETFs ${items.length}: fetched ${fresh}, reused published ${reused}, missing ${missing.length}`)
for (const m of missing.slice(0, 20)) console.log(`  missing ${m}`)
// a run that got almost nothing should show up red in Actions (the app is still deployed)
if (fresh < items.length / 2) process.exit(1)
