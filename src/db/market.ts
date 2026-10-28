import type { Candidate } from '../calc/discover'
import type { Category } from '../model'
import { db } from './db'

// Daily closes published next to the app by the nightly GitHub Actions job (scripts/fetch_prices.mjs).
const BASE = `${import.meta.env.BASE_URL}prices/`
/** 마지막으로 받은 지 이만큼 지나면 앱을 열 때 다시 받음 */
const REFRESH_MS = 3 * 60 * 60 * 1000

export interface MarketIndex {
  updatedAt: string
  items: [code: string, name: string, tab: number, aum?: number][]
}

export interface MarketAll {
  updatedAt: string
  dates: string[]
  /** closes는 dates와 같은 순서, 그날 가격이 없으면 null */
  items: [code: string, name: string, tab: number, aum: number, amount: number, closes: (number | null)[]][]
}

/** 네이버 ETF 분류 → 앱 분류 */
const TAB_CATEGORY: Record<number, Category> = { 1: '국내주식', 2: '국내주식', 3: '기타', 4: '해외주식', 5: '금·원자재', 6: '채권', 7: '기타' }

let indexCache: Promise<MarketIndex> | undefined
export function marketIndex(): Promise<MarketIndex> {
  indexCache ??= fetch(`${BASE}index.json`, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })
  indexCache.catch(() => (indexCache = undefined))
  return indexCache
}

/** 종목코드 → 이름·분류 (종목 추가할 때 자동 채움) */
export async function lookupEtf(code: string): Promise<{ name: string; category: Category } | undefined> {
  const hit = (await marketIndex()).items.find(([c]) => c === code.trim().toUpperCase())
  return hit && { name: hit[1], category: TAB_CATEGORY[hit[2]] ?? '기타' }
}

export interface SyncResult {
  updatedAt?: string
  codes: number
  points: number
  failed: string[]
}

/** 내 종목들의 종가를 받아 기기에 저장합니다. 인터넷이 없으면 저장된 것을 그대로 씁니다. */
export async function syncMarket(codes: string[], force = false): Promise<SyncResult | undefined> {
  const last = (await db.meta.get('marketFetchedAt'))?.value as number | undefined
  const known = new Set(await db.market.orderBy('code').uniqueKeys())
  // a fund with no prices yet (just added or restored) doesn't wait for the next refresh
  const fresh = !!last && Date.now() - last < REFRESH_MS && codes.every((c) => known.has(c))
  if (!codes.length || (!force && fresh)) return undefined
  indexCache = undefined
  const index = await marketIndex()
  const failed: string[] = []
  let points = 0
  await Promise.all(
    codes.map(async (code) => {
      try {
        const r = await fetch(`${BASE}${encodeURIComponent(code)}.json`, { cache: 'no-cache' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const { prices } = (await r.json()) as { prices: [string, number][] }
        await db.transaction('rw', db.market, async () => {
          await db.market.where('code').equals(code).delete()
          await db.market.bulkPut(prices.map(([date, price]) => ({ code, date, price })))
        })
        points += prices.length
      } catch {
        failed.push(code)
      }
    }),
  )
  await db.meta.bulkPut([
    { key: 'marketFetchedAt', value: Date.now() },
    { key: 'marketUpdatedAt', value: index.updatedAt },
  ])
  return { updatedAt: index.updatedAt, codes: codes.length - failed.length, points, failed }
}

export async function marketUpdatedAt(): Promise<string | undefined> {
  return (await db.meta.get('marketUpdatedAt'))?.value as string | undefined
}

/** 상장 ETF 전체의 6개월 종가 (새종목 추천용, 약 1MB라 필요할 때만 받음) */
export async function loadAllEtfs(): Promise<{ updatedAt: string; candidates: Candidate[] }> {
  const r = await fetch(`${BASE}all.json`, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const all = (await r.json()) as MarketAll
  return {
    updatedAt: all.updatedAt,
    candidates: all.items.map(([code, name, tab, , amount, closes]) => ({
      code,
      name,
      tab,
      amount,
      series: closes.flatMap((price, i) => (price ? [{ code, date: all.dates[i], price }] : [])),
    })),
  }
}
